# Canonical Active Values and Team Statistics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every draft view one active-player pipeline and one team-statistics calculator while
preserving a separate net-budget-delta seam for future budget-for-picks trades.

**Architecture:** `getActiveDraftPlayers` will be the database-backed composition boundary for
projection/fallback mapping, dynamic future-pick values, and auction-mode filtering.
`computeDraftTeamStats` will be a pure, order-preserving calculator backed by a shared
`countsTowardRoster` policy. Pages and APIs will load their existing draft state, call these shared
boundaries, and retain only view-specific presentation transforms.

**Tech Stack:** Next.js 16 App Router, TypeScript 5 strict mode, Prisma 7, PostgreSQL, Jest 30,
React 19, pnpm 11.

## Global Constraints

- QB/RB/WR/TE auction results consume one roster slot; PICK/PKG results spend budget but consume no
  roster slot and do not contribute to average roster age.
- Player lookup prefers a present `playerId`; exact-name fallback is only for legacy results with no
  player ID.
- Active values are composed in this order: draft projection/fallback mapping, dynamic pick
  adjustment, then future-pick auction-mode filtering.
- `spent` is auction-result spend only. Team finances use
  `remaining = startingBudget + netBudgetDelta - spent`, with net delta defaulting to zero.
- Dynamic pick value remains anchored to `futurePickOriginHandle`; this work does not model current
  pick ownership or trade persistence.
- Preserve current projection-source selection until HARD-006.
- Preserve caller-controlled team sorting and existing UI behavior.
- Do not add a migration, schema field, trade table, trade UI, or unrelated refactor.
- Use single quotes, trailing commas, two-space indentation, 100-character Prettier width, explicit
  props/input interfaces, and no explicit `any`.
- Follow test-driven development: observe each new test fail for the intended missing behavior before
  implementing it.

---

## File Map

### New files

- `src/lib/rosterPolicy.ts` — one exported predicate defining which positions consume roster slots.
- `src/lib/computeDraftTeamStats.ts` — pure canonical statistics and roster-entry calculator.
- `src/lib/activeDraftPlayers.ts` — database-backed canonical active-player pipeline.
- `src/__tests__/fixtures/draftTeamStats.ts` — typed mixed-position fixture shared by calculator and
  nomination API tests.
- `src/__tests__/rosterPolicy.test.ts` — roster policy unit tests.
- `src/__tests__/computeDraftTeamStats.test.ts` — canonical statistics, identity, value, age, and
  budget-delta tests.
- `src/__tests__/activeDraftPlayers.test.ts` — active-value query and composition tests.
- `src/__tests__/activeDraftPlayerConsumers.test.ts` — architecture regression test proving all five
  server consumers use the canonical player service.

### Modified files

- `src/lib/bidMutation.ts` — consume `countsTowardRoster` rather than a private position set.
- `src/__tests__/bidMutation.test.ts` — retain legality characterization under the shared policy.
- `src/app/draft/[draftId]/page.tsx` — use canonical active players before value spreads.
- `src/app/draft/[draftId]/nominate/page.tsx` — use canonical active players.
- `src/app/draft/[draftId]/teams/page.tsx` — use canonical active players and team statistics.
- `src/app/draft/[draftId]/budget/page.tsx` — use canonical active players and team statistics.
- `src/app/api/draft/[draftId]/nomination-data/route.ts` — use canonical players and team statistics.
- `src/__tests__/api/nomination-data.test.ts` — verify canonical PICK/PKG and value behavior.
- `docs/draftops-audit-workstreams.md` — record the verified HARD-004 implementation checkpoint.

### Removed files

- `src/lib/budget.ts` — duplicate fallback-only statistics implementation.
- `src/lib/computeTeamStats.ts` — superseded statistics implementation.
- `src/__tests__/lib/budget.test.ts` — duplicate tests moved into the canonical suite.
- `src/__tests__/computeTeamStats.test.ts` — tests moved into the canonical suite.
- `src/__tests__/auctionPlayerPipeline.test.ts` — pipeline-order coverage moves to the canonical
  service test.

---

### Task 1: Canonical roster policy and pure team statistics

**Files:**

- Create: `src/lib/rosterPolicy.ts`
- Create: `src/lib/computeDraftTeamStats.ts`
- Create: `src/__tests__/fixtures/draftTeamStats.ts`
- Create: `src/__tests__/rosterPolicy.test.ts`
- Create: `src/__tests__/computeDraftTeamStats.test.ts`
- Modify: `src/lib/bidMutation.ts:9-11,80-91`
- Modify: `src/__tests__/bidMutation.test.ts`

**Interfaces:**

- Produces:
  `countsTowardRoster(position: string): position is 'QB' | 'RB' | 'WR' | 'TE'`.
- Produces:
  `computeDraftTeamStats(input: ComputeDraftTeamStatsInput): TeamWithRoster[]`.
- `ComputeDraftTeamStatsInput` contains `teams`, `players`, `rosterSize`, and optional
  `budgetDeltaByTeamId: ReadonlyMap<number, number>`.
- Later tasks consume both functions without wrappers or aliases.

- [ ] **Step 1: Add the shared mixed-position fixture**

Create `src/__tests__/fixtures/draftTeamStats.ts` with typed players and one team whose results include
one QB, one WR, one PICK, and one PKG:

```ts
import type { Player } from '@/types';
import type { DraftTeamStatsInput } from '@/lib/computeDraftTeamStats';

export const CANONICAL_STATS_PLAYERS: Player[] = [
  {
    id: 11,
    player: 'Active QB',
    team: 'BUF',
    pos: 'QB',
    age: 27,
    sfRank: 1,
    budget: 180,
    ceiling: 207,
    floor: 157,
    notes: '',
  },
  {
    id: 12,
    player: 'Legacy WR',
    team: 'LAR',
    pos: 'WR',
    age: 23,
    sfRank: 2,
    budget: 120,
    ceiling: 138,
    floor: 104,
    notes: '',
  },
  {
    id: 13,
    player: 'origin 2027 1st',
    team: 'origin',
    pos: 'PICK',
    age: null,
    sfRank: 300,
    budget: 75,
    ceiling: 86,
    floor: 65,
    notes: '',
  },
  {
    id: 14,
    player: "origin's 2027 package",
    team: 'origin',
    pos: 'PKG',
    age: null,
    sfRank: 301,
    budget: 109,
    ceiling: 125,
    floor: 95,
    notes: '',
  },
];

export const CANONICAL_STATS_TEAMS: DraftTeamStatsInput[] = [
  {
    id: 1,
    handle: 'manager',
    displayName: 'Manager',
    budget: 1000,
    results: [
      {
        id: 101,
        playerId: 11,
        player: 'Active QB',
        position: 'QB',
        nflTeam: 'BUF',
        price: 200,
        sfRank: 1,
        teamId: 1,
      },
      {
        id: 102,
        playerId: null,
        player: 'Legacy WR',
        position: 'WR',
        nflTeam: 'LAR',
        price: 100,
        sfRank: 2,
        teamId: 1,
      },
      {
        id: 103,
        playerId: 13,
        player: 'origin 2027 1st',
        position: 'PICK',
        nflTeam: 'origin',
        price: 70,
        sfRank: 300,
        teamId: 1,
      },
      {
        id: 104,
        playerId: 14,
        player: "origin's 2027 package",
        position: 'PKG',
        nflTeam: 'origin',
        price: 110,
        sfRank: 301,
        teamId: 1,
      },
    ],
  },
];
```

- [ ] **Step 2: Write failing roster-policy and statistics tests**

Create `src/__tests__/rosterPolicy.test.ts`:

```ts
import { countsTowardRoster } from '@/lib/rosterPolicy';

describe('countsTowardRoster', () => {
  it.each(['QB', 'RB', 'WR', 'TE'])('counts %s', (position) => {
    expect(countsTowardRoster(position)).toBe(true);
  });

  it.each(['PICK', 'PKG', 'K', ''])('does not count %s', (position) => {
    expect(countsTowardRoster(position)).toBe(false);
  });
});
```

Create `src/__tests__/computeDraftTeamStats.test.ts` with these initial cases:

```ts
import { computeDraftTeamStats } from '@/lib/computeDraftTeamStats';
import {
  CANONICAL_STATS_PLAYERS,
  CANONICAL_STATS_TEAMS,
} from '@/__tests__/fixtures/draftTeamStats';

describe('computeDraftTeamStats', () => {
  it('uses one policy for spending, roster slots, packages, age, and active deltas', () => {
    const [stats] = computeDraftTeamStats({
      teams: CANONICAL_STATS_TEAMS,
      players: CANONICAL_STATS_PLAYERS,
      rosterSize: 30,
    });

    expect(stats).toMatchObject({
      spent: 480,
      remaining: 520,
      rosterCount: 2,
      rosterRemaining: 28,
      buyingPower: 492,
      pkgCount: 1,
      avgAge: 25,
    });
    expect(stats.results.map((result) => result.delta)).toEqual([20, -20, -5, 1]);
  });

  it('applies a net budget delta without treating it as spend or a roster result', () => {
    const [stats] = computeDraftTeamStats({
      teams: CANONICAL_STATS_TEAMS,
      players: CANONICAL_STATS_PLAYERS,
      rosterSize: 30,
      budgetDeltaByTeamId: new Map([[1, 80]]),
    });

    expect(stats.spent).toBe(480);
    expect(stats.remaining).toBe(600);
    expect(stats.rosterCount).toBe(2);
    expect(stats.buyingPower).toBe(572);
  });

  it('does not name-fallback when a present player ID is unknown', () => {
    const teams = structuredClone(CANONICAL_STATS_TEAMS);
    teams[0].results[0].playerId = 999;

    const [stats] = computeDraftTeamStats({
      teams,
      players: CANONICAL_STATS_PLAYERS,
      rosterSize: 30,
    });

    expect(stats.results[0].delta).toBeNull();
    expect(stats.avgAge).toBe(23);
  });
});
```

- [ ] **Step 3: Run the new tests and verify the intended failure**

Run:

```bash
pnpm test --runInBand src/__tests__/rosterPolicy.test.ts src/__tests__/computeDraftTeamStats.test.ts
```

Expected: FAIL because `@/lib/rosterPolicy` and `@/lib/computeDraftTeamStats` do not exist.

- [ ] **Step 4: Implement the shared policy**

Create `src/lib/rosterPolicy.ts`:

```ts
const ROSTER_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE']);

export function countsTowardRoster(position: string): position is 'QB' | 'RB' | 'WR' | 'TE' {
  return ROSTER_POSITIONS.has(position);
}
```

- [ ] **Step 5: Implement the pure calculator**

Create `src/lib/computeDraftTeamStats.ts` with these public inputs and calculation:

```ts
import { countsTowardRoster } from '@/lib/rosterPolicy';
import type { Player, RosterEntry, TeamWithRoster } from '@/types';

export interface DraftTeamResultInput {
  id: number;
  playerId?: number | null;
  player: string;
  position: string;
  nflTeam: string;
  price: number;
  sfRank: number | null;
  teamId: number;
}

export interface DraftTeamStatsInput {
  id: number;
  handle: string;
  displayName: string | null;
  budget: number;
  results: DraftTeamResultInput[];
}

export interface ComputeDraftTeamStatsInput {
  teams: DraftTeamStatsInput[];
  players: Player[];
  rosterSize: number;
  budgetDeltaByTeamId?: ReadonlyMap<number, number>;
}

export function computeDraftTeamStats({
  teams,
  players,
  rosterSize,
  budgetDeltaByTeamId,
}: ComputeDraftTeamStatsInput): TeamWithRoster[] {
  const playersById = new Map(
    players.flatMap((player) => (player.id === undefined ? [] : [[player.id, player] as const])),
  );
  const playersByName = new Map(players.map((player) => [player.player, player]));

  return teams.map((team) => {
    const spent = team.results.reduce((sum, result) => sum + result.price, 0);
    const remaining = team.budget + (budgetDeltaByTeamId?.get(team.id) ?? 0) - spent;
    const rosterCount = team.results.filter((result) => countsTowardRoster(result.position)).length;
    const rosterRemaining = rosterSize - rosterCount;
    const results: RosterEntry[] = [];
    const knownAges: number[] = [];

    for (const result of team.results) {
      const player =
        result.playerId === undefined || result.playerId === null
          ? playersByName.get(result.player)
          : playersById.get(result.playerId);

      results.push({
        ...result,
        teamHandle: team.handle,
        delta: player === undefined ? null : result.price - player.budget,
      });

      if (countsTowardRoster(result.position) && player?.age !== undefined && player.age !== null) {
        knownAges.push(player.age);
      }
    }

    return {
      id: team.id,
      handle: team.handle,
      displayName: team.displayName,
      budget: team.budget,
      spent,
      remaining,
      rosterCount,
      rosterRemaining,
      buyingPower: remaining - rosterRemaining,
      pkgCount: team.results.filter((result) => result.position === 'PKG').length,
      avgAge:
        knownAges.length === 0
          ? null
          : knownAges.reduce((sum, age) => sum + age, 0) / knownAges.length,
      results,
    };
  });
}
```

- [ ] **Step 6: Run the focused tests and verify they pass**

Run:

```bash
pnpm test --runInBand src/__tests__/rosterPolicy.test.ts src/__tests__/computeDraftTeamStats.test.ts
```

Expected: PASS with both suites green.

- [ ] **Step 7: Point bid legality at the shared policy**

In `src/lib/bidMutation.ts`, remove the private `ROSTER_POSITIONS` set, import
`countsTowardRoster`, and replace both `.has(...)` calls:

```ts
import { countsTowardRoster } from '@/lib/rosterPolicy';

const currentRosterCount = existingResults.reduce(
  (count, result) => count + (countsTowardRoster(result.position) ? 1 : 0),
  0,
);
const resultingRosterCount = currentRosterCount + (countsTowardRoster(input.position) ? 1 : 0);
```

Add this case to the `createBidRecord` describe block in
`src/__tests__/bidMutation.test.ts`:

```ts
it('ignores PICK and PKG results when checking the final skill roster slot', async () => {
  mockDraftFindFirst.mockResolvedValue({ ...ACTIVE_DRAFT, rosterSize: 2 });
  mockAuctionFindMany.mockResolvedValue([
    { id: 1, price: 100, position: 'RB' },
    { id: 2, price: 50, position: 'PICK' },
    { id: 3, price: 50, position: 'PKG' },
  ]);

  await expect(createBidRecord({ ...CREATE_INPUT, price: 800 })).resolves.toMatchObject({
    ok: true,
  });
});
```

- [ ] **Step 8: Run policy, calculator, and bid-legality tests**

Run:

```bash
pnpm test --runInBand src/__tests__/rosterPolicy.test.ts src/__tests__/computeDraftTeamStats.test.ts src/__tests__/bidMutation.test.ts
```

Expected: PASS, including the existing PICK/PKG legality cases.

- [ ] **Step 9: Commit Task 1**

```bash
git add src/lib/rosterPolicy.ts src/lib/computeDraftTeamStats.ts \
  src/lib/bidMutation.ts src/__tests__/fixtures/draftTeamStats.ts \
  src/__tests__/rosterPolicy.test.ts src/__tests__/computeDraftTeamStats.test.ts \
  src/__tests__/bidMutation.test.ts
git commit -m "refactor: centralize draft roster and team statistics policy"
```

---

### Task 2: Canonical active-player query service

**Files:**

- Create: `src/lib/activeDraftPlayers.ts`
- Create: `src/__tests__/activeDraftPlayers.test.ts`

**Interfaces:**

- Consumes existing `mapPlayersWithDraftValues`, `applyDynamicPickValues`, and
  `filterFuturePickAssetsForMode`.
- Produces `ActiveValueBidInput` with `player`, `price`, and `teamHandle`.
- Produces
  `getActiveDraftPlayers(input: GetActiveDraftPlayersInput): Promise<Player[]>` for every page and
  the nomination API.

- [ ] **Step 1: Write failing service tests**

Create `src/__tests__/activeDraftPlayers.test.ts` in the Node environment. Mock only Prisma so the
real mapping, dynamic-value, and filtering functions execute:

```ts
/**
 * @jest-environment node
 */
import { getActiveDraftPlayers } from '@/lib/activeDraftPlayers';

const mockPlayerFindMany = jest.fn();
const mockDraftPlayerValueFindMany = jest.fn();

jest.mock('@/lib/db', () => ({
  prisma: {
    player: { findMany: (...args: unknown[]) => mockPlayerFindMany(...args) },
    draftPlayerValue: {
      findMany: (...args: unknown[]) => mockDraftPlayerValueFindMany(...args),
    },
  },
}));

const dbPlayer = (overrides: Record<string, unknown>) => ({
  id: 1,
  name: 'Projected QB',
  nflTeam: 'BUF',
  pos: 'QB',
  age: 27,
  sfRank: 1,
  budget: 150,
  ceiling: 173,
  floor: 131,
  baseBudget: 150,
  baseCeiling: 173,
  baseFloor: 131,
  notes: '',
  sleeperId: 's1',
  customKey: null,
  futurePickYear: null,
  futurePickRound: null,
  futurePickOriginHandle: null,
  futurePickAssetKind: null,
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
});

it('maps projection and fallback values from one draft-scoped query', async () => {
  mockPlayerFindMany.mockResolvedValue([
    dbPlayer({}),
    dbPlayer({ id: 2, name: 'Fallback WR', pos: 'WR', budget: 90, sfRank: 2 }),
  ]);
  mockDraftPlayerValueFindMany.mockResolvedValue([
    {
      playerId: 1,
      projectionSourceId: 7,
      projectedPoints: 300,
      replacementPoints: 180,
      vor: 120,
      projectionAuctionValue: 170,
      fallbackAuctionValue: 150,
      activeAuctionValue: 165,
      valueSource: 'projection',
      updatedAt: new Date('2026-07-17T00:00:00Z'),
    },
  ]);

  const players = await getActiveDraftPlayers({
    draftId: 44,
    startingLineup: ['QB', 'RB', 'WR', 'TE', 'SUPER_FLEX'],
    futurePickAuctionMode: 'packages',
    bids: [],
  });

  expect(mockPlayerFindMany).toHaveBeenCalledWith({
    where: { draftId: 44 },
    orderBy: { sfRank: 'asc' },
  });
  expect(players.map((player) => player.budget)).toEqual([165, 90]);
});

it('applies dynamic pick values before auction-mode filtering', async () => {
  mockPlayerFindMany.mockResolvedValue([
    dbPlayer({ name: 'Origin QB', team: 'origin', projectedPoints: 250, vor: 70 }),
    dbPlayer({
      id: 2,
      name: "origin's 2027 package",
      nflTeam: 'origin',
      pos: 'PKG',
      budget: 109,
      baseBudget: 109,
      futurePickYear: 2027,
      futurePickOriginHandle: 'origin',
      futurePickAssetKind: 'package',
    }),
    dbPlayer({
      id: 3,
      name: 'origin 2027 1st',
      nflTeam: 'origin',
      pos: 'PICK',
      budget: 75,
      baseBudget: 75,
      futurePickYear: 2027,
      futurePickRound: 1,
      futurePickOriginHandle: 'origin',
      futurePickAssetKind: 'pick',
    }),
  ]);
  mockDraftPlayerValueFindMany.mockResolvedValue([]);

  const players = await getActiveDraftPlayers({
    draftId: 44,
    startingLineup: ['QB', 'RB', 'WR', 'TE', 'SUPER_FLEX'],
    futurePickAuctionMode: 'packages',
    bids: [{ player: 'Origin QB', price: 80, teamHandle: 'origin' }],
  });

  expect(players.map((player) => player.player)).toEqual(['Origin QB', "origin's 2027 package"]);
  expect(players[1].dynamicPickValue?.direction).toBe('down');
});
```

Add table cases using the same future-pick rows for `individual` and `none`, asserting only PICK rows
or no future-pick rows remain respectively. Add a rejection test where `mockPlayerFindMany` rejects
and assert `getActiveDraftPlayers(...)` rejects with the same error.

- [ ] **Step 2: Run the service test and verify it fails**

Run:

```bash
pnpm test --runInBand src/__tests__/activeDraftPlayers.test.ts
```

Expected: FAIL because `@/lib/activeDraftPlayers` does not exist.

- [ ] **Step 3: Implement the active-player service**

Create `src/lib/activeDraftPlayers.ts`:

```ts
import { prisma } from '@/lib/db';
import { applyDynamicPickValues } from '@/lib/dynamicPickValues';
import { filterFuturePickAssetsForMode } from '@/lib/futurePickAssets';
import { mapPlayersWithDraftValues } from '@/lib/playerValueMapping';
import type { FuturePickAuctionMode, Player, StartingSlot } from '@/types';

export interface ActiveValueBidInput {
  player: string;
  price: number;
  teamHandle: string;
}

export interface GetActiveDraftPlayersInput {
  draftId: number;
  startingLineup: StartingSlot[];
  futurePickAuctionMode: FuturePickAuctionMode;
  bids: ActiveValueBidInput[];
}

export async function getActiveDraftPlayers({
  draftId,
  startingLineup,
  futurePickAuctionMode,
  bids,
}: GetActiveDraftPlayersInput): Promise<Player[]> {
  const [players, draftValues] = await Promise.all([
    prisma.player.findMany({ where: { draftId }, orderBy: { sfRank: 'asc' } }),
    prisma.draftPlayerValue.findMany({
      where: { draftId },
      select: {
        playerId: true,
        projectionSourceId: true,
        projectedPoints: true,
        replacementPoints: true,
        vor: true,
        projectionAuctionValue: true,
        fallbackAuctionValue: true,
        activeAuctionValue: true,
        valueSource: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
    }),
  ]);

  const dynamicPlayers = applyDynamicPickValues({
    players: mapPlayersWithDraftValues(players, draftValues),
    bids,
    startingLineup,
  });

  return filterFuturePickAssetsForMode(dynamicPlayers, futurePickAuctionMode);
}
```

- [ ] **Step 4: Run active-value tests**

Run:

```bash
pnpm test --runInBand src/__tests__/activeDraftPlayers.test.ts \
  src/__tests__/playerValueMapping.test.ts src/__tests__/dynamicPickValues.test.ts \
  src/__tests__/futurePickAssets.test.ts
```

Expected: PASS with projection, fallback, dynamic adjustment, mode filtering, and propagation cases
green.

- [ ] **Step 5: Commit Task 2**

```bash
git add src/lib/activeDraftPlayers.ts src/__tests__/activeDraftPlayers.test.ts
git commit -m "refactor: add canonical active draft player service"
```

---

### Task 3: Value sheet and nomination page consumers

**Files:**

- Create: `src/__tests__/activeDraftPlayerConsumers.test.ts`
- Modify: `src/app/draft/[draftId]/page.tsx:7-10,25-64,76-91`
- Modify: `src/app/draft/[draftId]/nominate/page.tsx:6-9,20-59`

**Interfaces:**

- Consumes `getActiveDraftPlayers(GetActiveDraftPlayersInput)` from Task 2.
- Value sheet keeps `computeSpreads(players)` as its only post-service valuation transform.
- Nomination page passes the service result directly to `NominationHelper`.

- [ ] **Step 1: Add a failing architecture regression test for the first two consumers**

Create `src/__tests__/activeDraftPlayerConsumers.test.ts`:

```ts
/**
 * @jest-environment node
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const consumers = ['src/app/draft/[draftId]/page.tsx', 'src/app/draft/[draftId]/nominate/page.tsx'];

describe('active draft player consumers', () => {
  it.each(consumers)('%s uses the canonical service', (file) => {
    const source = readFileSync(resolve(process.cwd(), file), 'utf8');

    expect(source).toContain("from '@/lib/activeDraftPlayers'");
    expect(source).toContain('getActiveDraftPlayers({');
    expect(source).not.toContain("from '@/lib/playerValueMapping'");
    expect(source).not.toContain("from '@/lib/dynamicPickValues'");
  });
});
```

- [ ] **Step 2: Run the consumer test and verify it fails**

Run:

```bash
pnpm test --runInBand src/__tests__/activeDraftPlayerConsumers.test.ts
```

Expected: FAIL because both pages still assemble the pipeline directly.

- [ ] **Step 3: Refactor the value sheet**

In `src/app/draft/[draftId]/page.tsx`:

- Replace imports of `mapPlayersWithDraftValues`, `applyDynamicPickValues`, and
  `filterFuturePickAssetsForMode` with `getActiveDraftPlayers` and retain
  `fromPrismaFuturePickMode`.
- Remove `dbPlayers` and `draftValues` from the initial `Promise.all`.
- After mapping `claimedBids`, call:

```ts
const activePlayers = await getActiveDraftPlayers({
  draftId,
  startingLineup: (draft.startingLineup ?? DEFAULT_STARTING_LINEUP) as StartingSlot[],
  futurePickAuctionMode: fromPrismaFuturePickMode(draft.futurePickAuctionMode),
  bids: rawBids.map((bid) => ({
    player: bid.player,
    price: bid.price,
    teamHandle: bid.team.handle,
  })),
});
const players = computeSpreads(activePlayers);
```

Do not change `claimedBids`, Sleeper sync configuration, component props, or read-only behavior.

- [ ] **Step 4: Refactor the nomination page**

In `src/app/draft/[draftId]/nominate/page.tsx`:

- Replace direct mapping/dynamic/filter imports with `getActiveDraftPlayers` and retain
  `fromPrismaFuturePickMode`.
- Query only `rawBids` before the service call.
- Replace the local pipeline with:

```ts
const players = await getActiveDraftPlayers({
  draftId,
  startingLineup: (draft.startingLineup ?? DEFAULT_STARTING_LINEUP) as StartingSlot[],
  futurePickAuctionMode: fromPrismaFuturePickMode(draft.futurePickAuctionMode),
  bids: rawBids.map((bid) => ({
    player: bid.player,
    price: bid.price,
    teamHandle: bid.team.handle,
  })),
});
```

Keep `NominationHelper` props unchanged.

- [ ] **Step 5: Run the service and consumer tests**

Run:

```bash
pnpm test --runInBand src/__tests__/activeDraftPlayers.test.ts \
  src/__tests__/activeDraftPlayerConsumers.test.ts src/__tests__/AuctionSheet.claimed.test.tsx \
  src/__tests__/NominationHelper.ui.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Typecheck the server-page refactor**

Run:

```bash
pnpm typecheck
```

Expected: PASS with no Prisma payload or page-prop errors.

- [ ] **Step 7: Commit Task 3**

```bash
git add src/app/draft/[draftId]/page.tsx src/app/draft/[draftId]/nominate/page.tsx \
  src/__tests__/activeDraftPlayerConsumers.test.ts
git commit -m "refactor: use canonical values on draft and nomination pages"
```

---

### Task 4: Teams and budget consumers; remove duplicate calculators

**Files:**

- Modify: `src/app/draft/[draftId]/teams/page.tsx:5-10,21-62`
- Modify: `src/app/draft/[draftId]/budget/page.tsx:5,19-40`
- Modify: `src/__tests__/activeDraftPlayerConsumers.test.ts`
- Delete: `src/lib/budget.ts`
- Delete: `src/lib/computeTeamStats.ts`
- Delete: `src/__tests__/lib/budget.test.ts`
- Delete: `src/__tests__/computeTeamStats.test.ts`
- Delete: `src/__tests__/auctionPlayerPipeline.test.ts`

**Interfaces:**

- Consumes `getActiveDraftPlayers` from Task 2.
- Consumes `computeDraftTeamStats` from Task 1.
- Budget view receives `TeamStats[]` through structural compatibility with `TeamWithRoster[]`.

- [ ] **Step 1: Expand the failing consumer regression test**

Add these paths to the `consumers` array in
`src/__tests__/activeDraftPlayerConsumers.test.ts`:

```ts
'src/app/draft/[draftId]/teams/page.tsx',
'src/app/draft/[draftId]/budget/page.tsx',
```

Add a separate assertion for statistics consumers:

```ts
it.each(['src/app/draft/[draftId]/teams/page.tsx', 'src/app/draft/[draftId]/budget/page.tsx'])(
  '%s uses canonical team statistics',
  (file) => {
    const source = readFileSync(resolve(process.cwd(), file), 'utf8');

    expect(source).toContain("from '@/lib/computeDraftTeamStats'");
    expect(source).toContain('computeDraftTeamStats({');
    expect(source).not.toContain("from '@/lib/budget'");
    expect(source).not.toContain("from '@/lib/computeTeamStats'");
  },
);
```

- [ ] **Step 2: Run the consumer test and verify it fails**

Run:

```bash
pnpm test --runInBand src/__tests__/activeDraftPlayerConsumers.test.ts
```

Expected: FAIL for teams and budget imports.

- [ ] **Step 3: Refactor the teams page**

In `src/app/draft/[draftId]/teams/page.tsx`, query only `rawTeams`, then derive bids and active
players:

```ts
const rawTeams = await prisma.team.findMany({
  where: { draftId },
  include: { results: true },
  orderBy: { handle: 'asc' },
});
const bids = rawTeams.flatMap((team) =>
  team.results.map((result) => ({
    player: result.player,
    price: result.price,
    teamHandle: team.handle,
  })),
);
const players = await getActiveDraftPlayers({
  draftId,
  startingLineup: (draft.startingLineup ?? DEFAULT_STARTING_LINEUP) as StartingSlot[],
  futurePickAuctionMode: fromPrismaFuturePickMode(draft.futurePickAuctionMode),
  bids,
});
const teams = computeDraftTeamStats({
  teams: rawTeams,
  players,
  rosterSize: draft.rosterSize,
});
const tendencies = computeTendencies(rawTeams, players);
```

Pass `teams` to `RosterTracker`. Import `fromPrismaFuturePickMode`, `getActiveDraftPlayers`, and
`computeDraftTeamStats`; remove direct mapper/dynamic imports.

- [ ] **Step 4: Refactor the budget page**

In `src/app/draft/[draftId]/budget/page.tsx`, load teams and nominations, then derive active players:

```ts
const [teams, nominated] = await Promise.all([
  prisma.team.findMany({ where: { draftId }, include: { results: true } }),
  prisma.nominatedPlayer.findMany({ where: { draftId }, orderBy: { createdAt: 'desc' } }),
]);
const bids = teams.flatMap((team) =>
  team.results.map((result) => ({
    player: result.player,
    price: result.price,
    teamHandle: team.handle,
  })),
);
const players = await getActiveDraftPlayers({
  draftId,
  startingLineup: (draft.startingLineup ?? DEFAULT_STARTING_LINEUP) as StartingSlot[],
  futurePickAuctionMode: fromPrismaFuturePickMode(draft.futurePickAuctionMode),
  bids,
});
const posByName = new Map(players.map((player) => [player.player, player.pos]));
const posByPlayerId = new Map(
  players.flatMap((player) => (player.id === undefined ? [] : [[player.id, player.pos] as const])),
);
const live = resolveLiveNomination(nominated, posByName, posByPlayerId);
const tendencies = computeTendencies(teams, players);
const teamStats = computeDraftTeamStats({
  teams,
  players,
  rosterSize: draft.rosterSize,
});
```

Pass `teamStats` to `BudgetPressureView`. Remove the fallback-only player query and old budget helper.
Do not add page-level sorting because `ThreatBoard` already ranks rows by threat.

- [ ] **Step 5: Remove superseded implementations and tests**

Delete the two old calculators and their duplicate unit suites with `apply_patch`:

```diff
*** Delete File: src/lib/budget.ts
*** Delete File: src/lib/computeTeamStats.ts
*** Delete File: src/__tests__/lib/budget.test.ts
*** Delete File: src/__tests__/computeTeamStats.test.ts
*** Delete File: src/__tests__/auctionPlayerPipeline.test.ts
```

The dynamic-before-filter assertion from `auctionPlayerPipeline.test.ts` must already be present in
`activeDraftPlayers.test.ts` before deletion.

- [ ] **Step 6: Verify no duplicate imports or implementations remain**

Run:

```bash
rg -n "@/lib/(budget|computeTeamStats)|function computeTeamStats|mapPlayersWithDraftValues|applyDynamicPickValues" src/app src/lib
```

Expected: no old calculator imports or definitions; mapper/dynamic calls exist only inside
`src/lib/activeDraftPlayers.ts` and their own library modules.

- [ ] **Step 7: Run focused tests and typecheck**

Run:

```bash
pnpm test --runInBand src/__tests__/computeDraftTeamStats.test.ts \
  src/__tests__/activeDraftPlayers.test.ts src/__tests__/activeDraftPlayerConsumers.test.ts \
  src/__tests__/tendencies.test.ts src/__tests__/ThreatBoard.test.tsx \
  src/__tests__/RosterTracker.test.tsx
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit Task 4**

```bash
git add src/app/draft/[draftId]/teams/page.tsx src/app/draft/[draftId]/budget/page.tsx \
  src/__tests__/activeDraftPlayerConsumers.test.ts src/lib/budget.ts \
  src/lib/computeTeamStats.ts src/__tests__/lib/budget.test.ts \
  src/__tests__/computeTeamStats.test.ts src/__tests__/auctionPlayerPipeline.test.ts
git commit -m "refactor: unify team and budget draft calculations"
```

---

### Task 5: Canonical nomination API response

**Files:**

- Modify: `src/app/api/draft/[draftId]/nomination-data/route.ts:5-6,19-44,61-73`
- Modify: `src/__tests__/api/nomination-data.test.ts`
- Modify: `src/__tests__/activeDraftPlayerConsumers.test.ts`

**Interfaces:**

- Consumes `getActiveDraftPlayers` and `computeDraftTeamStats`.
- Returns the existing JSON contract; `teamStats` values change only where prior calculations were
  inconsistent.

- [ ] **Step 1: Expand API mocks and add the failing canonical fixture assertion**

In `src/__tests__/api/nomination-data.test.ts`, import the shared fixture and add named mocks before
the existing `jest.mock` calls:

```ts
import {
  CANONICAL_STATS_PLAYERS,
  CANONICAL_STATS_TEAMS,
} from '@/__tests__/fixtures/draftTeamStats';

const mockTeamFindMany = jest.fn();
const mockWatchlistFindMany = jest.fn();
const mockNominatedFindMany = jest.fn();
const mockGetActiveDraftPlayers = jest.fn();
```

Add the service mock and replace the existing database mock with named functions:

```ts
jest.mock('@/lib/activeDraftPlayers', () => ({
  getActiveDraftPlayers: (...args: unknown[]) => mockGetActiveDraftPlayers(...args),
}));

jest.mock('@/lib/db', () => ({
  prisma: {
    team: { findMany: (...args: unknown[]) => mockTeamFindMany(...args) },
    playerWatchlist: { findMany: (...args: unknown[]) => mockWatchlistFindMany(...args) },
    nominatedPlayer: { findMany: (...args: unknown[]) => mockNominatedFindMany(...args) },
  },
}));
```

Extend `MOCK_DRAFT` with the fields consumed by the canonical service:

```ts
rosterSize: 30,
startingLineup: null,
futurePickAuctionMode: 'PACKAGES',
targetRoster: null,
```

Set the default mock results in `beforeEach`:

```ts
mockTeamFindMany.mockResolvedValue([]);
mockWatchlistFindMany.mockResolvedValue([]);
mockNominatedFindMany.mockResolvedValue([]);
mockGetActiveDraftPlayers.mockResolvedValue([]);
```

Add this test:

```ts
it('uses canonical roster and spending policy for nomination stats', async () => {
  mockTeamFindMany.mockResolvedValue(
    CANONICAL_STATS_TEAMS.map((team) => ({
      ...team,
      results: team.results.map((result) => ({
        ...result,
        createdAt: new Date('2026-07-17T00:00:00Z'),
      })),
    })),
  );
  mockGetActiveDraftPlayers.mockResolvedValue(CANONICAL_STATS_PLAYERS);
  mockGetDraft.mockResolvedValue({ ...MOCK_DRAFT, rosterSize: 30 });

  const response = await GET(new NextRequest('http://localhost/'), MOCK_PARAMS);
  const body = await response.json();

  expect(body.teamStats[0]).toMatchObject({
    spent: 480,
    remaining: 520,
    rosterCount: 2,
    rosterRemaining: 28,
    buyingPower: 492,
    pkgCount: 1,
    avgAge: 25,
  });
});
```

Also assert the service receives normalized draft settings and bid handles.

- [ ] **Step 2: Add the API to the failing consumer regression test**

Add `src/app/api/draft/[draftId]/nomination-data/route.ts` to the `consumers` array and the
statistics-consumer list in `src/__tests__/activeDraftPlayerConsumers.test.ts`.

- [ ] **Step 3: Run the two tests and verify they fail**

Run:

```bash
pnpm test --runInBand src/__tests__/api/nomination-data.test.ts \
  src/__tests__/activeDraftPlayerConsumers.test.ts
```

Expected: FAIL because the API still calculates team statistics inline and does not load canonical
active players.

- [ ] **Step 4: Refactor the nomination API**

In `src/app/api/draft/[draftId]/nomination-data/route.ts`:

- Import `getActiveDraftPlayers`, `computeDraftTeamStats`, `fromPrismaFuturePickMode`,
  `DEFAULT_STARTING_LINEUP`, and `StartingSlot`.
- Load teams, watchlist entries, and nominated entries together.
- Flatten teams into bid inputs with team handles.
- Call `getActiveDraftPlayers` with draft ID, normalized mode, lineup, and bids.
- Replace the inline `teams.map` statistics block with:

```ts
const teamStats = computeDraftTeamStats({
  teams,
  players,
  rosterSize: draft.rosterSize,
});
```

- Preserve the exact `auctionResults`, `watchlist`, `nominated`, `ownerHandle`, and `targetRoster`
  response shapes.

- [ ] **Step 5: Run API, scoring, and consumer tests**

Run:

```bash
pnpm test --runInBand src/__tests__/api/nomination-data.test.ts \
  src/__tests__/activeDraftPlayerConsumers.test.ts src/__tests__/nominationScoring.test.ts \
  src/__tests__/NominationHelper.ui.test.tsx
```

Expected: PASS. The shared fixture returns the same canonical numbers in the pure calculator and API
suite.

- [ ] **Step 6: Commit Task 5**

```bash
git add src/app/api/draft/[draftId]/nomination-data/route.ts \
  src/__tests__/api/nomination-data.test.ts src/__tests__/activeDraftPlayerConsumers.test.ts
git commit -m "refactor: serve canonical nomination draft statistics"
```

---

### Task 6: Audit checkpoint and full verification

**Files:**

- Modify: `docs/draftops-audit-workstreams.md:239-269`

**Interfaces:**

- No new runtime interfaces.
- Records exact verification evidence for the completed HARD-004 branch.

- [ ] **Step 1: Run the repository-mandated pre-review checks**

Run:

```bash
pnpm tsc --noEmit
pnpm lint
```

Expected: both commands exit 0 with no errors or warnings introduced by HARD-004.

- [ ] **Step 2: Run formatting and the complete Jest suite**

Run:

```bash
pnpm format:check
pnpm test --runInBand
```

Expected: formatting passes and all test suites pass.

- [ ] **Step 3: Run the complete quality gate**

Run:

```bash
make check
```

Expected: typecheck, lint, format check, and the full Jest suite all pass in one command.

- [ ] **Step 4: Verify scope and duplicate removal**

Run:

```bash
rg -n "@/lib/(budget|computeTeamStats)|function computeTeamStats" src
git diff --check main...HEAD
git status --short
```

Expected: the first command returns no matches; `git diff --check` returns no output; status contains
only the intended audit-document edit before the final commit.

- [ ] **Step 5: Record the implementation checkpoint**

In `docs/draftops-audit-workstreams.md`, change HARD-004 status to
`READY FOR INTEGRATION - implemented and verified on hard-004-canonical-draft-stats`. Add a dated
checkpoint summarizing:

- canonical slot policy and budget-delta seam;
- canonical active-player query order;
- all five consumers migrated;
- duplicate calculators removed;
- exact final test-suite and test counts from Step 3.

Do not mark the item merged or complete before integration.

- [ ] **Step 6: Commit Task 6**

```bash
git add docs/draftops-audit-workstreams.md
git commit -m "docs: record HARD-004 verification"
```

- [ ] **Step 7: Review the final branch diff**

Run:

```bash
git status --short --branch
git log --oneline --decorate main..HEAD
git diff --stat main...HEAD
git diff --check main...HEAD
```

Expected: clean worktree, the design/plan and six implementation commits are visible, the diff is
limited to HARD-004, and `git diff --check` emits no output.
