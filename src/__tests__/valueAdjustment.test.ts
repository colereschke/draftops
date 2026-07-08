import {
  computeScoringMultipliers,
  computeScarcityMultipliers,
  computeConcentrationFactor,
  adjustPlayerValues,
  type DraftValueSettings,
} from '@/lib/valueAdjustment';
import type { Player } from '@/types';
import {
  DEFAULT_SCORING_SETTINGS,
  DEFAULT_STARTING_LINEUP,
  type ScoringSettings,
  type StartingSlot,
  type Position,
} from '@/types';

const scoring = (overrides: Partial<ScoringSettings> = {}): ScoringSettings => ({
  ...DEFAULT_SCORING_SETTINGS,
  ...overrides,
});

describe('computeScoringMultipliers', () => {
  it('returns 1.0 for every position under default scoring', () => {
    const m = computeScoringMultipliers(scoring());
    expect(m.QB).toBeCloseTo(1);
    expect(m.RB).toBeCloseTo(1);
    expect(m.WR).toBeCloseTo(1);
    expect(m.TE).toBeCloseTo(1);
  });

  it('raises only TE for a TE premium, and nothing else', () => {
    const m = computeScoringMultipliers(scoring({ pprTE: 1.75 }));
    expect(m.TE).toBeGreaterThan(1);
    expect(m.RB).toBeCloseTo(1);
    expect(m.WR).toBeCloseTo(1);
    expect(m.QB).toBeCloseTo(1);
  });

  it('lets a 2x TE premium exceed the general 1.5 cap (wider TE band)', () => {
    const m = computeScoringMultipliers(scoring({ pprTE: 2.0 }));
    expect(m.TE).toBeGreaterThan(1.5);
    expect(m.TE).toBeLessThanOrEqual(1.9);
  });

  it('clamps QB/RB/WR scoring at 1.5', () => {
    const m = computeScoringMultipliers(scoring({ pprRB: 10 }));
    expect(m.RB).toBe(1.5);
  });

  it('raises QB for a passing-TD premium', () => {
    const m = computeScoringMultipliers(scoring({ passTD: 6 }));
    expect(m.QB).toBeGreaterThan(1);
  });

  it('raises QB when passing yards are worth more (lower yds/pt)', () => {
    const m = computeScoringMultipliers(scoring({ passYdsPerPoint: 20 }));
    expect(m.QB).toBeGreaterThan(1);
  });
});

const ONES: Record<Position, number> = { QB: 1, RB: 1, WR: 1, TE: 1, PICK: 1, PKG: 1 };

describe('computeScarcityMultipliers', () => {
  it('returns 1.0 for every position under the baseline lineup + flat scoring', () => {
    const m = computeScarcityMultipliers([...DEFAULT_STARTING_LINEUP], ONES);
    expect(m.QB).toBeCloseTo(1);
    expect(m.RB).toBeCloseTo(1);
    expect(m.WR).toBeCloseTo(1);
    expect(m.TE).toBeCloseTo(1);
  });

  it('raises TE more when adding a 2nd TE than adding an RB raises RB', () => {
    const twoTE: StartingSlot[] = [...DEFAULT_STARTING_LINEUP, 'TE'];
    const extraRB: StartingSlot[] = [...DEFAULT_STARTING_LINEUP, 'RB'];
    const teBump = computeScarcityMultipliers(twoTE, ONES).TE;
    const rbBump = computeScarcityMultipliers(extraRB, ONES).RB;
    expect(teBump).toBeGreaterThan(rbBump);
  });

  it('routes extra FLEX demand toward the scoring-favored position', () => {
    // Same lineup, but WR scoring richer than RB — WR should out-gain RB.
    const lineup: StartingSlot[] = [...DEFAULT_STARTING_LINEUP, 'FLEX', 'FLEX'];
    const wrFavored: Record<Position, number> = { ...ONES, WR: 1.4 };
    const m = computeScarcityMultipliers(lineup, wrFavored);
    expect(m.WR).toBeGreaterThan(m.RB);
  });

  it('never exceeds the scarcity band ceiling', () => {
    const manyTE: StartingSlot[] = [...DEFAULT_STARTING_LINEUP, 'TE', 'TE', 'TE'];
    expect(computeScarcityMultipliers(manyTE, ONES).TE).toBeLessThanOrEqual(1.6);
  });
});

describe('computeConcentrationFactor', () => {
  it('is 1.0 at the baseline of 120 starters, at any rank', () => {
    expect(computeConcentrationFactor(0, 120)).toBeCloseTo(1);
    expect(computeConcentrationFactor(1, 120)).toBeCloseTo(1);
  });

  it('lifts the top and lowers the bottom in a shallower league', () => {
    const top = computeConcentrationFactor(0, 90); // 10-team start-9
    const bottom = computeConcentrationFactor(1, 90);
    expect(top).toBeGreaterThan(1);
    expect(bottom).toBeLessThan(1);
  });

  it('leaves the median (pivot) player ~unchanged', () => {
    expect(computeConcentrationFactor(0.5, 90)).toBeCloseTo(1);
  });

  it('flattens (top down) in a deeper league', () => {
    expect(computeConcentrationFactor(0, 150)).toBeLessThan(1);
  });

  it('clamps to the concentration band', () => {
    expect(computeConcentrationFactor(0, 1)).toBeLessThanOrEqual(1.25);
    expect(computeConcentrationFactor(1, 1)).toBeGreaterThanOrEqual(0.8);
  });
});

const P = (over: Partial<Player>): Player => ({
  player: 'X',
  team: 'FA',
  pos: 'WR',
  age: 25,
  sfRank: 50,
  budget: 100,
  ceiling: 115,
  floor: 87,
  notes: '',
  ...over,
});

// Mirror the base-data derivation (src/data/players.ts) so fixtures stay self-consistent
// with the re-derivation the algorithm performs — otherwise float rounding breaks identity.
const ceil = (b: number): number => Math.round(b * 1.15);
const flr = (b: number): number => Math.max(5, Math.round(b * 0.87));
const A = (player: string, pos: Player['pos'], sfRank: number, budget: number): Player =>
  P({ player, pos, sfRank, budget, ceiling: ceil(budget), floor: flr(budget) });

const DEFAULT_SETTINGS: DraftValueSettings = {
  startingLineup: [...DEFAULT_STARTING_LINEUP],
  scoringSettings: { ...DEFAULT_SCORING_SETTINGS },
  teamCount: 12,
};

const POOL: Player[] = [
  A('QB1', 'QB', 1, 50),
  A('RB1', 'RB', 8, 40),
  A('WR1', 'WR', 3, 45),
  A('TE1', 'TE', 20, 30),
  A('TE2', 'TE', 120, 8),
  // PKG stores non-formula values on purpose — it must pass through verbatim.
  P({ player: 'Kicker Pkg', pos: 'PKG', sfRank: 999, budget: 109, ceiling: 131, floor: 75 }),
];

describe('adjustPlayerValues', () => {
  it('is the identity under default settings (adjusted == base)', () => {
    const out = adjustPlayerValues(POOL, DEFAULT_SETTINGS);
    for (let i = 0; i < POOL.length; i++) {
      expect(out[i].budget).toBe(POOL[i].budget);
      expect(out[i].ceiling).toBe(POOL[i].ceiling);
      expect(out[i].floor).toBe(POOL[i].floor);
    }
  });

  it('always records base values verbatim', () => {
    const out = adjustPlayerValues(POOL, {
      ...DEFAULT_SETTINGS,
      scoringSettings: { ...DEFAULT_SCORING_SETTINGS, pprTE: 2 },
    });
    const te1 = out.find((p) => p.player === 'TE1')!;
    expect(te1.baseBudget).toBe(30);
    expect(te1.baseCeiling).toBe(ceil(30));
    expect(te1.baseFloor).toBe(flr(30));
  });

  it('raises TE budgets under a 2x TE premium and re-derives ceiling/floor', () => {
    const out = adjustPlayerValues(POOL, {
      ...DEFAULT_SETTINGS,
      scoringSettings: { ...DEFAULT_SCORING_SETTINGS, pprTE: 2 },
    });
    const te1 = out.find((p) => p.player === 'TE1')!;
    expect(te1.budget).toBeGreaterThan(30);
    expect(te1.ceiling).toBe(Math.round(te1.budget * 1.15));
    expect(te1.floor).toBe(Math.max(5, Math.round(te1.budget * 0.87)));
  });

  it('leaves PKG/PICK verbatim even under aggressive settings', () => {
    const out = adjustPlayerValues(POOL, {
      startingLineup: [...DEFAULT_STARTING_LINEUP, 'TE'],
      scoringSettings: { ...DEFAULT_SCORING_SETTINGS, pprTE: 2 },
      teamCount: 10,
    });
    const pkg = out.find((p) => p.player === 'Kicker Pkg')!;
    expect(pkg.budget).toBe(109);
    expect(pkg.ceiling).toBe(131);
    expect(pkg.floor).toBe(75);
  });

  it('enforces budget ≥ 1 and floor ≥ 5', () => {
    const out = adjustPlayerValues([P({ player: 'Deep', pos: 'WR', sfRank: 300, budget: 1 })], {
      ...DEFAULT_SETTINGS,
      teamCount: 20,
    });
    expect(out[0].budget).toBeGreaterThanOrEqual(1);
    expect(out[0].floor).toBeGreaterThanOrEqual(5);
  });
});
