# Dynamic Pick Valuation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add draft-mode-aware, origin-team-specific future pick assets and dynamically adjust their
auction values from the origin team's current roster signals.

**Architecture:** Keep future picks inside the existing `Player` auction-row pipeline for this
iteration. Add draft-level auction mode plus nullable `Player` metadata for future-pick origin,
round, year, and asset kind; then layer server-side filtering and dynamic valuation over mapped
players without persisting volatile adjusted values back to `Player.budget`.

**Tech Stack:** Next.js 16 App Router, TypeScript, Prisma 7/Postgres, Jest, React Testing Library,
pnpm.

---

## File Structure

- Modify `prisma/schema.prisma`
  - Add `FuturePickAuctionMode` enum.
  - Add `Draft.futurePickAuctionMode`.
  - Add nullable future-pick metadata columns to `Player`.
- Create `prisma/migrations/<timestamp>_future_pick_assets/migration.sql`
  - Generated with `pnpm prisma migrate dev --name future_pick_assets`.
- Modify `src/types/index.ts`
  - Add `FuturePickAuctionMode`, future-pick metadata interfaces, and optional `Player` fields.
- Create `src/lib/futurePickAssets.ts`
  - Generate origin-team-specific `PKG` and `PICK` rows from teams.
  - Filter visible future-pick assets by draft mode.
  - Export mode constants and helper predicates.
- Create `src/lib/lineupOptimizer.ts`
  - Optimize projected starting lineup points from exact `StartingSlot[]`.
- Create `src/lib/dynamicPickValues.ts`
  - Compute origin-team signals.
  - Apply conservative dynamic adjustments to visible future-pick assets.
- Modify `src/lib/actions.ts`
  - Accept and store `futurePickAuctionMode`.
  - Seed adjusted base players plus generated future pick assets.
- Modify `src/data/players.ts`
  - Remove hardcoded `PKG` and `PICK` rows from the static base list once generated next-year
    origin-team assets replace them.
- Modify `prisma/seed-players.ts` and `prisma/sync-players.ts`
  - Use generated future assets per draft/team instead of only static base players.
- Modify `src/lib/playerValueMapping.ts`
  - Preserve metadata through DB-to-UI mapping.
- Modify `src/app/draft/[draftId]/page.tsx`
  - Fetch teams/results and pass mapped players through dynamic pick valuation/filtering.
- Modify `src/app/draft/[draftId]/nominate/page.tsx` and nomination-data API
  - Apply the same auction-mode filtering to nomination player lists.
- Modify `src/app/drafts/new/page.tsx`
  - Add immutable future pick auction mode selector.
- Modify `src/components/AuctionSheet/PlayerTable.tsx`
  - Show dynamic baseline/adjustment indicator for future pick rows.
- Modify tests under `src/__tests__/`
  - Add focused unit tests for helpers and update existing draft/player tests.

---

### Task 1: Schema and Shared Types

**Files:**

- Modify: `prisma/schema.prisma`
- Modify: `src/types/index.ts`
- Test: `src/__tests__/futurePickAssets.test.ts`

- [ ] **Step 1: Write the failing type/helper smoke test**

Create `src/__tests__/futurePickAssets.test.ts`:

```ts
import { FUTURE_PICK_AUCTION_MODES, isFuturePickAuctionMode } from '@/lib/futurePickAssets';

describe('future pick auction mode helpers', () => {
  it('accepts only supported future pick auction modes', () => {
    expect(FUTURE_PICK_AUCTION_MODES).toEqual(['packages', 'individual', 'none']);
    expect(isFuturePickAuctionMode('packages')).toBe(true);
    expect(isFuturePickAuctionMode('individual')).toBe(true);
    expect(isFuturePickAuctionMode('none')).toBe(true);
    expect(isFuturePickAuctionMode('package')).toBe(false);
    expect(isFuturePickAuctionMode(null)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm exec jest src/__tests__/futurePickAssets.test.ts --runInBand
```

Expected: FAIL because `@/lib/futurePickAssets` does not exist.

- [ ] **Step 3: Add shared types**

In `src/types/index.ts`, add:

```ts
export type FuturePickAuctionMode = 'packages' | 'individual' | 'none';
export type FuturePickAssetKind = 'package' | 'pick';

export interface FuturePickMetadata {
  futurePickYear: number;
  futurePickRound: number | null;
  futurePickOriginHandle: string;
  futurePickAssetKind: FuturePickAssetKind;
}
```

Extend `Player` with:

```ts
  futurePickYear?: number | null;
  futurePickRound?: number | null;
  futurePickOriginHandle?: string | null;
  futurePickAssetKind?: FuturePickAssetKind | null;
  dynamicPickValue?: {
    baseline: number;
    adjusted: number;
    adjustment: number;
    direction: 'up' | 'down' | 'flat';
  };
```

- [ ] **Step 4: Add schema fields**

In `prisma/schema.prisma`, add near `DraftStatus`:

```prisma
enum FuturePickAuctionMode {
  PACKAGES
  INDIVIDUAL
  NONE
}
```

Add to `Draft`:

```prisma
  futurePickAuctionMode FuturePickAuctionMode @default(PACKAGES)
```

Add to `Player`:

```prisma
  futurePickYear         Int?
  futurePickRound        Int?
  futurePickOriginHandle String?
  futurePickAssetKind    String?

  @@index([draftId, futurePickOriginHandle])
```

- [ ] **Step 5: Create helper shell**

Create `src/lib/futurePickAssets.ts`:

```ts
import type { FuturePickAuctionMode } from '@/types';

export const FUTURE_PICK_AUCTION_MODES = ['packages', 'individual', 'none'] as const;

export function isFuturePickAuctionMode(value: unknown): value is FuturePickAuctionMode {
  return (
    typeof value === 'string' && FUTURE_PICK_AUCTION_MODES.includes(value as FuturePickAuctionMode)
  );
}
```

- [ ] **Step 6: Run test to verify it passes**

Run:

```bash
pnpm exec jest src/__tests__/futurePickAssets.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 7: Generate migration and Prisma client**

Run:

```bash
pnpm prisma migrate dev --name future_pick_assets
```

Expected: a new migration is created and Prisma Client regenerates. If a local database is not
available, create the migration SQL manually with the same schema changes and run `pnpm prisma generate`.

- [ ] **Step 8: Run typecheck**

Run:

```bash
pnpm exec tsc --noEmit
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/types/index.ts src/lib/futurePickAssets.ts src/__tests__/futurePickAssets.test.ts
git commit -m "Add future pick asset metadata"
```

---

### Task 2: Generate and Filter Future Pick Assets

**Files:**

- Modify: `src/lib/futurePickAssets.ts`
- Test: `src/__tests__/futurePickAssets.test.ts`

- [ ] **Step 1: Extend failing tests for generated assets**

Append to `src/__tests__/futurePickAssets.test.ts`:

```ts
import type { Player, FuturePickAuctionMode } from '@/types';
import { filterFuturePickAssetsForMode, generateFuturePickAssets } from '@/lib/futurePickAssets';

const teams = [
  { handle: 'coreschke', displayName: 'Cole' },
  { handle: 'chappy72', displayName: 'Chappy' },
];

describe('future pick asset generation', () => {
  it('creates one package and three component picks per origin team', () => {
    const assets = generateFuturePickAssets({ teams, year: 2027, startingRank: 900 });

    expect(assets).toHaveLength(8);
    expect(assets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          player: 'coreschke 2027 Pick Package',
          pos: 'PKG',
          team: 'coreschke',
          futurePickOriginHandle: 'coreschke',
          futurePickAssetKind: 'package',
          futurePickRound: null,
        }),
        expect.objectContaining({
          player: 'chappy72 2027 1st',
          pos: 'PICK',
          team: 'chappy72',
          futurePickOriginHandle: 'chappy72',
          futurePickAssetKind: 'pick',
          futurePickRound: 1,
        }),
      ]),
    );
  });

  it.each([
    ['packages', ['coreschke 2027 Pick Package', 'chappy72 2027 Pick Package']],
    [
      'individual',
      [
        'coreschke 2027 1st',
        'coreschke 2027 2nd',
        'coreschke 2027 3rd',
        'chappy72 2027 1st',
        'chappy72 2027 2nd',
        'chappy72 2027 3rd',
      ],
    ],
    ['none', []],
  ] satisfies Array<[FuturePickAuctionMode, string[]]>)(
    'filters visible future pick assets in %s mode',
    (mode, expectedNames) => {
      const basePlayer: Player = {
        player: 'JaMarr Chase',
        team: 'CIN',
        pos: 'WR',
        age: 26,
        sfRank: 1,
        budget: 250,
        ceiling: 288,
        floor: 218,
        notes: '',
      };
      const assets = generateFuturePickAssets({ teams, year: 2027, startingRank: 900 });

      const visible = filterFuturePickAssetsForMode([basePlayer, ...assets], mode);

      expect(visible.map((p) => p.player)).toEqual(['JaMarr Chase', ...expectedNames]);
    },
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm exec jest src/__tests__/futurePickAssets.test.ts --runInBand
```

Expected: FAIL because `generateFuturePickAssets` and `filterFuturePickAssetsForMode` are missing.

- [ ] **Step 3: Implement asset generation and filtering**

Replace `src/lib/futurePickAssets.ts` with:

```ts
import type { FuturePickAuctionMode, Player } from '@/types';

export const FUTURE_PICK_AUCTION_MODES = ['packages', 'individual', 'none'] as const;

const PACKAGE_BASELINE = { budget: 109, ceiling: 131, floor: 75 };
const ROUND_BASELINES: Record<1 | 2 | 3, { budget: number; ceiling: number; floor: number }> = {
  1: { budget: 75, ceiling: 90, floor: 52 },
  2: { budget: 15, ceiling: 18, floor: 10 },
  3: { budget: 5, ceiling: 6, floor: 5 },
};

interface FuturePickTeamInput {
  handle: string;
  displayName: string | null;
}

interface GenerateFuturePickAssetsInput {
  teams: FuturePickTeamInput[];
  year: number;
  startingRank: number;
}

export function isFuturePickAuctionMode(value: unknown): value is FuturePickAuctionMode {
  return (
    typeof value === 'string' && FUTURE_PICK_AUCTION_MODES.includes(value as FuturePickAuctionMode)
  );
}

export function generateFuturePickAssets({
  teams,
  year,
  startingRank,
}: GenerateFuturePickAssetsInput): Player[] {
  return teams.flatMap((team, teamIndex) => {
    const rankBase = startingRank + teamIndex * 4;
    const packageAsset: Player = {
      player: `${team.handle} ${year} Pick Package`,
      team: team.handle,
      pos: 'PKG',
      age: null,
      sfRank: rankBase,
      budget: PACKAGE_BASELINE.budget,
      ceiling: PACKAGE_BASELINE.ceiling,
      floor: PACKAGE_BASELINE.floor,
      notes: `${team.handle}'s ${year} 1st+2nd+3rd`,
      baseBudget: PACKAGE_BASELINE.budget,
      baseCeiling: PACKAGE_BASELINE.ceiling,
      baseFloor: PACKAGE_BASELINE.floor,
      futurePickYear: year,
      futurePickRound: null,
      futurePickOriginHandle: team.handle,
      futurePickAssetKind: 'package',
    };

    const picks: Player[] = ([1, 2, 3] as const).map((round) => {
      const baseline = ROUND_BASELINES[round];
      return {
        player: `${team.handle} ${year} ${ordinal(round)}`,
        team: team.handle,
        pos: 'PICK',
        age: null,
        sfRank: rankBase + round,
        budget: baseline.budget,
        ceiling: baseline.ceiling,
        floor: baseline.floor,
        notes: `${team.handle}'s ${year} ${ordinal(round)} round pick`,
        baseBudget: baseline.budget,
        baseCeiling: baseline.ceiling,
        baseFloor: baseline.floor,
        futurePickYear: year,
        futurePickRound: round,
        futurePickOriginHandle: team.handle,
        futurePickAssetKind: 'pick',
      };
    });

    return [packageAsset, ...picks];
  });
}

export function filterFuturePickAssetsForMode(
  players: Player[],
  mode: FuturePickAuctionMode,
): Player[] {
  return players.filter((player) => {
    if (!player.futurePickAssetKind) return true;
    if (mode === 'none') return false;
    if (mode === 'packages') return player.futurePickAssetKind === 'package';
    return player.futurePickAssetKind === 'pick';
  });
}

function ordinal(round: 1 | 2 | 3): string {
  if (round === 1) return '1st';
  if (round === 2) return '2nd';
  return '3rd';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
pnpm exec jest src/__tests__/futurePickAssets.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/futurePickAssets.ts src/__tests__/futurePickAssets.test.ts
git commit -m "Generate future pick auction assets"
```

---

### Task 3: Draft Creation Mode and Seeding

**Files:**

- Modify: `src/lib/actions.ts`
- Modify: `src/app/drafts/new/page.tsx`
- Modify: `src/lib/playerValueMapping.ts`
- Modify: `prisma/seed-players.ts`
- Modify: `prisma/sync-players.ts`
- Modify: `src/__tests__/createDraft.test.ts`
- Test: `src/__tests__/createDraft.test.ts`

- [ ] **Step 1: Add failing create-draft tests**

In `src/__tests__/createDraft.test.ts`, add `futurePickAuctionMode: 'packages'` to
`VALID_INPUT`.

Update the draft creation expectation:

```ts
expect(mockTxDraftCreate).toHaveBeenCalledWith({
  data: expect.objectContaining({
    futurePickAuctionMode: 'PACKAGES',
  }),
});
```

Append:

```ts
it('seeds origin-team future pick assets for all teams', async () => {
  await createDraft(VALID_INPUT);

  const payload = mockTxPlayerCreateMany.mock.calls[0][0].data as Array<{
    name: string;
    pos: string;
    futurePickOriginHandle?: string | null;
    futurePickAssetKind?: string | null;
    futurePickRound?: number | null;
  }>;

  expect(payload).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        name: 'coreschke 2027 Pick Package',
        pos: 'PKG',
        futurePickOriginHandle: 'coreschke',
        futurePickAssetKind: 'package',
        futurePickRound: null,
      }),
      expect.objectContaining({
        name: 'team2 2027 1st',
        pos: 'PICK',
        futurePickOriginHandle: 'team2',
        futurePickAssetKind: 'pick',
        futurePickRound: 1,
      }),
    ]),
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm exec jest src/__tests__/createDraft.test.ts --runInBand
```

Expected: FAIL because `createDraft` does not accept/store future pick auction mode or seed assets.

- [ ] **Step 3: Wire action input and seeding**

In `src/lib/actions.ts`, import:

```ts
import type { FuturePickAuctionMode } from '@/types';
import { generateFuturePickAssets } from '@/lib/futurePickAssets';
```

Extend `createDraft` input:

```ts
futurePickAuctionMode: FuturePickAuctionMode;
```

Add this helper near `createDraft`:

```ts
function toPrismaFuturePickMode(mode: FuturePickAuctionMode): 'PACKAGES' | 'INDIVIDUAL' | 'NONE' {
  if (mode === 'individual') return 'INDIVIDUAL';
  if (mode === 'none') return 'NONE';
  return 'PACKAGES';
}
```

In `draft.create`, add:

```ts
        futurePickAuctionMode: toPrismaFuturePickMode(data.futurePickAuctionMode),
```

After `valued` is computed, add:

```ts
const nextPickYear = new Date().getFullYear() + 1;
const futurePickAssets = generateFuturePickAssets({
  teams: coerced,
  year: nextPickYear,
  startingRank: 900,
});
const seededPlayers = [...valued, ...futurePickAssets];
```

Use `seededPlayers.map` in `tx.player.createMany` and include metadata:

```ts
        futurePickYear: p.futurePickYear ?? null,
        futurePickRound: p.futurePickRound ?? null,
        futurePickOriginHandle: p.futurePickOriginHandle ?? null,
        futurePickAssetKind: p.futurePickAssetKind ?? null,
```

- [ ] **Step 4: Add draft creation UI control**

In `src/app/drafts/new/page.tsx`, import `FuturePickAuctionMode`, add state:

```ts
const [futurePickAuctionMode, setFuturePickAuctionMode] =
  useState<FuturePickAuctionMode>('packages');
```

Pass it to `createDraft`:

```ts
futurePickAuctionMode,
```

Add a section before Team Roster Table:

```tsx
<div
  style={{
    background: 'var(--bg-surface)',
    borderRadius: '6px',
    padding: '1.25rem',
    marginBottom: '1rem',
  }}
>
  <div style={sectionHeaderStyle}>Future Picks</div>
  <label style={labelStyle}>
    Next-year pick auction mode
    <select
      data-testid="future-pick-auction-mode"
      value={futurePickAuctionMode}
      onChange={(e) => setFuturePickAuctionMode(e.target.value as FuturePickAuctionMode)}
      style={inputStyle}
    >
      <option value="packages">Team packages</option>
      <option value="individual">Individual team picks</option>
      <option value="none">Not auctioned</option>
    </select>
  </label>
</div>
```

- [ ] **Step 5: Preserve metadata in player mapping**

In `src/lib/playerValueMapping.ts`, add fields to `DbPlayerValueRow`:

```ts
futurePickYear: number | null;
futurePickRound: number | null;
futurePickOriginHandle: string | null;
futurePickAssetKind: string | null;
```

In both mapped return objects, add:

```ts
futurePickYear: player.futurePickYear,
futurePickRound: player.futurePickRound,
futurePickOriginHandle: player.futurePickOriginHandle,
futurePickAssetKind: player.futurePickAssetKind === 'package' || player.futurePickAssetKind === 'pick'
  ? player.futurePickAssetKind
  : null,
```

- [ ] **Step 6: Update seed scripts**

In `prisma/seed-players.ts` and `prisma/sync-players.ts`, fetch teams and draft mode:

```ts
const drafts = await prisma.draft.findMany({
  select: { id: true, teams: { select: { handle: true, displayName: true } } },
});
```

For each draft, create:

```ts
const futurePickAssets = generateFuturePickAssets({
  teams: draft.teams,
  year: new Date().getFullYear() + 1,
  startingRank: 900,
});
const seedPlayers = [...BASE_PLAYERS, ...futurePickAssets];
```

Use `seedPlayers` or `missing` derived from it, and include the metadata fields in `createMany`.

- [ ] **Step 7: Run create-draft test**

Run:

```bash
pnpm exec jest src/__tests__/createDraft.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 8: Run typecheck**

Run:

```bash
pnpm exec tsc --noEmit
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/lib/actions.ts src/app/drafts/new/page.tsx src/lib/playerValueMapping.ts prisma/seed-players.ts prisma/sync-players.ts src/__tests__/createDraft.test.ts
git commit -m "Seed future picks by draft mode"
```

---

### Task 4: Starting Lineup Optimizer

**Files:**

- Create: `src/lib/lineupOptimizer.ts`
- Test: `src/__tests__/lineupOptimizer.test.ts`

- [ ] **Step 1: Write failing optimizer tests**

Create `src/__tests__/lineupOptimizer.test.ts`:

```ts
import { optimizeProjectedLineupPoints } from '@/lib/lineupOptimizer';
import type { Player, StartingSlot } from '@/types';

const player = (name: string, pos: Player['pos'], projectedPoints: number): Player => ({
  player: name,
  team: 'NFL',
  pos,
  age: 25,
  sfRank: projectedPoints,
  budget: projectedPoints,
  ceiling: projectedPoints,
  floor: projectedPoints,
  notes: '',
  projectedPoints,
});

describe('optimizeProjectedLineupPoints', () => {
  it('uses exact 2TE lineup slots instead of a fixed default lineup', () => {
    const lineup: StartingSlot[] = ['QB', 'RB', 'WR', 'TE', 'TE', 'FLEX'];
    const roster = [
      player('QB1', 'QB', 20),
      player('RB1', 'RB', 15),
      player('WR1', 'WR', 14),
      player('TE1', 'TE', 12),
      player('TE2', 'TE', 10),
      player('WR2', 'WR', 9),
    ];

    expect(optimizeProjectedLineupPoints(roster, lineup).points).toBe(80);
    expect(optimizeProjectedLineupPoints(roster, lineup).players.map((p) => p.player)).toEqual([
      'QB1',
      'RB1',
      'WR1',
      'TE1',
      'TE2',
      'WR2',
    ]);
  });

  it('fills SUPER_FLEX with the best remaining eligible player', () => {
    const lineup: StartingSlot[] = ['QB', 'SUPER_FLEX'];
    const roster = [player('QB1', 'QB', 20), player('QB2', 'QB', 18), player('RB1', 'RB', 17)];

    expect(optimizeProjectedLineupPoints(roster, lineup).players.map((p) => p.player)).toEqual([
      'QB1',
      'QB2',
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm exec jest src/__tests__/lineupOptimizer.test.ts --runInBand
```

Expected: FAIL because `lineupOptimizer` does not exist.

- [ ] **Step 3: Implement optimizer**

Create `src/lib/lineupOptimizer.ts`:

```ts
import type { Player, StartingSlot } from '@/types';

interface OptimizedLineup {
  points: number;
  players: Player[];
}

const SLOT_ORDER: Record<StartingSlot, number> = {
  QB: 0,
  RB: 1,
  WR: 2,
  TE: 3,
  SUPER_FLEX: 4,
  FLEX: 5,
};

export function optimizeProjectedLineupPoints(
  roster: Player[],
  lineup: StartingSlot[],
): OptimizedLineup {
  const selected = new Set<string>();
  const players: Player[] = [];
  const sortedSlots = [...lineup].sort((a, b) => SLOT_ORDER[a] - SLOT_ORDER[b]);

  for (const slot of sortedSlots) {
    const candidate = roster
      .filter((player) => !selected.has(player.player))
      .filter((player) => isEligibleForSlot(player.pos, slot))
      .sort((a, b) => (b.projectedPoints ?? 0) - (a.projectedPoints ?? 0))[0];
    if (!candidate) continue;
    selected.add(candidate.player);
    players.push(candidate);
  }

  return {
    points: players.reduce((sum, player) => sum + (player.projectedPoints ?? 0), 0),
    players,
  };
}

function isEligibleForSlot(pos: Player['pos'], slot: StartingSlot): boolean {
  if (slot === 'FLEX') return pos === 'RB' || pos === 'WR' || pos === 'TE';
  if (slot === 'SUPER_FLEX') return pos === 'QB' || pos === 'RB' || pos === 'WR' || pos === 'TE';
  return pos === slot;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
pnpm exec jest src/__tests__/lineupOptimizer.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/lineupOptimizer.ts src/__tests__/lineupOptimizer.test.ts
git commit -m "Add projected lineup optimizer"
```

---

### Task 5: Dynamic Pick Value Calculator

**Files:**

- Create: `src/lib/dynamicPickValues.ts`
- Test: `src/__tests__/dynamicPickValues.test.ts`

- [ ] **Step 1: Write failing calculator tests**

Create `src/__tests__/dynamicPickValues.test.ts`:

```ts
import { applyDynamicPickValues } from '@/lib/dynamicPickValues';
import type { Player, StartingSlot } from '@/types';

const lineup: StartingSlot[] = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'SUPER_FLEX'];

const p = (overrides: Partial<Player>): Player => ({
  player: 'Player',
  team: 'NFL',
  pos: 'WR',
  age: 25,
  sfRank: 1,
  budget: 100,
  ceiling: 115,
  floor: 87,
  notes: '',
  projectedPoints: 100,
  vor: 20,
  ...overrides,
});

const bid = (player: string, teamHandle: string, price: number) => ({ player, teamHandle, price });

describe('applyDynamicPickValues', () => {
  it('raises a weak origin team package and lowers a strong origin team package', () => {
    const players = [
      p({ player: 'Weak WR', budget: 100, projectedPoints: 40, vor: 2, age: 31 }),
      p({
        player: 'weak 2027 Pick Package',
        pos: 'PKG',
        team: 'weak',
        budget: 109,
        ceiling: 131,
        floor: 75,
        futurePickOriginHandle: 'weak',
        futurePickAssetKind: 'package',
        futurePickYear: 2027,
      }),
      p({ player: 'Strong QB', pos: 'QB', budget: 100, projectedPoints: 300, vor: 80, age: 24 }),
      p({ player: 'Strong WR', budget: 100, projectedPoints: 260, vor: 70, age: 25 }),
      p({
        player: 'strong 2027 Pick Package',
        pos: 'PKG',
        team: 'strong',
        budget: 109,
        ceiling: 131,
        floor: 75,
        futurePickOriginHandle: 'strong',
        futurePickAssetKind: 'package',
        futurePickYear: 2027,
      }),
    ];

    const adjusted = applyDynamicPickValues({
      players,
      bids: [
        bid('Weak WR', 'weak', 150),
        bid('Strong QB', 'strong', 60),
        bid('Strong WR', 'strong', 70),
      ],
      startingLineup: lineup,
    });

    expect(
      adjusted.find((player) => player.player === 'weak 2027 Pick Package')!.budget,
    ).toBeGreaterThan(109);
    expect(
      adjusted.find((player) => player.player === 'strong 2027 Pick Package')!.budget,
    ).toBeLessThan(109);
  });

  it('does not adjust future pick rows without enough origin-team data', () => {
    const players = [
      p({
        player: 'thin 2027 Pick Package',
        pos: 'PKG',
        team: 'thin',
        budget: 109,
        ceiling: 131,
        floor: 75,
        futurePickOriginHandle: 'thin',
        futurePickAssetKind: 'package',
        futurePickYear: 2027,
      }),
    ];

    const [pkg] = applyDynamicPickValues({ players, bids: [], startingLineup: lineup });

    expect(pkg.budget).toBe(109);
    expect(pkg.dynamicPickValue?.direction).toBe('flat');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm exec jest src/__tests__/dynamicPickValues.test.ts --runInBand
```

Expected: FAIL because `dynamicPickValues` does not exist.

- [ ] **Step 3: Implement conservative dynamic calculator**

Create `src/lib/dynamicPickValues.ts`:

```ts
import type { Player, StartingSlot } from '@/types';
import { optimizeProjectedLineupPoints } from './lineupOptimizer';

interface BidInput {
  player: string;
  teamHandle: string;
  price: number;
}

interface ApplyDynamicPickValuesInput {
  players: Player[];
  bids: BidInput[];
  startingLineup: StartingSlot[];
}

interface OriginSignals {
  playerCount: number;
  spend: number;
  value: number;
  surplusRate: number;
  lineupPoints: number;
  vor: number;
  avgAge: number | null;
  futureCapital: number;
}

const MIN_BIDS = 1;
const MAX_TOTAL_ADJUSTMENT = 0.15;

export function applyDynamicPickValues({
  players,
  bids,
  startingLineup,
}: ApplyDynamicPickValuesInput): Player[] {
  const signalsByOrigin = computeOriginSignals(players, bids, startingLineup);

  return players.map((player) => {
    if (!player.futurePickOriginHandle) return player;
    const baseline = player.baseBudget ?? player.budget;
    const signals = signalsByOrigin.get(player.futurePickOriginHandle);
    if (!signals || signals.playerCount < MIN_BIDS || signals.spend <= 0) {
      return withDynamicValue(player, baseline, baseline);
    }

    const adjustment = clamp(
      -signals.surplusRate * 0.25 -
        normalizeStrength(signals.lineupPoints, 120, 750) * 0.05 -
        normalizeStrength(signals.vor, 0, 180) * 0.05 +
        rebuildSignal(signals) * 0.08,
      -MAX_TOTAL_ADJUSTMENT,
      MAX_TOTAL_ADJUSTMENT,
    );
    const adjusted = Math.max(1, Math.round(baseline * (1 + adjustment)));
    return withDynamicValue(player, baseline, adjusted);
  });
}

function computeOriginSignals(
  players: Player[],
  bids: BidInput[],
  startingLineup: StartingSlot[],
): Map<string, OriginSignals> {
  const playerByName = new Map(players.map((player) => [player.player, player]));
  const rosterByTeam = new Map<string, Player[]>();

  for (const bid of bids) {
    const player = playerByName.get(bid.player);
    if (!player) continue;
    const roster = rosterByTeam.get(bid.teamHandle) ?? [];
    roster.push(player);
    rosterByTeam.set(bid.teamHandle, roster);
  }

  const out = new Map<string, OriginSignals>();
  for (const [teamHandle, roster] of rosterByTeam) {
    const bidsForTeam = bids.filter((bid) => bid.teamHandle === teamHandle);
    const playerRoster = roster.filter((player) => player.pos !== 'PICK' && player.pos !== 'PKG');
    const spend = bidsForTeam.reduce((sum, bid) => sum + bid.price, 0);
    const value = roster.reduce((sum, player) => sum + (player.baseBudget ?? player.budget), 0);
    const ages = playerRoster
      .map((player) => player.age)
      .filter((age): age is number => age !== null);
    const futureCapital = roster
      .filter((player) => player.pos === 'PICK' || player.pos === 'PKG')
      .reduce((sum, player) => sum + (player.baseBudget ?? player.budget), 0);

    out.set(teamHandle, {
      playerCount: playerRoster.length,
      spend,
      value,
      surplusRate: spend > 0 ? (value - spend) / spend : 0,
      lineupPoints: optimizeProjectedLineupPoints(playerRoster, startingLineup).points,
      vor: playerRoster.reduce((sum, player) => sum + (player.vor ?? 0), 0),
      avgAge: ages.length > 0 ? ages.reduce((sum, age) => sum + age, 0) / ages.length : null,
      futureCapital,
    });
  }
  return out;
}

function withDynamicValue(player: Player, baseline: number, adjusted: number): Player {
  const floor = Math.max(5, Math.round((adjusted * 87) / 100));
  const ceiling = Math.round((adjusted * 115) / 100);
  const direction = adjusted > baseline ? 'up' : adjusted < baseline ? 'down' : 'flat';
  return {
    ...player,
    budget: adjusted,
    floor,
    ceiling,
    dynamicPickValue: {
      baseline,
      adjusted,
      adjustment: adjusted - baseline,
      direction,
    },
  };
}

function normalizeStrength(value: number, low: number, high: number): number {
  if (high <= low) return 0;
  return clamp((value - low) / (high - low), 0, 1);
}

function rebuildSignal(signals: OriginSignals): number {
  const ageSignal = signals.avgAge !== null && signals.avgAge < 25 ? 1 : 0;
  const weakLineupSignal = signals.lineupPoints < 250 ? 1 : 0;
  const weakVorSignal = signals.vor < 30 ? 1 : 0;
  const futureCapitalSignal = signals.futureCapital > 0 ? 1 : 0;
  return (ageSignal + weakLineupSignal + weakVorSignal + futureCapitalSignal) / 4;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
```

- [ ] **Step 4: Run calculator tests**

Run:

```bash
pnpm exec jest src/__tests__/dynamicPickValues.test.ts src/__tests__/lineupOptimizer.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/dynamicPickValues.ts src/__tests__/dynamicPickValues.test.ts
git commit -m "Compute dynamic future pick values"
```

---

### Task 6: Server Page Wiring and Filtering

**Files:**

- Modify: `src/app/draft/[draftId]/page.tsx`
- Modify: `src/app/draft/[draftId]/nominate/page.tsx`
- Modify: `src/app/api/draft/[draftId]/nomination-data/route.ts`
- Test: `src/__tests__/playerValueMapping.test.ts` or new `src/__tests__/auctionPlayerPipeline.test.ts`

- [ ] **Step 1: Add a focused pipeline test**

Create `src/__tests__/auctionPlayerPipeline.test.ts`:

```ts
import { applyDynamicPickValues } from '@/lib/dynamicPickValues';
import { filterFuturePickAssetsForMode } from '@/lib/futurePickAssets';
import type { Player, StartingSlot } from '@/types';

const lineup: StartingSlot[] = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'SUPER_FLEX'];

const p = (overrides: Partial<Player>): Player => ({
  player: 'Player',
  team: 'NFL',
  pos: 'WR',
  age: 25,
  sfRank: 1,
  budget: 100,
  ceiling: 115,
  floor: 87,
  notes: '',
  projectedPoints: 100,
  vor: 20,
  ...overrides,
});

describe('auction player pipeline', () => {
  it('filters hidden future pick assets before dynamic values reach the UI', () => {
    const players = [
      p({ player: 'Origin QB', team: 'origin', pos: 'QB', projectedPoints: 250, vor: 70 }),
      p({
        player: 'origin 2027 Pick Package',
        pos: 'PKG',
        team: 'origin',
        futurePickOriginHandle: 'origin',
        futurePickAssetKind: 'package',
        budget: 109,
      }),
      p({
        player: 'origin 2027 1st',
        pos: 'PICK',
        team: 'origin',
        futurePickOriginHandle: 'origin',
        futurePickAssetKind: 'pick',
        futurePickRound: 1,
        budget: 75,
      }),
    ];

    const adjusted = applyDynamicPickValues({
      players,
      bids: [{ player: 'Origin QB', teamHandle: 'origin', price: 80 }],
      startingLineup: lineup,
    });

    expect(
      filterFuturePickAssetsForMode(adjusted, 'packages').map((player) => player.player),
    ).toEqual(['Origin QB', 'origin 2027 Pick Package']);
  });
});
```

- [ ] **Step 2: Run test**

Run:

```bash
pnpm exec jest src/__tests__/auctionPlayerPipeline.test.ts --runInBand
```

Expected: PASS if previous helpers are correct.

- [ ] **Step 3: Wire draft home page**

In `src/app/draft/[draftId]/page.tsx`, import:

```ts
import { applyDynamicPickValues } from '@/lib/dynamicPickValues';
import { filterFuturePickAssetsForMode } from '@/lib/futurePickAssets';
import type { FuturePickAuctionMode } from '@/types';
```

Fetch teams with results instead of handles only, or add a separate query:

```ts
prisma.team.findMany({
  where: { draftId },
  select: {
    id: true,
    handle: true,
    displayName: true,
    results: { select: { player: true, price: true, team: { select: { handle: true } } } },
  },
  orderBy: { handle: 'asc' },
}),
```

Map bids:

```ts
const dynamicBids = teams.flatMap((team) =>
  team.results.map((result) => ({
    player: result.player,
    price: result.price,
    teamHandle: team.handle,
  })),
);
```

After `mapPlayersWithDraftValues`, apply:

```ts
const dynamicPlayers = applyDynamicPickValues({
  players,
  bids: dynamicBids,
  startingLineup: (draft.startingLineup ?? DEFAULT_STARTING_LINEUP) as StartingSlot[],
});
const visiblePlayers = filterFuturePickAssetsForMode(
  dynamicPlayers,
  fromPrismaFuturePickMode(draft.futurePickAuctionMode),
);
```

Pass `visiblePlayers` to `AuctionSheet`.

Add helper:

```ts
function fromPrismaFuturePickMode(mode: string): FuturePickAuctionMode {
  if (mode === 'INDIVIDUAL') return 'individual';
  if (mode === 'NONE') return 'none';
  return 'packages';
}
```

- [ ] **Step 4: Apply the same filtering to nomination player lists**

In `src/app/draft/[draftId]/nominate/page.tsx`, after mapping players, call
`filterFuturePickAssetsForMode` with the draft mode before passing players to nomination scoring.

In `src/app/api/draft/[draftId]/nomination-data/route.ts`, make sure any player payload respects the
same filter so client refreshes do not reintroduce hidden rows.

- [ ] **Step 5: Run targeted tests and typecheck**

Run:

```bash
pnpm exec jest src/__tests__/auctionPlayerPipeline.test.ts src/__tests__/playerValueMapping.test.ts --runInBand
pnpm exec tsc --noEmit
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add 'src/app/draft/[draftId]/page.tsx' 'src/app/draft/[draftId]/nominate/page.tsx' 'src/app/api/draft/[draftId]/nomination-data/route.ts' src/__tests__/auctionPlayerPipeline.test.ts
git commit -m "Apply dynamic future pick values to draft pages"
```

---

### Task 7: UI Indicator for Dynamic Pick Values

**Files:**

- Modify: `src/components/AuctionSheet/PlayerTable.tsx`
- Test: `src/__tests__/PlayerTable.test.tsx`

- [ ] **Step 1: Add failing UI test**

In `src/__tests__/PlayerTable.test.tsx`, add a `PKG` player with `dynamicPickValue` and assert:

```ts
expect(screen.getByTestId('dynamic-pick-value-1')).toHaveTextContent('+$11');
expect(screen.getByTestId('dynamic-pick-value-1')).toHaveAttribute(
  'title',
  'Baseline $109 · Adjusted $120',
);
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm exec jest src/__tests__/PlayerTable.test.tsx --runInBand
```

Expected: FAIL because no dynamic pick indicator exists.

- [ ] **Step 3: Render indicator**

In `src/components/AuctionSheet/PlayerTable.tsx`, next to the `${p.budget}` target cell content,
render:

```tsx
{
  p.dynamicPickValue && p.dynamicPickValue.direction !== 'flat' && (
    <span
      data-testid={`dynamic-pick-value-${p.sfRank}`}
      title={`Baseline $${p.dynamicPickValue.baseline} · Adjusted $${p.dynamicPickValue.adjusted}`}
      className="ml-1 font-mono text-[10px] tabular-nums"
      style={{
        color: p.dynamicPickValue.direction === 'up' ? 'var(--age-young)' : 'var(--age-old)',
      }}
    >
      {p.dynamicPickValue.adjustment > 0
        ? `+$${p.dynamicPickValue.adjustment}`
        : `-$${Math.abs(p.dynamicPickValue.adjustment)}`}
    </span>
  );
}
```

- [ ] **Step 4: Run UI test**

Run:

```bash
pnpm exec jest src/__tests__/PlayerTable.test.tsx --runInBand
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/AuctionSheet/PlayerTable.tsx src/__tests__/PlayerTable.test.tsx
git commit -m "Show dynamic pick value adjustments"
```

---

### Task 8: Remove Static Duplicate Future Pick Rows

**Files:**

- Modify: `src/data/players.ts`
- Modify: `src/__tests__/players.test.ts`
- Test: `src/__tests__/players.test.ts`, `src/__tests__/futurePickAssets.test.ts`

- [ ] **Step 1: Add failing assertion against generic next-year rows**

In `src/__tests__/players.test.ts`, add:

```ts
it('does not include generated next-year future pick assets in the static base list', () => {
  expect(players.some((p) => p.player === '2027 1st Round Pick')).toBe(false);
  expect(players.some((p) => p.player === 'Matt Gay')).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm exec jest src/__tests__/players.test.ts --runInBand
```

Expected: FAIL while static 2027 package/pick rows remain.

- [ ] **Step 3: Remove generated assets from static base data**

In `src/data/players.ts`, delete all hardcoded `PKG` and `PICK` rows from `RAW`. Delete `PKG_VALUES`
and the `if (pos === 'PKG')` special case because future-pick auction assets now come from
`generateFuturePickAssets`.

- [ ] **Step 4: Run tests**

Run:

```bash
pnpm exec jest src/__tests__/players.test.ts src/__tests__/futurePickAssets.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/data/players.ts src/__tests__/players.test.ts
git commit -m "Remove static generated future pick rows"
```

---

### Task 9: Final Verification

**Files:**

- All changed files

- [ ] **Step 1: Run full unit suite**

Run:

```bash
pnpm exec jest --runInBand
```

Expected: all test suites pass.

- [ ] **Step 2: Run typecheck**

Run:

```bash
pnpm exec tsc --noEmit
```

Expected: PASS.

- [ ] **Step 3: Run lint**

Run:

```bash
pnpm lint
```

Expected: PASS.

- [ ] **Step 4: Run format check**

Run:

```bash
pnpm exec prettier --check .
```

Expected: PASS.

- [ ] **Step 5: Review final diff**

Run:

```bash
git status --short
git diff --stat main...HEAD
```

Expected: only files related to dynamic future pick valuation are changed.

- [ ] **Step 6: Commit any final fixes**

If verification required small fixes:

```bash
git add <fixed-files>
git commit -m "Polish dynamic pick valuation"
```

If no fixes were needed, do not create an empty commit.
