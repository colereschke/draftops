# Projection-Shaped Market Values Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make projection-shaped market values the active auction target when projection data exists.

**Architecture:** Add a focused valuation module that turns player-specific scoring lift into a
capped market multiplier, then wire the projection apply script to write those active values into
`DraftPlayerValue`. Keep pure VOR calculations for diagnostics and replacement context, but stop
using pure VOR as the active target.

**Tech Stack:** Next.js 16, TypeScript 5, Prisma 7, Jest, pnpm.

---

## File Structure

- Create `src/lib/projectionMarketValue.ts`
  - Owns projection-shaped market value calibration, peer normalization, rookie protection, and
    active value calculation.
- Create `src/__tests__/projectionMarketValue.test.ts`
  - Unit-tests the new valuation module with high-reception TE, efficiency TE, rookie, missing
    projection, and peer normalization fixtures.
- Modify `prisma/apply-projection-values.ts`
  - Carries baseline scored points through CSV parsing.
  - Calls `calculateProjectionMarketValues` after VOR diagnostics are calculated.
  - Writes `activeAuctionValue` and `valueSource` from the projection-shaped market model.
- Modify `src/__tests__/projectionApply.test.ts`
  - Covers parsed baseline points and joined projection metadata needed by the new valuation path.
- Existing `src/lib/playerValueMapping.ts` should not need behavior changes because it already maps
  `DraftPlayerValue.activeAuctionValue` into the rendered `Player.budget`.

---

### Task 1: Add Projection-Shaped Market Value Module

**Files:**

- Create: `src/lib/projectionMarketValue.ts`
- Test: `src/__tests__/projectionMarketValue.test.ts`

- [ ] **Step 1: Write failing tests for TE premium nuance and fallback policies**

Create `src/__tests__/projectionMarketValue.test.ts`:

```ts
import {
  calculateProjectionMarketValues,
  type ProjectionMarketValueInput,
} from '@/lib/projectionMarketValue';

const player = (overrides: Partial<ProjectionMarketValueInput>): ProjectionMarketValueInput => ({
  sleeperId: '1',
  name: 'Player',
  position: 'TE',
  fallbackAuctionValue: 100,
  baselineProjectedPoints: 100,
  projectedPoints: 110,
  isRookie: false,
  ...overrides,
});

describe('calculateProjectionMarketValues', () => {
  it('raises a high-reception TE more than an efficiency TE in the same market bucket', () => {
    const values = calculateProjectionMarketValues({
      players: [
        player({
          sleeperId: 'kelce',
          name: 'High Volume TE',
          position: 'TE',
          fallbackAuctionValue: 100,
          baselineProjectedPoints: 200,
          projectedPoints: 250,
        }),
        player({
          sleeperId: 'kittle',
          name: 'Efficiency TE',
          position: 'TE',
          fallbackAuctionValue: 98,
          baselineProjectedPoints: 200,
          projectedPoints: 220,
        }),
        player({
          sleeperId: 'peer',
          name: 'Peer TE',
          position: 'TE',
          fallbackAuctionValue: 96,
          baselineProjectedPoints: 200,
          projectedPoints: 220,
        }),
      ],
    });

    const volume = values.find((value) => value.sleeperId === 'kelce')!;
    const efficiency = values.find((value) => value.sleeperId === 'kittle')!;

    expect(volume.projectionMarketMultiplier).toBeGreaterThan(
      efficiency.projectionMarketMultiplier,
    );
    expect(volume.activeAuctionValue).toBeGreaterThan(100);
    expect(efficiency.activeAuctionValue).toBeLessThanOrEqual(98);
    expect(volume.valueSource).toBe('projection_adjusted_market');
  });

  it('normalizes against peers instead of giving every player the same lift', () => {
    const values = calculateProjectionMarketValues({
      players: [
        player({
          sleeperId: 'wr1',
          name: 'Target Hog WR',
          position: 'WR',
          fallbackAuctionValue: 80,
          baselineProjectedPoints: 200,
          projectedPoints: 250,
        }),
        player({
          sleeperId: 'wr2',
          name: 'Neutral WR',
          position: 'WR',
          fallbackAuctionValue: 78,
          baselineProjectedPoints: 200,
          projectedPoints: 220,
        }),
      ],
    });

    const targetHog = values.find((value) => value.sleeperId === 'wr1')!;
    const neutral = values.find((value) => value.sleeperId === 'wr2')!;

    expect(targetHog.rawScoringLift).toBeCloseTo(1.25);
    expect(neutral.rawScoringLift).toBeCloseTo(1.1);
    expect(targetHog.relativeScoringLift).toBeGreaterThan(1);
    expect(neutral.relativeScoringLift).toBeLessThan(1);
    expect(targetHog.projectionMarketMultiplier).not.toBe(neutral.projectionMarketMultiplier);
  });

  it('keeps fallback active when projection points are missing', () => {
    const [value] = calculateProjectionMarketValues({
      players: [
        player({
          sleeperId: 'missing',
          fallbackAuctionValue: 42,
          baselineProjectedPoints: null,
          projectedPoints: null,
        }),
      ],
    });

    expect(value.activeAuctionValue).toBe(42);
    expect(value.valueSource).toBe('fallback');
    expect(value.rawScoringLift).toBeNull();
    expect(value.relativeScoringLift).toBeNull();
    expect(value.projectionMarketMultiplier).toBe(1);
  });

  it('keeps fallback active when baseline points are zero', () => {
    const [value] = calculateProjectionMarketValues({
      players: [
        player({
          sleeperId: 'zero',
          fallbackAuctionValue: 37,
          baselineProjectedPoints: 0,
          projectedPoints: 18,
        }),
      ],
    });

    expect(value.activeAuctionValue).toBe(37);
    expect(value.valueSource).toBe('fallback');
  });

  it('does not let low rookie projection shape reduce active value below fallback', () => {
    const values = calculateProjectionMarketValues({
      players: [
        player({
          sleeperId: 'rookie',
          name: 'Rookie WR',
          position: 'WR',
          fallbackAuctionValue: 75,
          baselineProjectedPoints: 100,
          projectedPoints: 90,
          isRookie: true,
        }),
        player({
          sleeperId: 'vet',
          name: 'Veteran WR',
          position: 'WR',
          fallbackAuctionValue: 70,
          baselineProjectedPoints: 100,
          projectedPoints: 120,
        }),
      ],
    });

    const rookie = values.find((value) => value.sleeperId === 'rookie')!;
    expect(rookie.activeAuctionValue).toBe(75);
    expect(rookie.valueSource).toBe('projection_adjusted_market');
  });

  it('lets strong rookie projection shape raise active value', () => {
    const values = calculateProjectionMarketValues({
      players: [
        player({
          sleeperId: 'rookie',
          name: 'Rookie WR',
          position: 'WR',
          fallbackAuctionValue: 75,
          baselineProjectedPoints: 100,
          projectedPoints: 130,
          isRookie: true,
        }),
        player({
          sleeperId: 'vet',
          name: 'Veteran WR',
          position: 'WR',
          fallbackAuctionValue: 70,
          baselineProjectedPoints: 100,
          projectedPoints: 105,
        }),
      ],
    });

    const rookie = values.find((value) => value.sleeperId === 'rookie')!;
    expect(rookie.activeAuctionValue).toBeGreaterThan(75);
    expect(rookie.valueSource).toBe('projection_adjusted_market');
  });
});
```

- [ ] **Step 2: Run the new test to verify it fails**

Run:

```bash
pnpm test -- src/__tests__/projectionMarketValue.test.ts
```

Expected: FAIL because `src/lib/projectionMarketValue.ts` does not exist.

- [ ] **Step 3: Implement the module**

Create `src/lib/projectionMarketValue.ts`:

```ts
import type { Position } from '@/types';

type MarketValuePosition = 'QB' | 'RB' | 'WR' | 'TE';
type ValueSource = 'fallback' | 'projection_adjusted_market';
type MarketBucket = 'elite' | 'starter' | 'depth';

export interface ProjectionMarketValueInput {
  sleeperId: string;
  name: string;
  position: MarketValuePosition;
  fallbackAuctionValue: number;
  baselineProjectedPoints: number | null;
  projectedPoints: number | null;
  isRookie?: boolean;
}

export interface ProjectionMarketValueOutput extends ProjectionMarketValueInput {
  activeAuctionValue: number;
  rawScoringLift: number | null;
  relativeScoringLift: number | null;
  projectionMarketMultiplier: number;
  valueSource: ValueSource;
}

interface ProjectionMarketValueSettings {
  players: ProjectionMarketValueInput[];
}

interface CalibrationBand {
  floor: number;
  ceiling: number;
}

const SENSITIVITY = 0.75;

const DEFAULT_BAND: CalibrationBand = { floor: 0.85, ceiling: 1.25 };

const POSITION_BANDS: Record<MarketValuePosition, CalibrationBand> = {
  QB: { floor: 0.9, ceiling: 1.2 },
  RB: DEFAULT_BAND,
  WR: DEFAULT_BAND,
  TE: { floor: 0.8, ceiling: 1.35 },
};

export function calculateProjectionMarketValues(
  settings: ProjectionMarketValueSettings,
): ProjectionMarketValueOutput[] {
  const rawValues = settings.players.map((player) => ({
    ...player,
    rawScoringLift: calculateRawLift(player),
  }));
  const peerAverageByKey = calculatePeerAverages(rawValues);

  return rawValues.map((player) => {
    if (player.rawScoringLift === null) {
      return fallbackOutput(player);
    }

    const peerAverage = peerAverageByKey.get(peerKey(player));
    if (!peerAverage || peerAverage <= 0) {
      return fallbackOutput(player);
    }

    const relativeScoringLift = player.rawScoringLift / peerAverage;
    const projectionMarketMultiplier = calculateMultiplier(player.position, relativeScoringLift);
    const adjustedValue = Math.max(
      1,
      Math.round(player.fallbackAuctionValue * projectionMarketMultiplier),
    );
    const activeAuctionValue =
      player.isRookie === true
        ? Math.max(player.fallbackAuctionValue, adjustedValue)
        : adjustedValue;

    return {
      ...player,
      activeAuctionValue,
      relativeScoringLift,
      projectionMarketMultiplier,
      valueSource: 'projection_adjusted_market',
    };
  });
}

function calculateRawLift(player: ProjectionMarketValueInput): number | null {
  if (
    player.baselineProjectedPoints === null ||
    player.projectedPoints === null ||
    player.baselineProjectedPoints <= 0 ||
    !Number.isFinite(player.baselineProjectedPoints) ||
    !Number.isFinite(player.projectedPoints)
  ) {
    return null;
  }
  return player.projectedPoints / player.baselineProjectedPoints;
}

function calculatePeerAverages(
  players: Array<ProjectionMarketValueInput & { rawScoringLift: number | null }>,
): Map<string, number> {
  const buckets = new Map<string, number[]>();

  for (const player of players) {
    if (player.rawScoringLift === null) continue;
    const key = peerKey(player);
    const existing = buckets.get(key) ?? [];
    existing.push(player.rawScoringLift);
    buckets.set(key, existing);
  }

  return new Map(
    Array.from(buckets.entries()).map(([key, values]) => [
      key,
      values.reduce((sum, value) => sum + value, 0) / values.length,
    ]),
  );
}

function peerKey(player: Pick<ProjectionMarketValueInput, 'position' | 'fallbackAuctionValue'>) {
  return `${player.position}:${marketBucket(player)}`;
}

function marketBucket(
  player: Pick<ProjectionMarketValueInput, 'fallbackAuctionValue'>,
): MarketBucket {
  if (player.fallbackAuctionValue >= 75) return 'elite';
  if (player.fallbackAuctionValue >= 25) return 'starter';
  return 'depth';
}

function calculateMultiplier(position: Position, relativeScoringLift: number): number {
  const band = isMarketValuePosition(position) ? POSITION_BANDS[position] : DEFAULT_BAND;
  return clamp(1 + (relativeScoringLift - 1) * SENSITIVITY, band.floor, band.ceiling);
}

function fallbackOutput(
  player: ProjectionMarketValueInput & { rawScoringLift: number | null },
): ProjectionMarketValueOutput {
  return {
    ...player,
    activeAuctionValue: player.fallbackAuctionValue,
    relativeScoringLift: null,
    projectionMarketMultiplier: 1,
    valueSource: 'fallback',
  };
}

function isMarketValuePosition(position: Position): position is MarketValuePosition {
  return position === 'QB' || position === 'RB' || position === 'WR' || position === 'TE';
}

function clamp(value: number, floor: number, ceiling: number): number {
  return Math.min(ceiling, Math.max(floor, value));
}
```

- [ ] **Step 4: Run the new test to verify it passes**

Run:

```bash
pnpm test -- src/__tests__/projectionMarketValue.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add src/lib/projectionMarketValue.ts src/__tests__/projectionMarketValue.test.ts
git commit -m "feat: add projection-shaped market valuation"
```

---

### Task 2: Use Market Buckets Based On Position Percentiles

**Files:**

- Modify: `src/lib/projectionMarketValue.ts`
- Test: `src/__tests__/projectionMarketValue.test.ts`

The first task uses fixed dollar cutoffs to make the core behavior work. This task implements the
spec's market-aware buckets based on fallback value percentile within each position.

- [ ] **Step 1: Add a test proving bucket assignment is position-relative**

Append this test inside `describe('calculateProjectionMarketValues', ...)` in
`src/__tests__/projectionMarketValue.test.ts`:

```ts
it('uses fallback value percentile within position for peer buckets', () => {
  const values = calculateProjectionMarketValues({
    players: [
      player({
        sleeperId: 'te1',
        name: 'Elite TE',
        position: 'TE',
        fallbackAuctionValue: 65,
        baselineProjectedPoints: 100,
        projectedPoints: 130,
      }),
      player({
        sleeperId: 'te2',
        name: 'Starter TE',
        position: 'TE',
        fallbackAuctionValue: 45,
        baselineProjectedPoints: 100,
        projectedPoints: 100,
      }),
      player({
        sleeperId: 'te3',
        name: 'Depth TE',
        position: 'TE',
        fallbackAuctionValue: 5,
        baselineProjectedPoints: 100,
        projectedPoints: 100,
      }),
      player({
        sleeperId: 'wr1',
        name: 'Elite WR',
        position: 'WR',
        fallbackAuctionValue: 150,
        baselineProjectedPoints: 100,
        projectedPoints: 100,
      }),
    ],
  });

  const eliteTe = values.find((value) => value.sleeperId === 'te1')!;
  const starterTe = values.find((value) => value.sleeperId === 'te2')!;

  expect(eliteTe.marketBucket).toBe('elite');
  expect(starterTe.marketBucket).toBe('starter');
  expect(eliteTe.relativeScoringLift).toBeCloseTo(1);
  expect(starterTe.relativeScoringLift).toBeCloseTo(1);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pnpm test -- src/__tests__/projectionMarketValue.test.ts
```

Expected: FAIL because `marketBucket` is not exposed and bucket calculation still uses fixed dollar
cutoffs.

- [ ] **Step 3: Implement percentile bucket assignment**

Modify `src/lib/projectionMarketValue.ts` to include `marketBucket` in the output and compute it
from sorted fallback values within position:

```ts
export interface ProjectionMarketValueOutput extends ProjectionMarketValueInput {
  activeAuctionValue: number;
  rawScoringLift: number | null;
  relativeScoringLift: number | null;
  projectionMarketMultiplier: number;
  marketBucket: MarketBucket;
  valueSource: ValueSource;
}

interface PlayerWithBucket extends ProjectionMarketValueInput {
  marketBucket: MarketBucket;
  rawScoringLift: number | null;
}

export function calculateProjectionMarketValues(
  settings: ProjectionMarketValueSettings,
): ProjectionMarketValueOutput[] {
  const bucketBySleeperId = calculateBuckets(settings.players);
  const rawValues: PlayerWithBucket[] = settings.players.map((player) => ({
    ...player,
    marketBucket: bucketBySleeperId.get(player.sleeperId) ?? 'depth',
    rawScoringLift: calculateRawLift(player),
  }));
  const peerAverageByKey = calculatePeerAverages(rawValues);

  return rawValues.map((player) => {
    if (player.rawScoringLift === null) {
      return fallbackOutput(player);
    }

    const peerAverage = peerAverageByKey.get(peerKey(player));
    if (!peerAverage || peerAverage <= 0) {
      return fallbackOutput(player);
    }

    const relativeScoringLift = player.rawScoringLift / peerAverage;
    const projectionMarketMultiplier = calculateMultiplier(player.position, relativeScoringLift);
    const adjustedValue = Math.max(
      1,
      Math.round(player.fallbackAuctionValue * projectionMarketMultiplier),
    );
    const activeAuctionValue =
      player.isRookie === true
        ? Math.max(player.fallbackAuctionValue, adjustedValue)
        : adjustedValue;

    return {
      ...player,
      activeAuctionValue,
      relativeScoringLift,
      projectionMarketMultiplier,
      valueSource: 'projection_adjusted_market',
    };
  });
}

function calculateBuckets(players: ProjectionMarketValueInput[]): Map<string, MarketBucket> {
  const result = new Map<string, MarketBucket>();
  for (const position of ['QB', 'RB', 'WR', 'TE'] as const) {
    const positionalPlayers = players
      .filter((player) => player.position === position)
      .slice()
      .sort((a, b) => b.fallbackAuctionValue - a.fallbackAuctionValue);

    positionalPlayers.forEach((player, index) => {
      const percentile = positionalPlayers.length <= 1 ? 0 : index / positionalPlayers.length;
      result.set(player.sleeperId, bucketForPercentile(percentile));
    });
  }
  return result;
}

function bucketForPercentile(percentile: number): MarketBucket {
  if (percentile < 0.2) return 'elite';
  if (percentile < 0.5) return 'starter';
  return 'depth';
}

function peerKey(player: Pick<PlayerWithBucket, 'position' | 'marketBucket'>): string {
  return `${player.position}:${player.marketBucket}`;
}

function fallbackOutput(player: PlayerWithBucket): ProjectionMarketValueOutput {
  return {
    ...player,
    activeAuctionValue: player.fallbackAuctionValue,
    relativeScoringLift: null,
    projectionMarketMultiplier: 1,
    valueSource: 'fallback',
  };
}
```

Remove the previous fixed-threshold `marketBucket()` function.

- [ ] **Step 4: Run the module tests**

Run:

```bash
pnpm test -- src/__tests__/projectionMarketValue.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add src/lib/projectionMarketValue.ts src/__tests__/projectionMarketValue.test.ts
git commit -m "feat: bucket projection values by position market tier"
```

---

### Task 3: Carry Baseline Projection Points Through The Apply Script

**Files:**

- Modify: `prisma/apply-projection-values.ts`
- Test: `src/__tests__/projectionApply.test.ts`

- [ ] **Step 1: Add tests for baseline projected points in CSV parsing and joins**

Modify imports in `src/__tests__/projectionApply.test.ts`:

```ts
import {
  getSleeperIdUpdates,
  resolvePlayerSleeperIds,
  type CsvProjectionRow,
  groupProjectionRowsBySource,
  joinPlayersToProjectionRows,
  parseProjectionRows,
} from '../../prisma/apply-projection-values';
```

Update the first test's projection row and expected joined result:

```ts
it('joins players to projection rows by sleeperId', () => {
  const joined = joinPlayersToProjectionRows(
    [{ id: 1, name: 'A', pos: 'QB', sleeperId: '10', budget: 20 }],
    [
      {
        sleeperId: '10',
        position: 'QB',
        projectedPoints: 300,
        baselineProjectedPoints: 280,
        isRookie: false,
      },
    ],
  );

  expect(joined).toEqual([
    {
      playerId: 1,
      sleeperId: '10',
      position: 'QB',
      projectedPoints: 300,
      baselineProjectedPoints: 280,
      fallbackAuctionValue: 20,
      isRookie: false,
    },
  ]);
});
```

Append this test to the file:

```ts
it('parses projection rows with both draft and baseline scoring points', () => {
  const rows = parseProjectionRows(
    [
      'sleeper_id,position,games,pass_att,pass_cmp,pass_yds,pass_td,pass_int,pass_sacks,rush_att,rush_yds,rush_td,targets,receptions,rec_yds,rec_td,base_fantasy_points,projection_rank,years_exp,projection_source,projection_date,season',
      '10,TE,17,0,0,0,0,0,0,0,0,0,120,90,1000,8,0,1,8,mike_clay,2026-06-01,2026',
    ].join('\\n'),
    {
      passYdsPerPoint: 25,
      passTD: 4,
      passInt: -2,
      rushAtt: 0,
      rushFD: 0,
      pprRB: 1,
      pprWR: 1,
      pprTE: 2,
      recFD: 0,
      rbFDBonus: 0,
      wrFDBonus: 0,
      teFDBonus: 0,
    },
  );

  expect(rows[0].projectedPoints).toBeGreaterThan(rows[0].baselineProjectedPoints);
  expect(rows[0].baselineProjectedPoints).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
pnpm test -- src/__tests__/projectionApply.test.ts
```

Expected: FAIL because `ProjectionJoinRow` and `JoinedProjectionRow` do not include
`baselineProjectedPoints`, and `parseProjectionRows` does not exist.

- [ ] **Step 3: Update apply-script types and parsing**

Modify `prisma/apply-projection-values.ts`:

```ts
export interface ProjectionJoinRow {
  sleeperId: string;
  position: VorPosition;
  projectedPoints: number;
  baselineProjectedPoints: number;
  isRookie: boolean;
}

export interface JoinedProjectionRow {
  playerId: number;
  sleeperId: string;
  position: VorPosition;
  projectedPoints: number;
  baselineProjectedPoints: number;
  fallbackAuctionValue: number;
  isRookie: boolean;
}

export interface CsvProjectionRow {
  sleeperId: string;
  position: VorPosition;
  games: number;
  passAtt: number;
  passCmp: number;
  passYds: number;
  passTd: number;
  passInt: number;
  passSacks: number;
  rushAtt: number;
  rushYds: number;
  rushTd: number;
  targets: number;
  receptions: number;
  recYds: number;
  recTd: number;
  baseFantasyPoints: number;
  projectionRank: number | null;
  projectedPoints: number;
  baselineProjectedPoints: number;
  isRookie: boolean;
  projectionSource: string;
  projectionDate: Date | null;
  projectionSeason: number | null;
}
```

Update `joinPlayersToProjectionRows`:

```ts
export function joinPlayersToProjectionRows(
  players: PlayerJoinRow[],
  projections: ProjectionJoinRow[],
): JoinedProjectionRow[] {
  const projectionsBySleeperId = new Map(
    projections.map((projection) => [projection.sleeperId, projection]),
  );

  return players.flatMap((player) => {
    if (!player.sleeperId) return [];
    const projection = projectionsBySleeperId.get(player.sleeperId);
    if (!projection) return [];
    return [
      {
        playerId: player.id,
        sleeperId: player.sleeperId,
        position: projection.position,
        projectedPoints: projection.projectedPoints,
        baselineProjectedPoints: projection.baselineProjectedPoints,
        fallbackAuctionValue: player.budget,
        isRookie: projection.isRookie,
      },
    ];
  });
}
```

Extract `parseProjectionRows` so tests can pass CSV contents directly:

```ts
export function readProjectionRows(path: string, scoring: ScoringSettings): CsvProjectionRow[] {
  return parseProjectionRows(readFileSync(path, 'utf-8'), scoring);
}

export function parseProjectionRows(
  contents: string,
  scoring: ScoringSettings,
): CsvProjectionRow[] {
  return parseCsv(contents).flatMap((row) => {
    const position = toVorPosition(row.position);
    if (!row.sleeper_id || !position) return [];

    const stats: ProjectionStats = {
      sleeperId: row.sleeper_id,
      position,
      games: toNumber(row.games),
      passAtt: toNumber(row.pass_att),
      passCmp: toNumber(row.pass_cmp),
      passYds: toNumber(row.pass_yds),
      passTd: toNumber(row.pass_td),
      passInt: toNumber(row.pass_int),
      passSacks: toNumber(row.pass_sacks),
      rushAtt: toNumber(row.rush_att),
      rushYds: toNumber(row.rush_yds),
      rushTd: toNumber(row.rush_td),
      targets: toNumber(row.targets),
      receptions: toNumber(row.receptions),
      recYds: toNumber(row.rec_yds),
      recTd: toNumber(row.rec_td),
    };

    return [
      {
        sleeperId: row.sleeper_id,
        position,
        games: stats.games,
        passAtt: stats.passAtt,
        passCmp: stats.passCmp,
        passYds: stats.passYds,
        passTd: stats.passTd,
        passInt: stats.passInt,
        passSacks: stats.passSacks,
        rushAtt: stats.rushAtt,
        rushYds: stats.rushYds,
        rushTd: stats.rushTd,
        targets: stats.targets,
        receptions: stats.receptions,
        recYds: stats.recYds,
        recTd: stats.recTd,
        baseFantasyPoints: toNumber(row.base_fantasy_points),
        projectionRank: row.projection_rank ? toNumber(row.projection_rank) : null,
        projectedPoints: calculateProjectedPoints(stats, scoring),
        baselineProjectedPoints: calculateProjectedPoints(stats, DEFAULT_SCORING_SETTINGS),
        isRookie: toNumber(row.years_exp) === 0,
        projectionSource: row.projection_source || 'unknown',
        projectionDate: row.projection_date
          ? new Date(`${row.projection_date}T00:00:00.000Z`)
          : null,
        projectionSeason: row.season ? toNumber(row.season) : null,
      },
    ];
  });
}
```

In `main`, update the projection rows passed to `joinPlayersToProjectionRows`:

```ts
const joined = joinPlayersToProjectionRows(
  playersWithSleeperIds,
  group.rows.map((row) => ({
    sleeperId: row.sleeperId,
    position: row.position,
    projectedPoints: row.projectedPoints,
    baselineProjectedPoints: row.baselineProjectedPoints,
    isRookie: row.isRookie,
  })),
);
```

- [ ] **Step 4: Run apply tests**

Run:

```bash
pnpm test -- src/__tests__/projectionApply.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add prisma/apply-projection-values.ts src/__tests__/projectionApply.test.ts
git commit -m "feat: carry baseline projection points"
```

---

### Task 4: Make Projection-Shaped Values The Active Draft Values

**Files:**

- Modify: `prisma/apply-projection-values.ts`
- Test: `src/__tests__/projectionApply.test.ts`
- Test: `src/__tests__/playerValueMapping.test.ts`

- [ ] **Step 1: Add tests for active value source integration**

Add this import near the top of `src/__tests__/projectionApply.test.ts`:

```ts
import { calculateProjectionMarketValues } from '@/lib/projectionMarketValue';
```

Then append this test to `src/__tests__/projectionApply.test.ts`:

```ts
it('calculates projection-adjusted market values from joined projection rows', () => {
  const joined = [
    {
      playerId: 1,
      sleeperId: 'high-volume-te',
      position: 'TE' as const,
      projectedPoints: 250,
      baselineProjectedPoints: 200,
      fallbackAuctionValue: 100,
      isRookie: false,
    },
    {
      playerId: 2,
      sleeperId: 'efficiency-te',
      position: 'TE' as const,
      projectedPoints: 220,
      baselineProjectedPoints: 200,
      fallbackAuctionValue: 98,
      isRookie: false,
    },
  ];

  const values = calculateProjectionMarketValues({
    players: joined.map((row) => ({
      sleeperId: row.sleeperId,
      name: String(row.playerId),
      position: row.position,
      projectedPoints: row.projectedPoints,
      baselineProjectedPoints: row.baselineProjectedPoints,
      fallbackAuctionValue: row.fallbackAuctionValue,
      isRookie: row.isRookie,
    })),
  });

  const highVolume = values.find((value) => value.sleeperId === 'high-volume-te')!;
  expect(highVolume.activeAuctionValue).toBeGreaterThan(100);
  expect(highVolume.valueSource).toBe('projection_adjusted_market');
});
```

In `src/__tests__/playerValueMapping.test.ts`, add or confirm this test exists:

```ts
it('uses projection active values and derives floor and ceiling from the active target', () => {
  const [player] = mapPlayersWithDraftValues(
    [
      {
        id: 1,
        name: 'A',
        nflTeam: 'KC',
        pos: 'TE',
        age: 25,
        sfRank: 1,
        budget: 120,
        ceiling: 138,
        floor: 104,
        notes: '',
        sleeperId: '10',
      },
    ],
    [
      {
        playerId: 1,
        projectionSourceId: 1,
        projectedPoints: 250,
        replacementPoints: 180,
        vor: 70,
        projectionAuctionValue: 160,
        fallbackAuctionValue: 120,
        activeAuctionValue: 170,
        valueSource: 'projection_adjusted_market',
        updatedAt: new Date('2026-07-01T00:00:00.000Z'),
      },
    ],
  );

  expect(player.budget).toBe(170);
  expect(player.floor).toBe(148);
  expect(player.ceiling).toBe(196);
  expect(player.valueSource).toBe('projection_adjusted_market');
});
```

- [ ] **Step 2: Run targeted tests**

Run:

```bash
pnpm test -- src/__tests__/projectionApply.test.ts src/__tests__/playerValueMapping.test.ts
```

Expected: PASS for mapping test if it already existed; projection apply integration may fail until
the apply script imports and uses the new valuation module.

- [ ] **Step 3: Integrate market values into apply script writes**

Modify imports in `prisma/apply-projection-values.ts`:

```ts
import {
  calculateProjectionMarketValues,
  type ProjectionMarketValueOutput,
} from '@/lib/projectionMarketValue';
```

After the existing `values` calculation in `main`, add market value calculation:

```ts
const projectionMarketValues = calculateProjectionMarketValues({
  players: joined.map((row) => ({
    sleeperId: row.sleeperId,
    name: String(row.playerId),
    position: row.position,
    projectedPoints: row.projectedPoints,
    baselineProjectedPoints: row.baselineProjectedPoints,
    fallbackAuctionValue: row.fallbackAuctionValue,
    isRookie: row.isRookie,
  })),
});
const marketValuesBySleeperId = new Map(
  projectionMarketValues.map((value) => [value.sleeperId, value]),
);
```

Keep the VOR calculation and `valuesBySleeperId` map for diagnostics. Update
`draftPlayerValueWrites`:

```ts
const draftPlayerValueWrites = joined.flatMap((row) => {
  const value = valuesBySleeperId.get(row.sleeperId);
  const marketValue = marketValuesBySleeperId.get(row.sleeperId);
  if (!value || !marketValue) return [];
  const data = draftPlayerValueData(row, value, marketValue);
  return [
    prisma.draftPlayerValue.upsert({
      where: {
        draftId_playerId_projectionSourceId: {
          draftId: draft.id,
          playerId: row.playerId,
          projectionSourceId: source.id,
        },
      },
      create: {
        draftId: draft.id,
        playerId: row.playerId,
        projectionSourceId: source.id,
        ...data,
      },
      update: data,
    }),
  ];
});
```

Add this helper near `playerProjectionData`:

```ts
function draftPlayerValueData(
  row: JoinedProjectionRow,
  value: {
    replacementPoints: number | null;
    vor: number | null;
    projectionAuctionValue: number | null;
  },
  marketValue: ProjectionMarketValueOutput,
) {
  return {
    projectedPoints: row.projectedPoints,
    replacementPoints: value.replacementPoints,
    vor: value.vor,
    projectionAuctionValue: value.projectionAuctionValue,
    fallbackAuctionValue: row.fallbackAuctionValue,
    activeAuctionValue: marketValue.activeAuctionValue,
    valueSource: marketValue.valueSource,
  };
}
```

- [ ] **Step 4: Remove inactive projection override wiring**

In `prisma/apply-projection-values.ts`, keep this `calculateProjectionValues` call for VOR
diagnostics, but remove the misleading activation flag:

```ts
const values = calculateProjectionValues({
  players: projectionInputs,
  teamCount: draft.teamCount,
  rosterSize: draft.rosterSize,
  budget: draft.budget,
  startingLineup: toStartingLineup(draft.startingLineup),
  targetRoster: toTargetRoster(draft.targetRoster),
  scoringSettings,
});
```

The active target now comes from `calculateProjectionMarketValues`.

- [ ] **Step 5: Run targeted tests**

Run:

```bash
pnpm test -- src/__tests__/projectionApply.test.ts src/__tests__/projectionMarketValue.test.ts src/__tests__/playerValueMapping.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```bash
git add prisma/apply-projection-values.ts src/__tests__/projectionApply.test.ts src/__tests__/playerValueMapping.test.ts
git commit -m "feat: activate projection-shaped market values"
```

---

### Task 5: Final Verification And Calibration Notes

**Files:**

- Modify: `docs/superpowers/specs/2026-07-10-projection-shaped-market-values-design.md`
  only if implementation choices differ from the approved spec.
- No code changes expected.

- [ ] **Step 1: Run full test suite**

Run:

```bash
pnpm test
```

Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run:

```bash
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 3: Run lint**

Run:

```bash
pnpm lint
```

Expected: PASS.

- [ ] **Step 4: Inspect final diff**

Run:

```bash
git status --short
git diff --stat
git diff -- src/lib/projectionMarketValue.ts prisma/apply-projection-values.ts src/__tests__/projectionMarketValue.test.ts src/__tests__/projectionApply.test.ts src/__tests__/playerValueMapping.test.ts
```

Expected:

- No unrelated files in `git status --short`.
- Diff contains only projection market valuation code, apply-script integration, and tests.

- [ ] **Step 5: Commit final docs correction if needed**

If Step 4 shows that the implementation required a spec correction, run:

```bash
git add docs/superpowers/specs/2026-07-10-projection-shaped-market-values-design.md
git commit -m "docs: align projection value design with implementation"
```

If no spec correction is needed, do not create an empty commit.
