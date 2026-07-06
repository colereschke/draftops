import { computeScoringMultipliers, computeScarcityMultipliers } from '@/lib/valueAdjustment';
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
