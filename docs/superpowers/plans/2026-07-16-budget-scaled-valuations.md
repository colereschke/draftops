# Budget-Scaled Valuations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scale every draft's player, future-pick, and projection-shaped auction values from an explicit $1,000 ranking-source economy into the configured per-team budget, with a recoverable backfill for existing drafts.

**Architecture:** Introduce one budget-contract module shared by ranking import, draft adjustment, and backfill. Draft creation assembles every asset at source scale, then applies budget scaling before existing league multipliers; projections continue to anchor to the corrected fallback. A dry-run-first CLI recomputes from immutable `base*` fields, snapshots affected rows, and updates each draft plus its projection values in one PostgreSQL transaction.

**Tech Stack:** TypeScript 5, Next.js 16 server actions, Prisma 7/PostgreSQL, Jest, pnpm 11.

## Global Constraints

- Raw `2QBAuction` input remains a $200 economy; normalized DraftOps ranking sources remain $1,000.
- Existing $1,000 numerical outputs must remain unchanged.
- `Player.baseBudget`, `baseCeiling`, and `baseFloor` remain normalized source values.
- `Player.budget`, `ceiling`, and `floor` are draft-adjusted fallback values.
- Future picks/packages and skill players use the same source-budget contract.
- Projection formulas do not change; projection values are reapplied after fallback changes.
- Backfill defaults to dry-run, requires `--apply` to mutate, and snapshots before writes.
- Use single quotes, trailing commas, two-space indentation, and a 100-character line width.
- Add failing tests before behavior changes.
- Do not import `src/data/players.ts` into client components.

---

## File Structure

```text
prisma/
  backfill-budget-scaled-values.ts       # CLI parsing, filesystem snapshot writer, DB lifecycle
  migrations/20260716190000_budget_scaled_valuations/migration.sql
  schema.prisma                          # persisted source-budget metadata
src/lib/
  valuationBudget.ts                     # budget constants, validation, ratios, whole-dollar scale
  valueAdjustment.ts                     # source-to-draft scaling plus existing league adjustment
  actions.ts                             # source selection and source-scale asset assembly
  rankings-actions.ts                    # persist custom source-budget metadata
  scaleRankingValue.ts                   # raw-$200 to normalized-$1,000 import
  budgetValueBackfill.ts                 # pure planning plus injected orchestration
src/__tests__/
  valuationBudget.test.ts
  scaleRankingValue.test.ts
  valueAdjustment.test.ts
  rankings-actions.test.ts
  createDraft.test.ts
  projectionApplication.test.ts
  budgetValueBackfill.test.ts
  integration/budgetValueBackfill.postgres.test.ts
jest.integration.config.ts               # real-PostgreSQL test entry point
jest.integration.env.ts
jest.integration.global-setup.ts
scripts/testDatabase.ts                  # guarded local `_test` database reset
package.json                              # CLI and integration-test scripts
.gitignore                                # snapshot output exclusion
README.md                                 # value contract and operator command
AGENTS.md                                 # maintained valuation/backfill context
```

### Task 1: Establish the persisted source-budget contract

**Files:**

- Create: `src/lib/valuationBudget.ts`
- Create: `src/__tests__/valuationBudget.test.ts`
- Create: `prisma/migrations/20260716190000_budget_scaled_valuations/migration.sql`
- Modify: `prisma/schema.prisma`
- Modify: `src/lib/scaleRankingValue.ts`
- Modify: `src/__tests__/scaleRankingValue.test.ts`

**Interfaces:**

- Produces: `RAW_RANKING_BUDGET`, `DEFAULT_RANKING_SOURCE_BUDGET`,
  `getBudgetScale(sourceBudget, draftBudget)`, and
  `scaleWholeDollar(value, scale, minimum)`.
- Produces persisted `Draft.playerValueSourceBudget: Int` and
  `UserRankingSet.sourceBudget: Int`, both defaulting to `1000`.
- Consumed by Tasks 2 through 5.

- [ ] **Step 1: Write failing budget-contract tests**

Create `src/__tests__/valuationBudget.test.ts`:

```ts
import {
  DEFAULT_RANKING_SOURCE_BUDGET,
  RAW_RANKING_BUDGET,
  getBudgetScale,
  scaleWholeDollar,
} from '@/lib/valuationBudget';

describe('valuation budget contract', () => {
  it('defines the raw and normalized ranking economies explicitly', () => {
    expect(RAW_RANKING_BUDGET).toBe(200);
    expect(DEFAULT_RANKING_SOURCE_BUDGET).toBe(1000);
  });

  it.each([
    [1000, 200, 0.2],
    [1000, 1000, 1],
    [1000, 2000, 2],
  ])('scales a $%i source into a $%i draft', (sourceBudget, draftBudget, expected) => {
    expect(getBudgetScale(sourceBudget, draftBudget)).toBe(expected);
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid source budgets: %s',
    (sourceBudget) => {
      expect(() => getBudgetScale(sourceBudget, 1000)).toThrow('source budget');
    },
  );

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid draft budgets: %s',
    (draftBudget) => {
      expect(() => getBudgetScale(1000, draftBudget)).toThrow('draft budget');
    },
  );

  it('rounds scaled values once and applies the requested minimum', () => {
    expect(scaleWholeDollar(109, 0.2, 1)).toBe(22);
    expect(scaleWholeDollar(1, 0.2, 1)).toBe(1);
    expect(scaleWholeDollar(5, 2, 10)).toBe(10);
  });
});
```

Extend `src/__tests__/scaleRankingValue.test.ts` to assert that the import ratio is derived from
the named constants while retaining all existing exact outputs:

```ts
import { DEFAULT_RANKING_SOURCE_BUDGET, RAW_RANKING_BUDGET } from '@/lib/valuationBudget';

it('normalizes raw $200 values into the default $1,000 source economy', () => {
  expect(DEFAULT_RANKING_SOURCE_BUDGET / RAW_RANKING_BUDGET).toBe(5);
  expect(scaleRankingValue('QB', 52)).toEqual({ budget: 260, ceiling: 299, floor: 226 });
});
```

- [ ] **Step 2: Run the focused tests and verify missing-module failure**

Run:

```bash
pnpm test --runInBand src/__tests__/valuationBudget.test.ts src/__tests__/scaleRankingValue.test.ts
```

Expected: FAIL because `@/lib/valuationBudget` does not exist.

- [ ] **Step 3: Implement the shared budget primitives**

Create `src/lib/valuationBudget.ts`:

```ts
export const RAW_RANKING_BUDGET = 200;
export const DEFAULT_RANKING_SOURCE_BUDGET = 1000;

function assertPositiveSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive safe integer`);
  }
}

export function getBudgetScale(sourceBudget: number, draftBudget: number): number {
  assertPositiveSafeInteger(sourceBudget, 'source budget');
  assertPositiveSafeInteger(draftBudget, 'draft budget');
  return draftBudget / sourceBudget;
}

export function scaleWholeDollar(value: number, scale: number, minimum = 1): number {
  return Math.max(minimum, Math.round(value * scale));
}
```

Replace `const SCALE = 5` in `src/lib/scaleRankingValue.ts` with:

```ts
import { DEFAULT_RANKING_SOURCE_BUDGET, RAW_RANKING_BUDGET } from '@/lib/valuationBudget';

const SCALE = DEFAULT_RANKING_SOURCE_BUDGET / RAW_RANKING_BUDGET;
```

- [ ] **Step 4: Add schema fields and the forward migration**

Add to `Draft` after `budget`:

```prisma
playerValueSourceBudget Int @default(1000)
```

Add to `UserRankingSet` after `fileName`:

```prisma
sourceBudget Int @default(1000)
```

Create `prisma/migrations/20260716190000_budget_scaled_valuations/migration.sql`:

```sql
ALTER TABLE "Draft"
ADD COLUMN "playerValueSourceBudget" INTEGER NOT NULL DEFAULT 1000;

ALTER TABLE "UserRankingSet"
ADD COLUMN "sourceBudget" INTEGER NOT NULL DEFAULT 1000;

ALTER TABLE "Draft"
ADD CONSTRAINT "Draft_playerValueSourceBudget_positive"
CHECK ("playerValueSourceBudget" > 0);

ALTER TABLE "UserRankingSet"
ADD CONSTRAINT "UserRankingSet_sourceBudget_positive"
CHECK ("sourceBudget" > 0);
```

Run:

```bash
pnpm prisma generate
pnpm test --runInBand src/__tests__/valuationBudget.test.ts src/__tests__/scaleRankingValue.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the budget contract**

```bash
git add prisma/schema.prisma prisma/migrations/20260716190000_budget_scaled_valuations/migration.sql src/lib/valuationBudget.ts src/lib/scaleRankingValue.ts src/__tests__/valuationBudget.test.ts src/__tests__/scaleRankingValue.test.ts
git commit -m "feat: add explicit valuation source budgets"
```

### Task 2: Scale every asset before league adjustments

**Files:**

- Modify: `src/lib/valueAdjustment.ts`
- Modify: `src/lib/actions.ts`
- Modify: `src/__tests__/valueAdjustment.test.ts`

**Interfaces:**

- Consumes: `getBudgetScale` and `scaleWholeDollar` from Task 1.
- Changes: `DraftValueSettings` requires `sourceBudget: number` and `draftBudget: number`.
- Produces: `adjustPlayerValues(basePlayers, settings)` with immutable source `base*` values,
  direct PICK/PKG scaling, and budget-scaled skill values before league multipliers.

- [ ] **Step 1: Add exact $200/$1,000/$2,000 failing fixtures**

Extend `DEFAULT_SETTINGS` in `src/__tests__/valueAdjustment.test.ts`:

```ts
const DEFAULT_SETTINGS: DraftValueSettings = {
  startingLineup: [...DEFAULT_STARTING_LINEUP],
  scoringSettings: { ...DEFAULT_SCORING_SETTINGS },
  teamCount: 12,
  sourceBudget: 1000,
  draftBudget: 1000,
};
```

Add these tests:

```ts
it.each([
  [200, { budget: 20, ceiling: 23, floor: 17 }],
  [1000, { budget: 100, ceiling: 115, floor: 87 }],
  [2000, { budget: 200, ceiling: 230, floor: 174 }],
])('scales skill values into a $%i draft before league adjustment', (draftBudget, expected) => {
  const [player] = adjustPlayerValues([A('WR1', 'WR', 1, 100)], {
    ...DEFAULT_SETTINGS,
    draftBudget,
  });
  expect(player).toMatchObject({ ...expected, baseBudget: 100, baseCeiling: 115, baseFloor: 87 });
});

it.each([
  [200, { budget: 22, ceiling: 26, floor: 15 }],
  [1000, { budget: 109, ceiling: 131, floor: 75 }],
  [2000, { budget: 218, ceiling: 262, floor: 150 }],
])('scales packages directly into a $%i draft', (draftBudget, expected) => {
  const pkg = adjustPlayerValues(POOL, { ...DEFAULT_SETTINGS, draftBudget }).find(
    (player) => player.pos === 'PKG',
  );
  expect(pkg).toMatchObject({
    ...expected,
    baseBudget: 109,
    baseCeiling: 131,
    baseFloor: 75,
  });
});

it('scales the source floor minimum with the draft economy', () => {
  const sourceMinimum = A('Deep', 'WR', 300, 5);
  expect(
    adjustPlayerValues([sourceMinimum], { ...DEFAULT_SETTINGS, draftBudget: 200 })[0].floor,
  ).toBe(1);
  expect(
    adjustPlayerValues([sourceMinimum], { ...DEFAULT_SETTINGS, draftBudget: 2000 })[0].floor,
  ).toBe(10);
});

it('applies budget scaling before multiplying and rounds only the final budget', () => {
  const settings = {
    ...DEFAULT_SETTINGS,
    draftBudget: 200,
    scoringSettings: { ...DEFAULT_SCORING_SETTINGS, pprTE: 2 },
  };
  const scoringMultipliers = computeScoringMultipliers(settings.scoringSettings);
  const multiplier =
    scoringMultipliers.TE *
    computeScarcityMultipliers(settings.startingLineup, scoringMultipliers).TE;
  const [player] = adjustPlayerValues([A('TE1', 'TE', 1, 31)], settings);
  expect(player.budget).toBe(Math.round(31 * 0.2 * multiplier));
});

it('keeps aggregate fallback totals proportional within whole-dollar rounding tolerance', () => {
  const totalFor = (draftBudget: number): number =>
    adjustPlayerValues(POOL, { ...DEFAULT_SETTINGS, draftBudget }).reduce(
      (total, player) => total + player.budget,
      0,
    );
  const total1000 = totalFor(1000);
  expect(Math.abs(totalFor(200) - total1000 * 0.2)).toBeLessThanOrEqual(POOL.length);
  expect(Math.abs(totalFor(2000) - total1000 * 2)).toBeLessThanOrEqual(POOL.length);
});
```

- [ ] **Step 2: Run tests and verify the settings/type failures**

Run:

```bash
pnpm test --runInBand src/__tests__/valueAdjustment.test.ts
```

Expected: FAIL because budget fields are unused and PICK/PKG rows still pass through unscaled.

- [ ] **Step 3: Implement source-to-draft scaling in `adjustPlayerValues`**

Add imports:

```ts
import { getBudgetScale, scaleWholeDollar } from '@/lib/valuationBudget';
```

Extend the settings interface:

```ts
export interface DraftValueSettings {
  startingLineup: StartingSlot[];
  scoringSettings: ScoringSettings;
  teamCount: number;
  sourceBudget: number;
  draftBudget: number;
}
```

At the start of `adjustPlayerValues`, compute:

```ts
const budgetScale = getBudgetScale(settings.sourceBudget, settings.draftBudget);
const scaledFloorMinimum = scaleWholeDollar(5, budgetScale, 1);
```

Replace the non-adjustable branch with:

```ts
if (!isAdjustable(p.pos)) {
  return {
    ...p,
    budget: scaleWholeDollar(p.budget, budgetScale),
    ceiling: scaleWholeDollar(p.ceiling, budgetScale),
    floor: scaleWholeDollar(p.floor, budgetScale),
    baseBudget: p.budget,
    baseCeiling: p.ceiling,
    baseFloor: p.floor,
  };
}
```

Replace the skill-player value derivation with:

```ts
const budget = Math.max(1, Math.round(p.budget * budgetScale * mult));
const ceiling = Math.round(budget * 1.15);
const floor = Math.max(scaledFloorMinimum, Math.round(budget * 0.87));
```

Update existing tests that construct `DraftValueSettings`; keep the scale-one identity assertion
unchanged. To keep this task independently type-safe before Task 3 restructures source selection,
add the two explicit arguments to the existing `adjustPlayerValues` call in `src/lib/actions.ts`:

```ts
sourceBudget: DEFAULT_RANKING_SOURCE_BUDGET,
draftBudget: data.budgetPerTeam,
```

Import `DEFAULT_RANKING_SOURCE_BUDGET` from `@/lib/valuationBudget`. Task 3 replaces the default
with the selected custom source and moves generated future assets into this adjustment pass.

- [ ] **Step 4: Run focused tests and typecheck**

```bash
pnpm test --runInBand src/__tests__/valueAdjustment.test.ts
pnpm test --runInBand src/__tests__/createDraft.test.ts
pnpm typecheck
```

Expected: value-adjustment and existing draft-creation tests PASS; typecheck PASS.

- [ ] **Step 5: Commit the pure valuation change**

```bash
git add src/lib/valueAdjustment.ts src/lib/actions.ts src/__tests__/valueAdjustment.test.ts
git commit -m "feat: scale draft values to configured budgets"
```

### Task 3: Seed draft players and future picks from one source-scale pool

**Files:**

- Modify: `src/lib/actions.ts`
- Modify: `src/lib/rankings-actions.ts`
- Modify: `src/__tests__/rankings-actions.test.ts`
- Modify: `src/__tests__/createDraft.test.ts`
- Modify: `src/__tests__/projectionApplication.test.ts`

**Interfaces:**

- Consumes: `DEFAULT_RANKING_SOURCE_BUDGET` and Task 2's expanded `DraftValueSettings`.
- Produces: custom ranking sets with `sourceBudget: 1000` and drafts with
  `playerValueSourceBudget` equal to the selected source.
- Preserves: projection application receives already-scaled `Player.budget` values.

- [ ] **Step 1: Write failing persistence and draft-seeding tests**

In `src/__tests__/rankings-actions.test.ts`, require the upsert to persist the normalized source:

```ts
expect(mockTxUpsert).toHaveBeenCalledWith({
  where: { userId: '123456789' },
  create: expect.objectContaining({
    userId: '123456789',
    fileName: 'rankings.csv',
    sourceBudget: 1000,
  }),
  update: expect.objectContaining({ fileName: 'rankings.csv', sourceBudget: 1000 }),
});
```

In `src/__tests__/createDraft.test.ts`:

- Add `sourceBudget: 1000` to every custom ranking-set fixture.
- Extend the draft-create expectation with `playerValueSourceBudget: 1000`.
- Add this non-default budget assertion:

```ts
it('scales ETR players and generated picks into a $200 draft', async () => {
  await createDraft({ ...VALID_INPUT, budgetPerTeam: 200 });
  const created = mockTxPlayerCreateMany.mock.calls[0][0].data as Array<{
    name: string;
    pos: string;
    budget: number;
    baseBudget: number;
  }>;
  const firstSkillPlayer = created.find((player) => player.pos === 'QB')!;
  const packageAsset = created.find((player) => player.futurePickAssetKind === 'package')!;

  expect(firstSkillPlayer.baseBudget).toBe(BASE_PLAYERS[0].budget);
  expect(firstSkillPlayer.budget).toBeLessThan(firstSkillPlayer.baseBudget);
  expect(packageAsset).toMatchObject({ budget: 22, baseBudget: 109 });
});
```

Add a custom-source test proving `sourceBudget` is used rather than assumed:

```ts
it('uses the persisted custom ranking source budget', async () => {
  mockTxUserRankingSetFindUnique.mockResolvedValue({
    id: 7,
    sourceBudget: 500,
    players: [
      {
        name: 'Custom Guy',
        team: 'BUF',
        pos: 'QB',
        age: 25,
        sfRank: 1,
        budget: 100,
        ceiling: 115,
        floor: 87,
        notes: '',
        sleeperId: 's1',
      },
    ],
  });

  await createDraft({ ...VALID_INPUT, playerSource: 'custom', budgetPerTeam: 1000 });
  expect(mockTxDraftCreate).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({ playerValueSourceBudget: 500 }),
    }),
  );
  expect(mockTxPlayerCreateMany.mock.calls[0][0].data[0]).toMatchObject({
    budget: 200,
    baseBudget: 100,
  });
});
```

In `src/__tests__/projectionApplication.test.ts`, add a second application using a player fallback
of `51` and assert the upsert contains both `fallbackAuctionValue: 51` and an active value anchored
to that fallback rather than the old $1,000-scale fixture.

- [ ] **Step 2: Run focused tests and verify failures**

```bash
pnpm test --runInBand src/__tests__/rankings-actions.test.ts src/__tests__/createDraft.test.ts src/__tests__/projectionApplication.test.ts
```

Expected: FAIL because source budgets are not persisted or supplied and future picks are generated
after adjustment.

- [ ] **Step 3: Persist the custom source budget**

In `src/lib/rankings-actions.ts`, import `DEFAULT_RANKING_SOURCE_BUDGET` and add
`sourceBudget: DEFAULT_RANKING_SOURCE_BUDGET` to both the create and update arms of the ranking-set
upsert.

- [ ] **Step 4: Resolve the source before creating the draft**

Inside the existing draft transaction, load the optional custom ranking set before
`tx.draft.create`:

```ts
const rankingSet =
  data.playerSource === 'custom'
    ? await tx.userRankingSet.findUnique({
        where: { userId: session.user.id },
        include: { players: true },
      })
    : null;
if (data.playerSource === 'custom' && !rankingSet) {
  throw new Error('No custom ranking set found');
}

const sourceBudget = rankingSet?.sourceBudget ?? DEFAULT_RANKING_SOURCE_BUDGET;
const basePlayers = rankingSet
  ? rankingSet.players.map((player) => ({
      player: player.name,
      team: player.team,
      pos: player.pos as Position,
      age: player.age,
      sfRank: player.sfRank,
      budget: player.budget,
      ceiling: player.ceiling,
      floor: player.floor,
      notes: player.notes,
      sleeperId: player.sleeperId,
    }))
  : BASE_PLAYERS;
```

Add `playerValueSourceBudget: sourceBudget` to `tx.draft.create`.

- [ ] **Step 5: Generate future assets before the single adjustment pass**

Replace the current adjust-then-generate sequence with:

```ts
const nextPickYear = getNextFuturePickYear(draft.createdAt);
const futurePickAssets = generateFuturePickAssets({
  teams: coerced,
  year: nextPickYear,
  startingRank: 900,
  sourceBudget,
  baselines: inferFuturePickBaselines(basePlayers),
});
const sourcePlayers = [...excludeStaticFuturePickRows(basePlayers), ...futurePickAssets];
const seededPlayers = adjustPlayerValues(sourcePlayers, {
  startingLineup: data.startingLineup,
  scoringSettings: data.scoringSettings,
  teamCount: data.teams.length,
  sourceBudget,
  draftBudget: data.budgetPerTeam,
});
```

Keep player persistence and `applyProjectionValuesToDraft` after this block. Do not add scaling to
`projectionMarketValue.ts`; its existing fallback anchor is the required behavior.
Canonical future-pick defaults are $1,000 values, so generation must denominate only those defaults
in `sourceBudget`; inferred custom baselines already use the selected source economy and must not be
scaled again.

- [ ] **Step 6: Run the integrated valuation tests**

```bash
pnpm test --runInBand src/__tests__/rankings-actions.test.ts src/__tests__/createDraft.test.ts src/__tests__/futurePickAssets.test.ts src/__tests__/projectionApplication.test.ts src/__tests__/projectionMarketValue.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit source-scale draft seeding**

```bash
git add src/lib/actions.ts src/lib/rankings-actions.ts src/__tests__/rankings-actions.test.ts src/__tests__/createDraft.test.ts src/__tests__/projectionApplication.test.ts
git commit -m "feat: seed all draft assets from one value source"
```

### Task 4: Build the pure backfill planner and dry-run orchestration

**Files:**

- Create: `src/lib/budgetValueBackfill.ts`
- Create: `src/__tests__/budgetValueBackfill.test.ts`

**Interfaces:**

- Produces: `planBudgetValueBackfill(drafts): BudgetValueBackfillPlan`.
- Produces: `runBudgetValueBackfill(prisma, options, dependencies)` with injected snapshot and
  projection functions.
- Consumes: `adjustPlayerValues` and `applyProjectionValuesToDraft`-compatible transaction clients.
- Produces summaries containing draft IDs, changed rows, and before/after fallback and active totals.

- [ ] **Step 1: Write failing pure-planner tests**

Create typed fixtures in `src/__tests__/budgetValueBackfill.test.ts` for:

```ts
const draft200: BudgetValueBackfillDraft = {
  id: 5,
  name: '$200 Draft',
  createdAt: new Date('2026-07-01T12:00:00.000Z'),
  budget: 200,
  playerValueSourceBudget: 1000,
  teamCount: 12,
  rosterSize: 30,
  futurePickAuctionMode: 'PACKAGES',
  startingLineup: [...DEFAULT_STARTING_LINEUP],
  scoringSettings: { ...DEFAULT_SCORING_SETTINGS },
  targetRoster: { QB: 4, RB: 9, WR: 11, TE: 3 },
  players: [
    {
      id: 10,
      name: 'Player One',
      nflTeam: 'BUF',
      pos: 'QB',
      age: 25,
      sfRank: 1,
      notes: '',
      budget: 100,
      ceiling: 115,
      floor: 87,
      baseBudget: 100,
      baseCeiling: 115,
      baseFloor: 87,
      sleeperId: 's1',
      customKey: null,
      futurePickYear: null,
      futurePickRound: null,
      futurePickOriginHandle: null,
      futurePickAssetKind: null,
    },
    {
      id: 11,
      name: 'Team Package',
      nflTeam: 'team-one',
      pos: 'PKG',
      age: null,
      sfRank: 900,
      notes: '',
      budget: 109,
      ceiling: 131,
      floor: 75,
      baseBudget: 109,
      baseCeiling: 131,
      baseFloor: 75,
      sleeperId: null,
      customKey: 'pkg:team-one',
      futurePickYear: 2027,
      futurePickRound: null,
      futurePickOriginHandle: 'team-one',
      futurePickAssetKind: 'package',
    },
  ],
  playerValues: [
    {
      id: 20,
      draftId: 5,
      playerId: 10,
      projectionSourceId: 7,
      projectedPoints: 300,
      replacementPoints: 200,
      vor: 100,
      projectionAuctionValue: 105,
      fallbackAuctionValue: 100,
      activeAuctionValue: 110,
      valueSource: 'projection_adjusted_market',
      createdAt: new Date('2026-07-15T12:00:00.000Z'),
      updatedAt: new Date('2026-07-15T12:00:00.000Z'),
    },
  ],
};
```

Assert:

```ts
it('plans from immutable base values and reports aggregate changes', () => {
  const plan = planBudgetValueBackfill([draft200]);
  expect(plan.drafts[0]).toMatchObject({
    draftId: 5,
    changedPlayerCount: 2,
    beforeFallbackTotal: 209,
    afterFallbackTotal: 42,
    beforeActiveTotal: 110,
    afterActiveTotal: 22,
  });
  expect(plan.drafts[0].playerUpdates).toEqual([
    { id: 10, budget: 20, ceiling: 23, floor: 17 },
    { id: 11, budget: 22, ceiling: 26, floor: 15 },
  ]);
});

it('skips scale-one drafts', () => {
  expect(planBudgetValueBackfill([{ ...draft200, budget: 1000 }]).drafts).toHaveLength(0);
});

it('reports no changes and preserves the active estimate after values are corrected', () => {
  const first = planBudgetValueBackfill([draft200]);
  const alreadyScaled = {
    ...draft200,
    players: draft200.players.map((player) => {
      const update = first.drafts[0].playerUpdates.find((item) => item.id === player.id)!;
      return { ...player, ...update };
    }),
    playerValues: draft200.playerValues.map((value) => ({
      ...value,
      fallbackAuctionValue: 20,
      activeAuctionValue: 20,
    })),
  };
  const repeated = planBudgetValueBackfill([alreadyScaled]).drafts[0];
  expect(repeated.changedPlayerCount).toBe(0);
  expect(repeated.playerUpdates).toEqual([]);
  expect(repeated.afterActiveTotal).toBe(20);
});
```

- [ ] **Step 2: Write failing orchestration tests**

Using typed Jest mocks, cover these exact outcomes:

```ts
it('dry run neither snapshots nor opens a transaction', async () => {
  const result = await runBudgetValueBackfill(prisma, { apply: false }, dependencies);
  expect(result.mode).toBe('dry-run');
  expect(dependencies.writeSnapshot).not.toHaveBeenCalled();
  expect(mockTransaction).not.toHaveBeenCalled();
});

it('writes one complete snapshot before the first transaction', async () => {
  await runBudgetValueBackfill(prisma, { apply: true }, dependencies);
  expect(dependencies.writeSnapshot).toHaveBeenCalledWith(
    expect.objectContaining({ drafts: [expect.objectContaining({ id: 5 })] }),
    expect.any(String),
  );
  expect(dependencies.writeSnapshot.mock.invocationCallOrder[0]).toBeLessThan(
    mockTransaction.mock.invocationCallOrder[0],
  );
});

it('performs no database mutation when snapshot writing fails', async () => {
  dependencies.writeSnapshot.mockRejectedValue(new Error('snapshot denied'));
  await expect(runBudgetValueBackfill(prisma, { apply: true }, dependencies)).rejects.toThrow(
    'snapshot denied',
  );
  expect(mockTransaction).not.toHaveBeenCalled();
  expect(mockPlayerUpdate).not.toHaveBeenCalled();
});

it('updates players and reapplies projections inside the same draft transaction', async () => {
  await runBudgetValueBackfill(prisma, { apply: true }, dependencies);
  expect(mockPlayerUpdate).toHaveBeenCalledWith({
    where: { id: 10 },
    data: { budget: 20, ceiling: 23, floor: 17 },
  });
  expect(dependencies.applyProjections).toHaveBeenCalledWith(mockTx, {
    draftId: 5,
    useBatchTransaction: false,
  });
});
```

- [ ] **Step 3: Run tests and verify missing-module failure**

```bash
pnpm test --runInBand src/__tests__/budgetValueBackfill.test.ts
```

Expected: FAIL because `@/lib/budgetValueBackfill` does not exist.

- [ ] **Step 4: Implement the planner types and source-row conversion**

In `src/lib/budgetValueBackfill.ts`, define the domain shapes explicitly:

```ts
export interface BudgetValueBackfillPlayer {
  id: number;
  name: string;
  nflTeam: string;
  pos: string;
  age: number | null;
  sfRank: number;
  notes: string;
  budget: number;
  ceiling: number;
  floor: number;
  baseBudget: number;
  baseCeiling: number;
  baseFloor: number;
  sleeperId: string | null;
  customKey: string | null;
  futurePickYear: number | null;
  futurePickRound: number | null;
  futurePickOriginHandle: string | null;
  futurePickAssetKind: string | null;
}

export interface BudgetValueBackfillPlayerValue {
  id: number;
  draftId: number;
  playerId: number;
  projectionSourceId: number | null;
  projectedPoints: number | null;
  replacementPoints: number | null;
  vor: number | null;
  projectionAuctionValue: number | null;
  fallbackAuctionValue: number;
  activeAuctionValue: number;
  valueSource: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface BudgetValueBackfillDraft {
  id: number;
  name: string;
  createdAt: Date;
  budget: number;
  playerValueSourceBudget: number;
  teamCount: number;
  rosterSize: number;
  futurePickAuctionMode: string;
  startingLineup: unknown;
  scoringSettings: unknown;
  targetRoster: unknown;
  players: BudgetValueBackfillPlayer[];
  playerValues: BudgetValueBackfillPlayerValue[];
}

export interface BudgetValuePlayerUpdate {
  id: number;
  budget: number;
  ceiling: number;
  floor: number;
}

export interface BudgetValueDraftPlan {
  draftId: number;
  draftName: string;
  changedPlayerCount: number;
  beforeFallbackTotal: number;
  afterFallbackTotal: number;
  beforeActiveTotal: number;
  afterActiveTotal: number;
  playerUpdates: BudgetValuePlayerUpdate[];
}

export interface BudgetValueBackfillPlan {
  drafts: BudgetValueDraftPlan[];
}

export interface BudgetValueSnapshot {
  createdAt: string;
  drafts: BudgetValueBackfillDraft[];
}

export interface BudgetValueBackfillOptions {
  apply: boolean;
  draftId?: number;
  snapshotDir?: string;
}

export interface BudgetValueBackfillResult extends BudgetValueBackfillPlan {
  mode: 'dry-run' | 'applied';
  snapshotPath: string | null;
}
```

Define narrow Prisma/dependency interfaces from the exact calls in Step 5. Use
`ProjectionApplyPrisma` for the transaction client accepted by `applyProjections`; type player
updates as `{ where: { id: number }; data: { budget: number; ceiling: number; floor: number } }`.

Implement source conversion with no current-value input:

```ts
function toSourcePlayer(player: BudgetValueBackfillPlayer): Player {
  return {
    id: player.id,
    player: player.name,
    team: player.nflTeam,
    pos: player.pos as Position,
    age: player.age,
    sfRank: player.sfRank,
    budget: player.baseBudget,
    ceiling: player.baseCeiling,
    floor: player.baseFloor,
    notes: player.notes,
    sleeperId: player.sleeperId,
    customKey: player.customKey,
    futurePickYear: player.futurePickYear,
    futurePickRound: player.futurePickRound,
    futurePickOriginHandle: player.futurePickOriginHandle,
    futurePickAssetKind: toFuturePickAssetKind(player.futurePickAssetKind),
  };
}
```

`toFuturePickAssetKind` accepts only `'pick'`, `'package'`, or `null`; an invalid persisted kind
throws with the player ID.

Implement each plan with:

```ts
const adjusted = adjustPlayerValues(draft.players.map(toSourcePlayer), {
  startingLineup: toStartingLineup(draft.startingLineup),
  scoringSettings: toScoringSettings(draft.scoringSettings),
  teamCount: draft.teamCount,
  sourceBudget: draft.playerValueSourceBudget,
  draftBudget: draft.budget,
});
```

Use the same JSON guards/defaults as `projectionApplication.ts` for lineup and scoring. Compute
fallback totals from `Player.budget` before and after, and count/update only rows whose current
fallback fields differ from their proposed fields. Select the same current projection-source rows
as `playerValueMapping.ts`, including its per-player null fallback behavior, so historical sources
are not double-counted. Estimate each selected active value with its current
`fallbackAuctionValue`-to-proposed-fallback ratio and whole-dollar rounding; this makes a corrected
draft estimate stable on repeat runs. Label the result as an estimate in CLI output. After apply,
replace that estimate with the committed active total for the `projectionSourceId` returned by
projection reapplication.

- [ ] **Step 5: Implement injected dry-run/apply orchestration**

`runBudgetValueBackfill` must:

1. `findMany` drafts with the explicit settings, players, and player-value select.
2. Filter and plan in memory because Prisma cannot compare two columns in a normal `where` object.
3. Return the plan directly in dry-run mode.
4. Call `writeSnapshot({ createdAt, drafts: affectedDrafts }, snapshotDir)` once before mutations.
5. For each draft plan, call one interactive `$transaction` that updates every player and then
   invokes `applyProjections(tx, { draftId, useBatchTransaction: false })`.
6. Capture the projection reapplication result and query the committed draft's active total for
   only its returned `projectionSourceId`.

Use `snapshotDir: 'valuation-backfill-snapshots'` as the option default. Do not catch database or
filesystem errors; allow the CLI to set a non-zero exit code.

- [ ] **Step 6: Run backfill unit tests**

```bash
pnpm test --runInBand src/__tests__/budgetValueBackfill.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit the backfill domain service**

```bash
git add src/lib/budgetValueBackfill.ts src/__tests__/budgetValueBackfill.test.ts
git commit -m "feat: plan idempotent valuation backfills"
```

### Task 5: Add the snapshotting CLI and operator surface

**Files:**

- Create: `prisma/backfill-budget-scaled-values.ts`
- Modify: `.gitignore`
- Modify: `package.json`
- Modify: `src/__tests__/budgetValueBackfill.test.ts`

**Interfaces:**

- Consumes: `runBudgetValueBackfill` from Task 4.
- Produces CLI flags `--apply`, `--draft-id <positive integer>`, and
  `--snapshot-dir <directory>`.
- Produces script `pnpm db:backfill-budget-values`.

- [ ] **Step 1: Add failing CLI parsing and JSON-writer tests**

Extend `src/__tests__/budgetValueBackfill.test.ts`:

```ts
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  parseBudgetValueBackfillArgs,
  writeBudgetValueSnapshot,
} from '../../prisma/backfill-budget-scaled-values';

it('parses dry-run, apply, draft, and snapshot-directory options', () => {
  expect(parseBudgetValueBackfillArgs([])).toEqual({
    apply: false,
    draftId: undefined,
    snapshotDir: 'valuation-backfill-snapshots',
  });
  expect(
    parseBudgetValueBackfillArgs(['--apply', '--draft-id', '5', '--snapshot-dir', '/tmp/values']),
  ).toEqual({ apply: true, draftId: 5, snapshotDir: '/tmp/values' });
});

it.each([['--draft-id'], ['--draft-id', '0'], ['--draft-id', '1.5'], ['--unknown']])(
  'rejects malformed arguments: %s',
  (...args) => {
    expect(() => parseBudgetValueBackfillArgs(args)).toThrow('Usage:');
  },
);

it('writes a parseable timestamped JSON snapshot', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'draftops-values-'));
  try {
    const path = await writeBudgetValueSnapshot(
      { createdAt: '2026-07-16T12:00:00.000Z', drafts: [draft200] },
      directory,
    );
    expect(path).toContain('budget-values-2026-07-16T12-00-00-000Z.json');
    await expect(readFile(path, 'utf8').then(JSON.parse)).resolves.toMatchObject({
      drafts: [{ id: 5 }],
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run tests and verify missing exports**

```bash
pnpm test --runInBand src/__tests__/budgetValueBackfill.test.ts
```

Expected: FAIL because the CLI module does not exist.

- [ ] **Step 3: Implement CLI parsing and snapshot writing**

Create `prisma/backfill-budget-scaled-values.ts` with:

```ts
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.local' });

import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import {
  runBudgetValueBackfill,
  type BudgetValueBackfillOptions,
  type BudgetValueSnapshot,
} from '@/lib/budgetValueBackfill';
import { applyProjectionValuesToDraft } from '@/lib/projectionApplication';
```

`parseBudgetValueBackfillArgs` must consume each token exactly once, reject unknown/missing values,
and validate `--draft-id` with `Number.isSafeInteger(value) && value > 0`. On failure throw an error
containing:

```text
Usage: pnpm db:backfill-budget-values -- [--apply] [--draft-id <id>] [--snapshot-dir <dir>]
```

`writeBudgetValueSnapshot` must `mkdir(directory, { recursive: true })`, replace `:` and `.` in the
ISO timestamp with `-`, and call `writeFile(path, JSON.stringify(snapshot, null, 2) + '\n', {
encoding: 'utf8', flag: 'wx' })` so an existing file is never overwritten.

The entrypoint must require `DATABASE_URL`, create Prisma through `PrismaPg`, run the service with
the real snapshot/projection dependencies, print JSON summaries, disconnect in `finally`, and set
`process.exitCode = 1` on failure. Guard entrypoint execution so Jest imports do not run it.

- [ ] **Step 4: Add scripts and ignore only generated snapshots**

Add to `.gitignore`:

```gitignore
# Valuation backfill safety snapshots
/valuation-backfill-snapshots/
```

Add to `package.json` scripts:

```json
"db:backfill-budget-values": "tsx prisma/backfill-budget-scaled-values.ts"
```

- [ ] **Step 5: Run CLI unit tests and a read-only smoke command**

```bash
pnpm test --runInBand src/__tests__/budgetValueBackfill.test.ts
pnpm db:backfill-budget-values -- --draft-id 999999
```

Expected: tests PASS; with a configured local database, the CLI reports a dry run with zero
affected drafts and creates no snapshot directory.

- [ ] **Step 6: Commit the operational CLI**

```bash
git add .gitignore package.json prisma/backfill-budget-scaled-values.ts src/__tests__/budgetValueBackfill.test.ts
git commit -m "feat: add recoverable valuation backfill CLI"
```

### Task 6: Verify migration, idempotency, and rollback against PostgreSQL

**Files:**

- Create: `jest.integration.config.ts`
- Create: `jest.integration.env.ts`
- Create: `jest.integration.global-setup.ts`
- Create: `scripts/testDatabase.ts`
- Create: `src/__tests__/integration/budgetValueBackfill.postgres.test.ts`
- Modify: `jest.config.ts`
- Modify: `package.json`

**Interfaces:**

- Produces: `pnpm test:integration` using only a local database whose name ends in `_test`.
- Consumes: the migration, real Prisma client, `runBudgetValueBackfill`, and real projection
  application.
- Compatibility: use the same filenames and guards already present on the pending HARD-001/002
  branch so later branch integration can deduplicate identical harness files cleanly.

- [ ] **Step 1: Add the guarded PostgreSQL harness**

Create `scripts/testDatabase.ts`:

```ts
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import { Client } from 'pg';

const LOCAL_DATABASE_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

function loadLocalEnvironment(): void {
  const candidates = [resolve('.env.local'), resolve('../..', '.env.local')];
  const envPath = candidates.find((candidate) => existsSync(candidate));
  if (envPath) config({ path: envPath, override: false });
}

export function configureTestDatabaseUrl(): string {
  loadLocalEnvironment();
  const explicitTestUrl = process.env.TEST_DATABASE_URL?.trim() || undefined;
  const sourceUrl = explicitTestUrl ?? process.env.DATABASE_URL?.trim();
  if (!sourceUrl) {
    throw new Error(
      'TEST_DATABASE_URL or DATABASE_URL is required for PostgreSQL integration tests',
    );
  }

  const testUrl = new URL(sourceUrl);
  if (!explicitTestUrl) testUrl.pathname = '/draftops_test';
  const databaseName = testUrl.pathname.slice(1);
  if (!LOCAL_DATABASE_HOSTS.has(testUrl.hostname) || !databaseName.endsWith('_test')) {
    throw new Error('Integration tests require a local PostgreSQL database ending in _test');
  }

  process.env.TEST_DATABASE_URL = testUrl.toString();
  process.env.DATABASE_URL = testUrl.toString();
  return testUrl.toString();
}

export async function resetTestDatabase(): Promise<void> {
  const databaseUrl = configureTestDatabaseUrl();
  const parsedUrl = new URL(databaseUrl);
  const databaseName = parsedUrl.pathname.slice(1);
  if (!/^[a-zA-Z0-9_]+$/.test(databaseName)) {
    throw new Error('Test database name may contain only letters, numbers, and underscores');
  }

  let client = new Client({ connectionString: databaseUrl });
  try {
    await client.connect();
  } catch (error) {
    if ((error as { code?: string }).code !== '3D000') throw error;
    const adminUrl = new URL(databaseUrl);
    adminUrl.pathname = '/postgres';
    const adminClient = new Client({ connectionString: adminUrl.toString() });
    await adminClient.connect();
    try {
      await adminClient.query(`CREATE DATABASE "${databaseName}"`);
    } finally {
      await adminClient.end();
    }
    client = new Client({ connectionString: databaseUrl });
    await client.connect();
  }

  try {
    await client.query('DROP SCHEMA public CASCADE');
    await client.query('CREATE SCHEMA public');
    const migrationsRoot = resolve('prisma/migrations');
    const migrationDirectories = readdirSync(migrationsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    for (const directory of migrationDirectories) {
      const migrationPath = resolve(migrationsRoot, directory, 'migration.sql');
      if (existsSync(migrationPath)) await client.query(readFileSync(migrationPath, 'utf8'));
    }
  } finally {
    await client.end();
  }
}
```

Create `jest.integration.config.ts`:

```ts
import type { Config } from 'jest';
import nextJest from 'next/jest.js';

const createJestConfig = nextJest({ dir: './' });
const config: Config = {
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/jest.integration.env.ts'],
  globalSetup: '<rootDir>/jest.integration.global-setup.ts',
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  testMatch: ['<rootDir>/src/__tests__/integration/**/*.postgres.test.ts'],
  maxWorkers: 1,
};

export default createJestConfig(config);
```

Create `jest.integration.env.ts`:

```ts
import { configureTestDatabaseUrl } from './scripts/testDatabase';

configureTestDatabaseUrl();
```

Create `jest.integration.global-setup.ts`:

```ts
import { resetTestDatabase } from './scripts/testDatabase';

export default async function globalSetup(): Promise<void> {
  await resetTestDatabase();
}
```

Add `<rootDir>/src/__tests__/integration/` to `jest.config.ts`'s
`testPathIgnorePatterns`. Add to `package.json`:

```json
"test:integration": "jest --config jest.integration.config.ts --runInBand"
```

- [ ] **Step 2: Write the real-database fixture and idempotency test**

Create `src/__tests__/integration/budgetValueBackfill.postgres.test.ts`. The fixture must create:

- one $200 draft with `playerValueSourceBudget: 1000` and default JSON settings;
- one player with source values `100/115/87`, incorrect fallback `100/115/87`, and a Sleeper ID;
- one current `ProjectionSource` and matching `PlayerProjection` row;
- one historical projection source with an older `DraftPlayerValue` row;
- one current `DraftPlayerValue` row anchored to `100`.

Run apply with a temporary snapshot directory and the real projection dependency, then assert:

```ts
await expect(
  prisma.player.findUnique({
    where: { id: fixture.playerId },
    select: { budget: true, ceiling: true, floor: true, baseBudget: true },
  }),
).resolves.toEqual({ budget: 20, ceiling: 23, floor: 17, baseBudget: 100 });

await expect(
  prisma.draftPlayerValue.findFirst({
    where: { draftId: fixture.draftId, playerId: fixture.playerId },
    select: { fallbackAuctionValue: true, activeAuctionValue: true },
  }),
).resolves.toEqual({ fallbackAuctionValue: 20, activeAuctionValue: 20 });
```

Run apply a second time and assert the same stored values and only one projection-value row for the
draft/player/source key. Assert the backfill report totals only the current source and leaves the
historical row stored without double-counting it.

- [ ] **Step 3: Add a real rollback test**

Create a PostgreSQL trigger that raises before `DraftPlayerValue` insert/update for the fixture
draft. Reset the player's incorrect fallback to `100/115/87`, run apply, expect rejection, and
assert the player still has `100/115/87`. Drop the trigger/function in `finally` and delete all
fixture rows after each test.

- [ ] **Step 4: Run PostgreSQL integration tests**

```bash
pnpm test:integration
```

Expected: PASS for migration application, scaling, projection reapplication, idempotency, and
transaction rollback. The harness must refuse any non-local or non-`_test` database URL.

- [ ] **Step 5: Commit PostgreSQL verification**

```bash
git add jest.config.ts jest.integration.config.ts jest.integration.env.ts jest.integration.global-setup.ts scripts/testDatabase.ts package.json src/__tests__/integration/budgetValueBackfill.postgres.test.ts
git commit -m "test: verify valuation backfill on postgres"
```

### Task 7: Document the value contract and run final verification

**Files:**

- Modify: `README.md`
- Modify: `AGENTS.md`
- Test: all affected unit and integration suites

**Interfaces:**

- Documents: raw $200 input, normalized $1,000 source, draft scaling order, persisted field
  semantics, dry-run/apply commands, snapshot behavior, and projection reapplication.
- Produces: final verified branch ready for strongest-model review.

- [ ] **Step 1: Update operator and contributor documentation**

In `README.md`'s Dynasty Value Pipeline, explicitly describe:

```text
Raw 2QBAuction values use a $200 economy. DraftOps normalizes imported values to its explicit
$1,000 ranking-source economy, then scales them by draft budget / source budget before applying
league settings. The default $1,000 path is unchanged.
```

Add commands:

```bash
# Inspect affected drafts without writing
pnpm db:backfill-budget-values

# Snapshot, update fallback values, and reapply projections
pnpm db:backfill-budget-values -- --apply
```

Document `--draft-id`, `--snapshot-dir`, the default ignored snapshot directory, and the rule that
operators retain snapshots until verification.

Update `AGENTS.md`'s valuation section with `UserRankingSet.sourceBudget`,
`Draft.playerValueSourceBudget`, the source/draft field semantics, and the backfill command. Do not
rewrite unrelated stale documentation; HARD-021 owns general documentation repair.

- [ ] **Step 2: Run focused valuation tests**

```bash
pnpm test --runInBand src/__tests__/valuationBudget.test.ts src/__tests__/scaleRankingValue.test.ts src/__tests__/valueAdjustment.test.ts src/__tests__/rankings-actions.test.ts src/__tests__/createDraft.test.ts src/__tests__/futurePickAssets.test.ts src/__tests__/projectionApplication.test.ts src/__tests__/projectionMarketValue.test.ts src/__tests__/budgetValueBackfill.test.ts
```

Expected: PASS.

- [ ] **Step 3: Commit documentation**

```bash
git add README.md AGENTS.md
git commit -m "docs: explain budget-scaled valuation workflow"
```

- [ ] **Step 4: Run the full repository quality gate**

```bash
make check
```

Expected: typecheck, ESLint, Prettier, 81+ Jest suites, and all tests PASS.

- [ ] **Step 5: Run real-PostgreSQL verification again**

```bash
pnpm test:integration
```

Expected: all PostgreSQL integration tests PASS.

- [ ] **Step 6: Inspect the final diff and generated artifacts**

```bash
git status --short
git diff --check main...HEAD
git diff --stat main...HEAD
git ls-files valuation-backfill-snapshots
```

Expected: no uncommitted changes, no whitespace errors, only HARD-003 files in the diff, and no
tracked snapshot files.

- [ ] **Step 7: Request strongest-model code review**

Before review, rerun the repository-mandated checks:

```bash
pnpm tsc --noEmit
pnpm lint
```

Then request review specifically for source/base/draft field semantics, rounding at $200 and
$2,000, future-pick parity, projection reapplication, snapshot-before-write ordering, per-draft
transaction rollback, migration safety, and compatibility with the pending HARD-001/002 integration
harness.
