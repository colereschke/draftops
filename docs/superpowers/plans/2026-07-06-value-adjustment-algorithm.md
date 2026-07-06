# Value Adjustment Algorithm (#5b Phase 1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adjust each per-draft player's `budget`/`ceiling`/`floor` from the base ETR values based on how the draft's league settings (starting lineup, scoring, team count) differ from the standard baseline, and wire the previously-hardcoded `ROSTER_SIZE`/`TARGET_ROSTER` constants to per-draft settings.

**Architecture:** A pure, deterministic function `adjustPlayerValues(basePlayers, settings)` computes three per-position/per-rank multipliers (scoring, lineup-scarcity, concentration) and multiplies them onto each base budget. It runs in-memory inside `createDraft` so base + adjusted values are inserted in one `createMany`. All calibration lives in one backend-only constants module. Existing drafts are left untouched (base = adjusted); only new drafts get adjustment.

**Tech Stack:** TypeScript (strict), Prisma 7 + PostgreSQL, Jest + React Testing Library, Next.js 16 App Router.

## Global Constraints

- Positions adjusted: **QB, RB, WR, TE only**. `PICK` and `PKG` pass through verbatim (no re-derivation of ceiling/floor).
- Identity: with `DEFAULT_STARTING_LINEUP`, `DEFAULT_SCORING_SETTINGS`, and `teamCount = 12`, every multiplier is exactly `1.0` and adjusted values equal base values.
- **No blanket total cap**; each force is individually clamped. TE scoring band is wider (`[0.70, 1.90]`) than QB/RB/WR (`[0.70, 1.50]`).
- Adjusted ceiling/floor for adjustable positions are re-derived: `ceiling = round(budget × 1.15)`, `floor = max(5, round(budget × 0.87))`.
- Only `createDraft` (new drafts) applies adjustment. The migration, `seed-players.ts`, and `sync-players.ts` set `base* = current budget/ceiling/floor` (1:1) so live/existing drafts never change value. There is no recompute trigger in Phase 1.
- All calibration constants are TUNABLE and live only in `src/lib/valueAdjustment.constants.ts`. Never user-facing.
- Code style: single quotes, trailing commas, 2-space indent, 100-char width. `interface` for object shapes. No explicit `any`. Run `pnpm tsc --noEmit` and `pnpm lint` before finishing.

---

## File Structure

**Create:**

- `src/lib/valueAdjustment.constants.ts` — all tunable constants (bands, coefficients, startability, elasticity).
- `src/lib/valueAdjustment.ts` — pure functions: `computeScoringMultipliers`, `computeScarcityMultipliers`, `computeConcentrationFactor`, `adjustPlayerValues` + exported types.
- `src/__tests__/valueAdjustment.test.ts` — unit tests for all of the above.

**Modify:**

- `prisma/schema.prisma` — add `baseBudget`/`baseCeiling`/`baseFloor` to `Player`.
- `prisma/migrations/<ts>_player_base_values/migration.sql` — hand-edited additive+backfill migration.
- `src/lib/actions.ts` — `createDraft` runs `adjustPlayerValues`, inserts base + adjusted.
- `prisma/seed-players.ts`, `prisma/sync-players.ts` — set `base*` (1:1).
- `src/lib/computeTeamStats.ts`, `src/lib/budget.ts` — take `rosterSize` param.
- `src/app/api/draft/[draftId]/nomination-data/route.ts` — use `draft.rosterSize`, return `targetRoster`.
- `src/app/draft/[draftId]/teams/page.tsx`, `.../budget/page.tsx` — pass `draft.rosterSize`.
- `src/lib/nominationScoring.ts` — take `targetRoster` param.
- `src/components/NominationHelper/NominationHelper.tsx` — thread `targetRoster` from API.
- `src/components/RosterTracker/RosterTracker.tsx`, `src/components/BudgetPressure/BudgetPressureView.tsx` — derive roster size from data instead of `ROSTER_SIZE`.
- Existing tests: `src/__tests__/computeTeamStats.test.ts`, `src/__tests__/lib/budget.test.ts`, `src/__tests__/nominationScoring.test.ts`, `src/__tests__/createDraft.test.ts`.
- `CLAUDE.md` — update "What's Built"/"What's Next".

---

## Task 1: Constants module + scoring multipliers

**Files:**

- Create: `src/lib/valueAdjustment.constants.ts`
- Create: `src/lib/valueAdjustment.ts`
- Test: `src/__tests__/valueAdjustment.test.ts`

**Interfaces:**

- Consumes: `ScoringSettings`, `Position`, `DEFAULT_SCORING_SETTINGS` from `@/types`.
- Produces: `computeScoringMultipliers(scoring: ScoringSettings): Record<Position, number>`; the constants `SCORING_COEF`, `PASS_YDS_COEF`, `SCORING_BAND`, and a local `clamp(v, lo, hi): number`.

- [ ] **Step 1: Write the constants module**

Create `src/lib/valueAdjustment.constants.ts`:

```ts
import type { ScoringSettings } from '@/types';

// Every value here is TUNABLE — calibrate after the first real draft.
// This is the only place calibration lives. Never user-facing.

type AdjPos = 'QB' | 'RB' | 'WR' | 'TE';

// 12 teams × 10 starters — the reference for the concentration tilt.
export const BASELINE_STARTERS = 120;

// Baseline flex "startability" per position — how deep the flex-worthy pool is.
// Skews FLEX toward RB/WR (TE thin); QB high so SUPER_FLEX lands on a QB.
export const POSITION_STARTABILITY: Record<AdjPos, number> = {
  QB: 8.0,
  RB: 1.0,
  WR: 1.0,
  TE: 0.35,
};

// Scarcity exponent — TE > 1 amplifies for its thin real-world supply.
export const POSITION_ELASTICITY: Record<AdjPos, number> = {
  QB: 1.0,
  RB: 1.0,
  WR: 1.0,
  TE: 1.3,
};

// Concentration sensitivity: a 10-team start-9 league (k = 0.25) lifts the top
// player by ~0.25 × C × 0.5 = 15%.
export const CONCENTRATION_C = 1.2;

export const SCARCITY_BAND: readonly [number, number] = [0.7, 1.6];
export const CONCENTRATION_BAND: readonly [number, number] = [0.8, 1.25];

// TE band is deliberately wider — 1.75×–2× TE premiums are common.
export const SCORING_BAND: Record<AdjPos, readonly [number, number]> = {
  QB: [0.7, 1.5],
  RB: [0.7, 1.5],
  WR: [0.7, 1.5],
  TE: [0.7, 1.9],
};

// Per-position scoring sensitivity. scoringMult = 1 + Σ coef × (setting − baseline).
// pprTE is the single highest-stakes coefficient.
export const SCORING_COEF: Record<AdjPos, Partial<Record<keyof ScoringSettings, number>>> = {
  QB: { passTD: 0.06, passInt: 0.03, rushAtt: 0.3, rushFD: 0.2 },
  RB: { pprRB: 0.3, rushAtt: 1.0, rushFD: 0.5, recFD: 0.2, rbFDBonus: 0.2 },
  WR: { pprWR: 0.3, recFD: 0.2, wrFDBonus: 0.2 },
  TE: { pprTE: 0.8, recFD: 0.2, teFDBonus: 0.3 },
};

// passYdsPerPoint is inverse (fewer yds/pt ⇒ more QB points), handled separately:
// contribution = PASS_YDS_COEF × ((1/setting) − (1/baseline)).
export const PASS_YDS_COEF = 4.0;
```

- [ ] **Step 2: Write the failing scoring-multiplier tests**

Create `src/__tests__/valueAdjustment.test.ts`:

```ts
import { computeScoringMultipliers } from '@/lib/valueAdjustment';
import { DEFAULT_SCORING_SETTINGS, type ScoringSettings } from '@/types';

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
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm jest valueAdjustment -t "computeScoringMultipliers"`
Expected: FAIL — `computeScoringMultipliers` is not exported yet.

- [ ] **Step 4: Implement the scoring multiplier**

Create `src/lib/valueAdjustment.ts`:

```ts
import type { Position, ScoringSettings } from '@/types';
import { DEFAULT_SCORING_SETTINGS } from '@/types';
import { SCORING_COEF, SCORING_BAND, PASS_YDS_COEF } from '@/lib/valueAdjustment.constants';

type AdjPos = 'QB' | 'RB' | 'WR' | 'TE';
const ADJ_POSITIONS: readonly AdjPos[] = ['QB', 'RB', 'WR', 'TE'];

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function allOnes(): Record<Position, number> {
  return { QB: 1, RB: 1, WR: 1, TE: 1, PICK: 1, PKG: 1 };
}

export function computeScoringMultipliers(scoring: ScoringSettings): Record<Position, number> {
  const base = DEFAULT_SCORING_SETTINGS;
  const result = allOnes();

  for (const pos of ADJ_POSITIONS) {
    let mult = 1;
    const coefs = SCORING_COEF[pos];
    for (const field of Object.keys(coefs) as (keyof ScoringSettings)[]) {
      mult += (coefs[field] as number) * (scoring[field] - base[field]);
    }
    if (pos === 'QB') {
      mult += PASS_YDS_COEF * (1 / scoring.passYdsPerPoint - 1 / base.passYdsPerPoint);
    }
    const [lo, hi] = SCORING_BAND[pos];
    result[pos] = clamp(mult, lo, hi);
  }

  return result;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm jest valueAdjustment -t "computeScoringMultipliers"`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/valueAdjustment.constants.ts src/lib/valueAdjustment.ts src/__tests__/valueAdjustment.test.ts
git commit -m "feat(values): scoring multipliers + tunable constants module (#5b)"
```

---

## Task 2: Lineup-scarcity multipliers

**Files:**

- Modify: `src/lib/valueAdjustment.ts`
- Test: `src/__tests__/valueAdjustment.test.ts`

**Interfaces:**

- Consumes: `computeScoringMultipliers` (Task 1); `StartingSlot`, `DEFAULT_STARTING_LINEUP` from `@/types`; `POSITION_STARTABILITY`, `POSITION_ELASTICITY`, `SCARCITY_BAND`.
- Produces: `computeScarcityMultipliers(lineup: StartingSlot[], scoringMults: Record<Position, number>): Record<Position, number>`.

- [ ] **Step 1: Write the failing scarcity tests**

Append to `src/__tests__/valueAdjustment.test.ts`:

```ts
import { computeScarcityMultipliers } from '@/lib/valueAdjustment';
import { DEFAULT_STARTING_LINEUP, type StartingSlot, type Position } from '@/types';

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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm jest valueAdjustment -t "computeScarcityMultipliers"`
Expected: FAIL — `computeScarcityMultipliers` not exported.

- [ ] **Step 3: Implement scarcity multipliers**

Add to `src/lib/valueAdjustment.ts` (import the new symbols and `StartingSlot`, `DEFAULT_STARTING_LINEUP`):

```ts
import type { Position, ScoringSettings, StartingSlot } from '@/types';
import { DEFAULT_SCORING_SETTINGS, DEFAULT_STARTING_LINEUP } from '@/types';
import {
  SCORING_COEF,
  SCORING_BAND,
  PASS_YDS_COEF,
  POSITION_STARTABILITY,
  POSITION_ELASTICITY,
  SCARCITY_BAND,
} from '@/lib/valueAdjustment.constants';
```

```ts
const FLEX_ELIGIBLE: readonly AdjPos[] = ['RB', 'WR', 'TE'];
const SF_ELIGIBLE: readonly AdjPos[] = ['QB', 'RB', 'WR', 'TE'];

function allocate(
  demand: Record<AdjPos, number>,
  eligible: readonly AdjPos[],
  scoringMults: Record<Position, number>,
): void {
  const weights = eligible.map((p) => POSITION_STARTABILITY[p] * scoringMults[p]);
  const total = weights.reduce((a, b) => a + b, 0);
  eligible.forEach((p, i) => {
    demand[p] += weights[i] / total;
  });
}

function computeDemand(
  lineup: StartingSlot[],
  scoringMults: Record<Position, number>,
): Record<AdjPos, number> {
  const demand: Record<AdjPos, number> = { QB: 0, RB: 0, WR: 0, TE: 0 };
  for (const slot of lineup) {
    if (slot === 'FLEX') allocate(demand, FLEX_ELIGIBLE, scoringMults);
    else if (slot === 'SUPER_FLEX') allocate(demand, SF_ELIGIBLE, scoringMults);
    else demand[slot] += 1; // dedicated QB/RB/WR/TE
  }
  return demand;
}

export function computeScarcityMultipliers(
  lineup: StartingSlot[],
  scoringMults: Record<Position, number>,
): Record<Position, number> {
  const demand = computeDemand(lineup, scoringMults);
  const baselineDemand = computeDemand([...DEFAULT_STARTING_LINEUP], allOnes());
  const result = allOnes();

  const [lo, hi] = SCARCITY_BAND;
  for (const pos of ADJ_POSITIONS) {
    const ratio = demand[pos] / baselineDemand[pos];
    const raised = Math.pow(ratio, POSITION_ELASTICITY[pos]);
    result[pos] = clamp(raised, lo, hi);
  }

  return result;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm jest valueAdjustment -t "computeScarcityMultipliers"`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/valueAdjustment.ts src/__tests__/valueAdjustment.test.ts
git commit -m "feat(values): lineup-scarcity multipliers with scoring-weighted flex (#5b)"
```

---

## Task 3: Concentration tilt

**Files:**

- Modify: `src/lib/valueAdjustment.ts`
- Test: `src/__tests__/valueAdjustment.test.ts`

**Interfaces:**

- Consumes: `BASELINE_STARTERS`, `CONCENTRATION_C`, `CONCENTRATION_BAND`.
- Produces: `computeConcentrationFactor(rankPercentile: number, totalStarters: number): number`.

- [ ] **Step 1: Write the failing concentration tests**

Append to `src/__tests__/valueAdjustment.test.ts`:

```ts
import { computeConcentrationFactor } from '@/lib/valueAdjustment';

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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm jest valueAdjustment -t "computeConcentrationFactor"`
Expected: FAIL — not exported.

- [ ] **Step 3: Implement concentration factor**

Add to `src/lib/valueAdjustment.ts` (import `BASELINE_STARTERS`, `CONCENTRATION_C`, `CONCENTRATION_BAND`):

```ts
export function computeConcentrationFactor(rankPercentile: number, totalStarters: number): number {
  const k = (BASELINE_STARTERS - totalStarters) / BASELINE_STARTERS;
  const factor = 1 + k * CONCENTRATION_C * (0.5 - rankPercentile);
  const [lo, hi] = CONCENTRATION_BAND;
  return clamp(factor, lo, hi);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm jest valueAdjustment -t "computeConcentrationFactor"`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/valueAdjustment.ts src/__tests__/valueAdjustment.test.ts
git commit -m "feat(values): rank-based concentration tilt (#5b)"
```

---

## Task 4: `adjustPlayerValues` orchestrator

**Files:**

- Modify: `src/lib/valueAdjustment.ts`
- Test: `src/__tests__/valueAdjustment.test.ts`

**Interfaces:**

- Consumes: all three multiplier functions; `Player`, `StartingSlot`, `ScoringSettings` from `@/types`.
- Produces:
  - `interface DraftValueSettings { startingLineup: StartingSlot[]; scoringSettings: ScoringSettings; teamCount: number; }`
  - `interface ValuedPlayer extends Player { baseBudget: number; baseCeiling: number; baseFloor: number; }` (its `budget`/`ceiling`/`floor` hold ADJUSTED values)
  - `adjustPlayerValues(basePlayers: Player[], settings: DraftValueSettings): ValuedPlayer[]`

- [ ] **Step 1: Write the failing orchestrator tests**

Append to `src/__tests__/valueAdjustment.test.ts`:

```ts
import { adjustPlayerValues, type DraftValueSettings } from '@/lib/valueAdjustment';
import type { Player } from '@/types';

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

const DEFAULT_SETTINGS: DraftValueSettings = {
  startingLineup: [...DEFAULT_STARTING_LINEUP],
  scoringSettings: { ...DEFAULT_SCORING_SETTINGS },
  teamCount: 12,
};

const POOL: Player[] = [
  P({ player: 'QB1', pos: 'QB', sfRank: 1, budget: 50, ceiling: 58, floor: 44 }),
  P({ player: 'RB1', pos: 'RB', sfRank: 8, budget: 40, ceiling: 46, floor: 35 }),
  P({ player: 'WR1', pos: 'WR', sfRank: 3, budget: 45, ceiling: 52, floor: 39 }),
  P({ player: 'TE1', pos: 'TE', sfRank: 20, budget: 30, ceiling: 35, floor: 26 }),
  P({ player: 'TE2', pos: 'TE', sfRank: 120, budget: 8, ceiling: 9, floor: 7 }),
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
    expect(te1.baseCeiling).toBe(35);
    expect(te1.baseFloor).toBe(26);
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm jest valueAdjustment -t "adjustPlayerValues"`
Expected: FAIL — `adjustPlayerValues` not exported.

- [ ] **Step 3: Implement the orchestrator**

Add to `src/lib/valueAdjustment.ts`:

```ts
import type { Player } from '@/types';

export interface DraftValueSettings {
  startingLineup: StartingSlot[];
  scoringSettings: ScoringSettings;
  teamCount: number;
}

export interface ValuedPlayer extends Player {
  baseBudget: number;
  baseCeiling: number;
  baseFloor: number;
}

function isAdjustable(pos: Position): pos is AdjPos {
  return pos === 'QB' || pos === 'RB' || pos === 'WR' || pos === 'TE';
}

export function adjustPlayerValues(
  basePlayers: Player[],
  settings: DraftValueSettings,
): ValuedPlayer[] {
  const lineup = settings.startingLineup ?? [...DEFAULT_STARTING_LINEUP];
  const scoring = settings.scoringSettings ?? { ...DEFAULT_SCORING_SETTINGS };

  const scoringMults = computeScoringMultipliers(scoring);
  const scarcityMults = computeScarcityMultipliers(lineup, scoringMults);
  const totalStarters = settings.teamCount * lineup.length;

  // Rank percentile is computed over adjustable players only, ordered by sfRank.
  const adjustable = basePlayers
    .filter((p) => isAdjustable(p.pos))
    .slice()
    .sort((a, b) => a.sfRank - b.sfRank);
  const rankIndex = new Map<string, number>();
  adjustable.forEach((p, i) => rankIndex.set(p.player, i));
  const n = adjustable.length;

  return basePlayers.map((p) => {
    if (!isAdjustable(p.pos)) {
      // PICK/PKG pass through verbatim — no re-derivation.
      return { ...p, baseBudget: p.budget, baseCeiling: p.ceiling, baseFloor: p.floor };
    }
    const idx = rankIndex.get(p.player) ?? 0;
    const percentile = n > 1 ? idx / (n - 1) : 0;
    const conc = computeConcentrationFactor(percentile, totalStarters);
    const mult = scarcityMults[p.pos] * scoringMults[p.pos] * conc;

    const budget = Math.max(1, Math.round(p.budget * mult));
    const ceiling = Math.round(budget * 1.15);
    const floor = Math.max(5, Math.round(budget * 0.87));

    return {
      ...p,
      budget,
      ceiling,
      floor,
      baseBudget: p.budget,
      baseCeiling: p.ceiling,
      baseFloor: p.floor,
    };
  });
}
```

- [ ] **Step 4: Run the whole test file to verify it passes**

Run: `pnpm jest valueAdjustment`
Expected: PASS (all describe blocks green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/valueAdjustment.ts src/__tests__/valueAdjustment.test.ts
git commit -m "feat(values): adjustPlayerValues orchestrator (identity, caps, PKG passthrough) (#5b)"
```

---

## Task 5: Schema + migration for `base*` columns; seed/sync scripts

**Files:**

- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_player_base_values/migration.sql`
- Modify: `prisma/seed-players.ts`, `prisma/sync-players.ts`

**Interfaces:**

- Produces: `Player.baseBudget`, `Player.baseCeiling`, `Player.baseFloor` (non-null Int) on the Prisma client.

- [ ] **Step 1: Add columns to the schema**

In `prisma/schema.prisma`, inside `model Player`, add after `floor Int`:

```prisma
  baseBudget  Int
  baseCeiling Int
  baseFloor   Int
```

- [ ] **Step 2: Generate the migration without applying**

Run: `pnpm prisma migrate dev --name player_base_values --create-only`
Expected: creates `prisma/migrations/<timestamp>_player_base_values/migration.sql` (Prisma will emit `ADD COLUMN ... NOT NULL` which would fail against existing rows — the next step fixes it).

- [ ] **Step 3: Replace the generated SQL with an additive backfill**

Overwrite the generated `migration.sql` with:

```sql
-- Add base value columns (nullable first so existing rows can be backfilled)
ALTER TABLE "Player" ADD COLUMN "baseBudget" INTEGER;
ALTER TABLE "Player" ADD COLUMN "baseCeiling" INTEGER;
ALTER TABLE "Player" ADD COLUMN "baseFloor" INTEGER;

-- Existing drafts are left untouched: base == current adjusted value
UPDATE "Player" SET "baseBudget" = "budget", "baseCeiling" = "ceiling", "baseFloor" = "floor";

-- Lock them down to match the schema (NOT NULL)
ALTER TABLE "Player" ALTER COLUMN "baseBudget" SET NOT NULL;
ALTER TABLE "Player" ALTER COLUMN "baseCeiling" SET NOT NULL;
ALTER TABLE "Player" ALTER COLUMN "baseFloor" SET NOT NULL;
```

- [ ] **Step 4: Apply the migration and regenerate the client**

Run: `pnpm prisma migrate dev`
Expected: applies `player_base_values`, regenerates the Prisma client, no errors.

- [ ] **Step 5: Update `seed-players.ts` to set base (1:1)**

In `prisma/seed-players.ts`, change the `createMany` `data` map to include base columns:

```ts
      data: BASE_PLAYERS.map((p) => ({
        name: p.player,
        nflTeam: p.team,
        pos: p.pos,
        age: p.age,
        sfRank: p.sfRank,
        budget: p.budget,
        ceiling: p.ceiling,
        floor: p.floor,
        baseBudget: p.budget,
        baseCeiling: p.ceiling,
        baseFloor: p.floor,
        notes: p.notes,
        draftId: draft.id,
      })),
```

- [ ] **Step 6: Update `sync-players.ts` to set base (1:1)**

In `prisma/sync-players.ts`, in its `createMany` `data` map, add the same three base fields (`baseBudget: p.budget, baseCeiling: p.ceiling, baseFloor: p.floor`) alongside the existing `budget`/`ceiling`/`floor`.

- [ ] **Step 7: Typecheck**

Run: `pnpm tsc --noEmit`
Expected: no errors (both scripts now satisfy the required non-null base columns).

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma prisma/migrations prisma/seed-players.ts prisma/sync-players.ts
git commit -m "feat(schema): add Player base value columns + backfill; seed/sync set base 1:1 (#5b)"
```

---

## Task 6: Wire `createDraft` to apply adjustment

**Files:**

- Modify: `src/lib/actions.ts:141-154` (the `player.createMany` block in `createDraft`)
- Test: `src/__tests__/createDraft.test.ts`

**Interfaces:**

- Consumes: `adjustPlayerValues` (Task 4).
- Produces: `createDraft` persists adjusted `budget`/`ceiling`/`floor` and untouched `baseBudget`/`baseCeiling`/`baseFloor`.

- [ ] **Step 1: Add the import**

At the top of `src/lib/actions.ts`, add:

```ts
import { adjustPlayerValues } from '@/lib/valueAdjustment';
```

(`BASE_PLAYERS` is already imported as the source array used at line 142.)

- [ ] **Step 2: Replace the createMany block**

Replace the existing `await tx.player.createMany({ ... })` in `createDraft` with:

```ts
const valued = adjustPlayerValues(BASE_PLAYERS, {
  startingLineup: data.startingLineup,
  scoringSettings: data.scoringSettings,
  teamCount: data.teams.length,
});

await tx.player.createMany({
  data: valued.map((p) => ({
    name: p.player,
    nflTeam: p.team,
    pos: p.pos,
    age: p.age,
    sfRank: p.sfRank,
    budget: p.budget,
    ceiling: p.ceiling,
    floor: p.floor,
    baseBudget: p.baseBudget,
    baseCeiling: p.baseCeiling,
    baseFloor: p.baseFloor,
    notes: p.notes,
    draftId: draft.id,
  })),
});
```

- [ ] **Step 3: Add a failing test for base+adjusted persistence**

In `src/__tests__/createDraft.test.ts`, add a test that captures the `createMany` payload under a TE-premium setting and asserts base is preserved while adjusted TE budget rises. Use the existing mocks; capture args via `mockTxPlayerCreateMany`:

```ts
it('persists base values verbatim and adjusts TE budgets under a TE premium', async () => {
  mockAuth.mockResolvedValue(MOCK_SESSION);
  mockTxDraftCreate.mockResolvedValue({ id: 7 });
  mockTxTeamCreate.mockResolvedValue({ id: 1 });
  mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) =>
    cb({
      draft: { create: mockTxDraftCreate, update: mockTxDraftUpdate },
      team: { create: mockTxTeamCreate },
      player: { createMany: mockTxPlayerCreateMany },
    }),
  );

  await createDraft({
    ...VALID_INPUT,
    scoringSettings: { ...VALID_INPUT.scoringSettings, pprTE: 2 },
  });

  const payload = mockTxPlayerCreateMany.mock.calls[0][0].data as Array<{
    pos: string;
    budget: number;
    baseBudget: number;
  }>;
  const te = payload.find((r) => r.pos === 'TE')!;
  expect(te.budget).toBeGreaterThan(te.baseBudget);
  const qb = payload.find((r) => r.pos === 'QB')!;
  expect(qb.budget).toBe(qb.baseBudget); // QB untouched by a TE premium
});
```

> Note: match the exact `mockTransaction` wiring already used by the other tests in this file — reuse their `tx` mock shape rather than the sketch above if it differs.

- [ ] **Step 4: Run the test**

Run: `pnpm jest createDraft`
Expected: PASS (new test green, existing tests still green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/actions.ts src/__tests__/createDraft.test.ts
git commit -m "feat(values): createDraft seeds adjusted + base player values (#5b)"
```

---

## Task 7: Thread `rosterSize` into buying-power calculations

**Files:**

- Modify: `src/lib/computeTeamStats.ts`, `src/lib/budget.ts`
- Modify: `src/app/api/draft/[draftId]/nomination-data/route.ts`
- Modify: `src/app/draft/[draftId]/teams/page.tsx`, `src/app/draft/[draftId]/budget/page.tsx`
- Modify: `src/components/RosterTracker/RosterTracker.tsx`, `src/components/BudgetPressure/BudgetPressureView.tsx`
- Test: `src/__tests__/computeTeamStats.test.ts`, `src/__tests__/lib/budget.test.ts`

**Interfaces:**

- Produces:
  - `computeTeamStats(teams, players, rosterSize: number)` (in `computeTeamStats.ts`)
  - `computeTeamStats(teams, rosterSize: number)` (in `budget.ts`)

- [ ] **Step 1: Update failing tests for `computeTeamStats.ts`**

In `src/__tests__/computeTeamStats.test.ts`, update every `computeTeamStats(teams, players)` call to `computeTeamStats(teams, players, 30)`, and add one asserting a non-default size:

```ts
it('uses the draft rosterSize for buying power', () => {
  const [stats] = computeTeamStats([makeTeam()], [], 25);
  // 0 spent, budget 1000, rosterRemaining = 25 → buyingPower = 1000 - 25
  expect(stats.rosterRemaining).toBe(25);
  expect(stats.buyingPower).toBe(975);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm jest computeTeamStats`
Expected: FAIL — function takes 2 args / new assertion fails.

- [ ] **Step 3: Update `computeTeamStats.ts`**

Remove `import { ROSTER_SIZE } from '@/lib/teams';`. Change the signature and body:

```ts
export function computeTeamStats(
  teams: TeamInput[],
  players: Player[],
  rosterSize: number,
): TeamWithRoster[] {
  return teams.map((team) => {
    // ...
    const rosterRemaining = rosterSize - rosterCount;
```

- [ ] **Step 4: Update `budget.ts`**

Remove the `ROSTER_SIZE` import. Change signature and body:

```ts
export function computeTeamStats(teams: TeamWithResults[], rosterSize: number): TeamStats[] {
  return teams
    .map((team) => {
      // ...
      const rosterRemaining = rosterSize - rosterCount;
```

- [ ] **Step 5: Update `budget.test.ts`**

In `src/__tests__/lib/budget.test.ts`, update each `computeTeamStats(teams)` call to `computeTeamStats(teams, 30)` and add a non-default-size assertion mirroring Step 1.

- [ ] **Step 6: Update the callers**

- `src/app/draft/[draftId]/teams/page.tsx`: `computeTeamStats(rawTeams, players, draft.rosterSize)`.
- `src/app/draft/[draftId]/budget/page.tsx`: `computeTeamStats(teams, draft.rosterSize)`.
- `src/app/api/draft/[draftId]/nomination-data/route.ts`: remove the `ROSTER_SIZE` import; replace `const rosterRemaining = ROSTER_SIZE - rosterCount;` with `const rosterRemaining = draft.rosterSize - rosterCount;`.

- [ ] **Step 7: Update display components to derive size from data**

- `src/components/RosterTracker/RosterTracker.tsx`: replace `import { LEAGUE_TEAMS, ROSTER_SIZE } from '@/lib/teams';` with `import { LEAGUE_TEAMS } from '@/lib/teams';`. At line ~104 replace `{team.rosterCount} / {ROSTER_SIZE}` with `{team.rosterCount} / {team.rosterCount + team.rosterRemaining}`. In the header string (~line 300) replace `{LEAGUE_TEAMS.length}-Team` with `{teams.length}-Team` and `{ROSTER_SIZE}-Man` with `{(teams[0] ? teams[0].rosterCount + teams[0].rosterRemaining : 0)}-Man`. Leave the static `Superflex · TE Premium · $1,000 Budget` descriptor as-is (out of scope — not derivable from passed props).
- `src/components/BudgetPressure/BudgetPressureView.tsx`: remove the `ROSTER_SIZE` import; at line ~170 replace `{team.rosterCount} / {ROSTER_SIZE}` with `{team.rosterCount} / {team.rosterCount + team.rosterRemaining}`.

- [ ] **Step 8: Run tests + typecheck**

Run: `pnpm jest computeTeamStats budget && pnpm tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 9: Commit**

```bash
git add src/lib/computeTeamStats.ts src/lib/budget.ts src/app/draft src/app/api src/components/RosterTracker src/components/BudgetPressure src/__tests__/computeTeamStats.test.ts src/__tests__/lib/budget.test.ts
git commit -m "feat(settings): buying-power + roster displays honor draft.rosterSize (#5b)"
```

---

## Task 8: Thread `targetRoster` into nomination scoring

**Files:**

- Modify: `src/lib/nominationScoring.ts`
- Modify: `src/app/api/draft/[draftId]/nomination-data/route.ts`
- Modify: `src/components/NominationHelper/NominationHelper.tsx`
- Test: `src/__tests__/nominationScoring.test.ts`

**Interfaces:**

- Produces: `computeNominationScores(players, teamStats, auctionResults, watchlist, nominated, myHandle, targetRoster: Partial<Record<Position, number>>)`.

- [ ] **Step 1: Update the failing test**

In `src/__tests__/nominationScoring.test.ts`, update all `computeNominationScores(...)` calls to pass a target-roster argument last (e.g. `{ QB: 4, RB: 9, WR: 11, TE: 3 }`), and add a test proving the parameter is honored:

```ts
it('uses the provided targetRoster (a position with 0 target scores 0)', () => {
  const scored = computeNominationScores(
    players,
    teamStats,
    auctionResults,
    [],
    [],
    'me',
    { QB: 4, RB: 9, WR: 11 }, // no TE target
  );
  expect(scored.every((s) => s.player.pos !== 'TE')).toBe(true);
});
```

(Adjust `players`/`teamStats` names to whatever the existing test fixtures are called.)

- [ ] **Step 2: Run to verify failure**

Run: `pnpm jest nominationScoring`
Expected: FAIL — extra argument / TargetRoster not used.

- [ ] **Step 3: Update `nominationScoring.ts`**

Remove `import { TARGET_ROSTER } from '@/lib/teams';`. Add `Position` to the type import. Add the parameter and use it:

```ts
import type { Player, TeamStats, AuctionResultEntry, Position } from '@/types';

export function computeNominationScores(
  players: Player[],
  teamStats: TeamStats[],
  auctionResults: AuctionResultEntry[],
  watchlist: string[],
  nominated: string[],
  myHandle: string,
  targetRoster: Partial<Record<Position, number>>,
): ScoredPlayer[] {
  // ...
    const target = targetRoster[player.pos];
```

- [ ] **Step 4: Return `targetRoster` from the API route**

In `src/app/api/draft/[draftId]/nomination-data/route.ts`: add `import { DEFAULT_TARGET_ROSTER } from '@/types';` and add to the JSON response object:

```ts
    targetRoster:
      (draft.targetRoster as Partial<Record<Position, number>> | null) ?? DEFAULT_TARGET_ROSTER,
```

(Import `Position` in that file's type import if not present.)

- [ ] **Step 5: Thread it through `NominationHelper.tsx`**

Add `targetRoster` to the `NomData` interface:

```ts
interface NomData {
  teamStats: TeamStats[];
  auctionResults: AuctionResultEntry[];
  watchlist: string[];
  nominated: string[];
  ownerHandle: string | null;
  targetRoster: Partial<Record<Position, number>>;
}
```

And pass it in the `computeNominationScores` call (after `data.ownerHandle ?? ''`):

```ts
      data.ownerHandle ?? '',
      data.targetRoster,
```

- [ ] **Step 6: Run tests + typecheck**

Run: `pnpm jest nominationScoring && pnpm tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/nominationScoring.ts src/app/api/draft src/components/NominationHelper src/__tests__/nominationScoring.test.ts
git commit -m "feat(settings): nomination scoring honors draft.targetRoster (#5b)"
```

---

## Task 9: Full verification + docs

**Files:**

- Modify: `CLAUDE.md`

- [ ] **Step 1: Run the full quality gate**

Run: `pnpm tsc --noEmit && pnpm lint && pnpm test`
Expected: typecheck clean, lint clean, all tests pass (202 prior + new).

- [ ] **Step 2: Confirm no stray runtime reads of the old constants**

Run: `grep -rn "ROSTER_SIZE\|TARGET_ROSTER" src/ | grep -v "teams.ts\|DEFAULT_TARGET_ROSTER\|drafts/new"`
Expected: no matches in runtime calculation/display paths (only the definitions in `teams.ts` and the form defaults remain).

- [ ] **Step 3: Update `CLAUDE.md`**

- In "What's Built", add a bullet: League settings now drive valuation — per-draft players carry `baseBudget`/`baseCeiling`/`baseFloor` and adjusted `budget`/`ceiling`/`floor` computed at draft creation from lineup/scoring/team-count deltas (`src/lib/valueAdjustment.ts`); `rosterSize`/`targetRoster` are read from the draft, not constants.
- In "What's Next", change the #5b line to note **Phase 1 (position-level) is done**; **Phase 2** (Mike Clay projection dual-scoring, first-down historical rates, VOR concentration) is the fast-follow.
- Update the `src/lib` structure listing to mention `valueAdjustment.ts` and `valueAdjustment.constants.ts`.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for value adjustment algorithm (#5b Phase 1)"
```

- [ ] **Step 5: Push and open PR** (only when the user asks)

Do not push or open a PR until the user requests it.

---

## Self-Review Notes

- **Spec §1 (data model):** Tasks 5–6 (base columns, migration, createDraft wiring). ✓
- **Spec §2a/2b/2c (three forces):** Tasks 1–3. ✓
- **Spec §3 (combine/caps/PKG/identity):** Task 4 (identity, PKG passthrough, budget≥1/floor≥5, per-force clamps). ✓
- **Spec §4 (consumer rewiring):** Tasks 7 (rosterSize) + 8 (targetRoster). ✓
- **Spec §5 (constants module):** Task 1. ✓
- **Spec §6 (testing):** identity, scoring isolation, TE-premium magnitude, lineup, concentration, caps, PKG, purity — covered across Tasks 1–4; plumbing across 6–8. ✓
- **Type consistency:** `ValuedPlayer`/`DraftValueSettings` defined in Task 4 and consumed in Task 6; `computeTeamStats` new arity defined in Task 7 and its callers updated in the same task; `computeNominationScores` new arity defined in Task 8 with all call sites updated there.
- **Known deferral:** the static `Superflex · TE Premium · $1,000 Budget` descriptor in RosterTracker's header is left as-is (not derivable from passed props) — noted in Task 7.
