# Automatic Projection Application Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically apply stored projection-shaped market values to every newly created draft,
and fail draft creation loudly when no usable projection source exists.

**Architecture:** Move draft-specific projection application into `src/lib/projectionApplication.ts`
so both `createDraft` and the CLI can use the same logic. Keep CSV parsing/import helpers in
`prisma/apply-projection-values.ts`, but make the CLI import projections into Postgres first and
then call the reusable draft application service.

**Tech Stack:** Next.js server actions, Prisma 7, TypeScript, Jest, pnpm.

---

## File Structure

- Create: `src/lib/projectionApplication.ts`
  - Owns DB-backed draft projection application.
  - Selects latest projection source.
  - Reads draft settings, players, and stored `PlayerProjection` rows.
  - Writes `DraftPlayerValue` rows and stale-row deletes.
- Modify: `prisma/apply-projection-values.ts`
  - Keep CSV parsing and CLI entrypoint.
  - Add reusable `importProjectionRows` for `ProjectionSource` + `PlayerProjection`.
  - Call `applyProjectionValuesToDraft` after import.
- Modify: `src/lib/actions.ts`
  - Call `applyProjectionValuesToDraft` after the draft/player transaction succeeds and before
    redirect.
- Modify: `src/__tests__/projectionApply.test.ts`
  - Keep tests for CSV parsing/grouping/build helpers.
  - Add import helper tests with mocked Prisma delegates.
- Create: `src/__tests__/projectionApplication.test.ts`
  - Cover latest-source selection, no-source failure, zero-join failure, and DB write shape.
- Modify: `src/__tests__/createDraft.test.ts`
  - Mock `applyProjectionValuesToDraft`.
  - Assert draft creation applies projections after seeding.
  - Assert projection failure rejects and does not redirect.
- Modify: `README.md`, `AGENTS.md`, `ROADMAP.md`
  - Replace manual-draft-application language with the new automatic behavior and the requirement
    that Postgres has at least one imported projection source.

---

### Task 1: Add DB-backed projection application service

**Files:**

- Create: `src/lib/projectionApplication.ts`
- Test: `src/__tests__/projectionApplication.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/__tests__/projectionApplication.test.ts` with:

```ts
import { applyProjectionValuesToDraft } from '@/lib/projectionApplication';

const mockDraftFindUnique = jest.fn();
const mockProjectionSourceFindFirst = jest.fn();
const mockPlayerFindMany = jest.fn();
const mockPlayerUpdate = jest.fn();
const mockPlayerProjectionFindMany = jest.fn();
const mockDraftPlayerValueDeleteMany = jest.fn();
const mockDraftPlayerValueUpsert = jest.fn();
const mockTransaction = jest.fn();

const prisma = {
  draft: { findUnique: mockDraftFindUnique },
  projectionSource: { findFirst: mockProjectionSourceFindFirst },
  player: { findMany: mockPlayerFindMany, update: mockPlayerUpdate },
  playerProjection: { findMany: mockPlayerProjectionFindMany },
  draftPlayerValue: {
    deleteMany: mockDraftPlayerValueDeleteMany,
    upsert: mockDraftPlayerValueUpsert,
  },
  $transaction: mockTransaction,
};

const draft = {
  id: 5,
  teamCount: 12,
  rosterSize: 30,
  budget: 1000,
  startingLineup: ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'FLEX', 'FLEX', 'SUPER_FLEX'],
  scoringSettings: {
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
  targetRoster: { QB: 4, RB: 9, WR: 11, TE: 3 },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockDraftFindUnique.mockResolvedValue(draft);
  mockProjectionSourceFindFirst.mockResolvedValue({
    id: 7,
    name: 'mike_clay',
    season: 2026,
    projectionDate: new Date('2026-06-01T00:00:00.000Z'),
  });
  mockPlayerFindMany.mockResolvedValue([
    { id: 1, name: 'Josh Allen', pos: 'QB', sleeperId: '10', budget: 255 },
    { id: 2, name: 'Missing Projection', pos: 'WR', sleeperId: null, budget: 20 },
  ]);
  mockPlayerProjectionFindMany.mockResolvedValue([
    {
      sleeperId: '10',
      position: 'QB',
      games: 17,
      passAtt: 520,
      passCmp: 330,
      passYds: 4100,
      passTd: 30,
      passInt: 10,
      passSacks: 35,
      rushAtt: 110,
      rushYds: 550,
      rushTd: 8,
      targets: 0,
      receptions: 0,
      recYds: 0,
      recTd: 0,
      baseFantasyPoints: 0,
      projectionRank: 1,
    },
  ]);
  mockTransaction.mockImplementation(async (operations) => Promise.all(operations));
  mockDraftPlayerValueDeleteMany.mockResolvedValue({ count: 0 });
  mockDraftPlayerValueUpsert.mockResolvedValue({});
});

it('applies the latest stored projection source to a draft', async () => {
  const result = await applyProjectionValuesToDraft(prisma, { draftId: 5 });

  expect(result).toEqual({ projectionSourceId: 7, appliedCount: 1 });
  expect(mockProjectionSourceFindFirst).toHaveBeenCalledWith({
    orderBy: [{ projectionDate: 'desc' }, { updatedAt: 'desc' }, { id: 'desc' }],
  });
  expect(mockPlayerProjectionFindMany).toHaveBeenCalledWith({
    where: { projectionSourceId: 7 },
  });
  expect(mockDraftPlayerValueDeleteMany).toHaveBeenCalledWith({
    where: { draftId: 5, projectionSourceId: 7, playerId: { notIn: [1] } },
  });
  expect(mockDraftPlayerValueUpsert).toHaveBeenCalledWith(
    expect.objectContaining({
      where: {
        draftId_playerId_projectionSourceId: {
          draftId: 5,
          playerId: 1,
          projectionSourceId: 7,
        },
      },
    }),
  );
});

it('throws when no projection source exists', async () => {
  mockProjectionSourceFindFirst.mockResolvedValue(null);

  await expect(applyProjectionValuesToDraft(prisma, { draftId: 5 })).rejects.toThrow(
    'No projection source found',
  );
});

it('throws when no draft players can be joined to projections', async () => {
  mockPlayerProjectionFindMany.mockResolvedValue([]);

  await expect(applyProjectionValuesToDraft(prisma, { draftId: 5 })).rejects.toThrow(
    'No projection values could be applied to draft 5',
  );
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm test projectionApplication
```

Expected: fail because `@/lib/projectionApplication` does not exist.

- [ ] **Step 3: Implement the service**

Create `src/lib/projectionApplication.ts`:

```ts
import {
  DEFAULT_SCORING_SETTINGS,
  DEFAULT_STARTING_LINEUP,
  DEFAULT_TARGET_ROSTER,
  type Position,
  type ScoringSettings,
  type StartingSlot,
} from '@/types';
import {
  calculateProjectionMarketValues,
  type ProjectionMarketValueOutput,
} from '@/lib/projectionMarketValue';
import { calculateProjectedPoints, type ProjectionStats } from '@/lib/projectionScoring';
import { calculateProjectionValues, type ProjectionValueInput } from '@/lib/projectionVor';

type VorPosition = 'QB' | 'RB' | 'WR' | 'TE';

export interface ProjectionApplyPrisma {
  draft: {
    findUnique(args: {
      where: { id: number };
      select: {
        id: true;
        teamCount: true;
        rosterSize: true;
        budget: true;
        startingLineup: true;
        scoringSettings: true;
        targetRoster: true;
      };
    }): Promise<{
      id: number;
      teamCount: number;
      rosterSize: number;
      budget: number;
      startingLineup: unknown;
      scoringSettings: unknown;
      targetRoster: unknown;
    } | null>;
  };
  projectionSource: {
    findFirst(args: {
      orderBy: Array<{ projectionDate?: 'desc' } | { updatedAt?: 'desc' } | { id?: 'desc' }>;
    }): Promise<{ id: number } | null>;
  };
  player: {
    findMany(args: {
      where: { draftId: number };
      select: { id: true; name: true; pos: true; sleeperId: true; budget: true };
    }): Promise<PlayerJoinRow[]>;
    update(args: { where: { id: number }; data: { sleeperId: string } }): unknown;
  };
  playerProjection: {
    findMany(args: { where: { projectionSourceId: number } }): Promise<StoredProjectionRow[]>;
  };
  draftPlayerValue: {
    deleteMany(args: { where: DraftPlayerValueDeleteWhere }): unknown;
    upsert(args: {
      where: {
        draftId_playerId_projectionSourceId: {
          draftId: number;
          playerId: number;
          projectionSourceId: number;
        };
      };
      create: DraftPlayerValueWrite;
      update: DraftPlayerValueData;
    }): unknown;
  };
  $transaction(operations: unknown[], options?: { timeout: number }): Promise<unknown[]>;
}

interface PlayerJoinRow {
  id: number;
  name: string;
  pos: string;
  sleeperId: string | null;
  budget: number;
}

interface StoredProjectionRow {
  sleeperId: string;
  position: string;
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
}

interface JoinedProjectionRow {
  playerId: number;
  sleeperId: string;
  position: VorPosition;
  projectedPoints: number;
  baselineProjectedPoints: number;
  fallbackAuctionValue: number;
  isRookie: boolean;
}

interface DraftPlayerValueData {
  projectedPoints: number;
  replacementPoints: number | null;
  vor: number | null;
  projectionAuctionValue: number | null;
  fallbackAuctionValue: number;
  activeAuctionValue: number;
  valueSource: string;
}

interface DraftPlayerValueWrite extends DraftPlayerValueData {
  draftId: number;
  playerId: number;
  projectionSourceId: number;
}

interface DraftPlayerValueDeleteWhere {
  draftId: number;
  projectionSourceId: number;
  playerId?: { notIn: number[] };
}

export interface ApplyProjectionValuesOptions {
  draftId: number;
  projectionSourceId?: number;
  etrMatches?: Map<string, string>;
}

export interface ApplyProjectionValuesResult {
  projectionSourceId: number;
  appliedCount: number;
}

const WRITE_BATCH_SIZE = 50;
const WRITE_TRANSACTION_TIMEOUT_MS = 60_000;

export async function applyProjectionValuesToDraft(
  prisma: ProjectionApplyPrisma,
  options: ApplyProjectionValuesOptions,
): Promise<ApplyProjectionValuesResult> {
  const draft = await prisma.draft.findUnique({
    where: { id: options.draftId },
    select: {
      id: true,
      teamCount: true,
      rosterSize: true,
      budget: true,
      startingLineup: true,
      scoringSettings: true,
      targetRoster: true,
    },
  });
  if (!draft) throw new Error(`Draft ${options.draftId} not found`);

  const sourceId = options.projectionSourceId ?? (await getLatestProjectionSourceId(prisma));
  if (sourceId === null) throw new Error('No projection source found');

  const scoringSettings = toScoringSettings(draft.scoringSettings);
  const players = await prisma.player.findMany({
    where: { draftId: draft.id },
    select: { id: true, name: true, pos: true, sleeperId: true, budget: true },
  });
  const playersWithSleeperIds = resolvePlayerSleeperIds(players, options.etrMatches ?? new Map());

  for (const batch of chunk(getSleeperIdUpdates(playersWithSleeperIds), WRITE_BATCH_SIZE)) {
    await prisma.$transaction(
      batch.map((player) =>
        prisma.player.update({
          where: { id: player.id },
          data: { sleeperId: player.sleeperId },
        }),
      ),
      { timeout: WRITE_TRANSACTION_TIMEOUT_MS },
    );
  }

  const storedProjections = await prisma.playerProjection.findMany({
    where: { projectionSourceId: sourceId },
  });
  const joined = joinPlayersToStoredProjectionRows(
    playersWithSleeperIds,
    storedProjections,
    scoringSettings,
  );
  if (joined.length === 0) {
    throw new Error(`No projection values could be applied to draft ${draft.id}`);
  }

  const projectionInputs: ProjectionValueInput[] = joined.map((row) => ({
    sleeperId: row.sleeperId,
    name: String(row.playerId),
    position: row.position,
    projectedPoints: row.projectedPoints,
    fallbackAuctionValue: row.fallbackAuctionValue,
    isRookie: row.isRookie,
  }));
  const values = calculateProjectionValues({
    players: projectionInputs,
    teamCount: draft.teamCount,
    rosterSize: draft.rosterSize,
    budget: draft.budget,
    startingLineup: toStartingLineup(draft.startingLineup),
    targetRoster: toTargetRoster(draft.targetRoster),
    scoringSettings,
  });
  const valuesBySleeperId = new Map(values.map((value) => [value.sleeperId, value]));
  const marketValues = calculateProjectionMarketValues({
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
  const marketValuesBySleeperId = new Map(marketValues.map((value) => [value.sleeperId, value]));

  const writes = joined.flatMap((row) => {
    const value = valuesBySleeperId.get(row.sleeperId);
    const marketValue = marketValuesBySleeperId.get(row.sleeperId);
    if (!value || !marketValue) return [];
    const data = buildDraftPlayerValueData(row, value, marketValue);
    return [
      prisma.draftPlayerValue.upsert({
        where: {
          draftId_playerId_projectionSourceId: {
            draftId: draft.id,
            playerId: row.playerId,
            projectionSourceId: sourceId,
          },
        },
        create: {
          draftId: draft.id,
          playerId: row.playerId,
          projectionSourceId: sourceId,
          ...data,
        },
        update: data,
      }),
    ];
  });

  await prisma.draftPlayerValue.deleteMany({
    where: buildStaleDraftPlayerValueDeleteWhere(draft.id, sourceId, joined),
  });

  for (const batch of chunk(writes, WRITE_BATCH_SIZE)) {
    await prisma.$transaction(batch, { timeout: WRITE_TRANSACTION_TIMEOUT_MS });
  }

  return { projectionSourceId: sourceId, appliedCount: joined.length };
}

async function getLatestProjectionSourceId(prisma: ProjectionApplyPrisma): Promise<number | null> {
  const source = await prisma.projectionSource.findFirst({
    orderBy: [{ projectionDate: 'desc' }, { updatedAt: 'desc' }, { id: 'desc' }],
  });
  return source?.id ?? null;
}

interface ResolvedPlayerJoinRow extends PlayerJoinRow {
  shouldUpdateSleeperId: boolean;
}

export function resolvePlayerSleeperIds(
  players: PlayerJoinRow[],
  etrMatches: Map<string, string>,
): ResolvedPlayerJoinRow[] {
  return players.map((player) => {
    const resolvedSleeperId = player.sleeperId ?? etrMatches.get(player.name) ?? null;
    return {
      ...player,
      sleeperId: resolvedSleeperId,
      shouldUpdateSleeperId: player.sleeperId !== resolvedSleeperId && resolvedSleeperId !== null,
    };
  });
}

export function getSleeperIdUpdates(players: ResolvedPlayerJoinRow[]): Array<{
  id: number;
  sleeperId: string;
}> {
  return players.flatMap((player) =>
    player.shouldUpdateSleeperId && player.sleeperId
      ? [{ id: player.id, sleeperId: player.sleeperId }]
      : [],
  );
}

function joinPlayersToStoredProjectionRows(
  players: PlayerJoinRow[],
  projections: StoredProjectionRow[],
  scoring: ScoringSettings,
): JoinedProjectionRow[] {
  const projectionsBySleeperId = new Map(
    projections.flatMap((projection) => {
      const position = toVorPosition(projection.position);
      return position ? [[projection.sleeperId, { ...projection, position }]] : [];
    }),
  );

  return players.flatMap((player) => {
    if (!player.sleeperId) return [];
    const projection = projectionsBySleeperId.get(player.sleeperId);
    if (!projection) return [];
    const stats = toProjectionStats(projection);
    return [
      {
        playerId: player.id,
        sleeperId: player.sleeperId,
        position: projection.position,
        projectedPoints: calculateProjectedPoints(stats, scoring),
        baselineProjectedPoints: calculateProjectedPoints(stats, DEFAULT_SCORING_SETTINGS),
        fallbackAuctionValue: player.budget,
        isRookie: false,
      },
    ];
  });
}

function toProjectionStats(row: StoredProjectionRow & { position: VorPosition }): ProjectionStats {
  return {
    sleeperId: row.sleeperId,
    position: row.position,
    games: row.games,
    passAtt: row.passAtt,
    passCmp: row.passCmp,
    passYds: row.passYds,
    passTd: row.passTd,
    passInt: row.passInt,
    passSacks: row.passSacks,
    rushAtt: row.rushAtt,
    rushYds: row.rushYds,
    rushTd: row.rushTd,
    targets: row.targets,
    receptions: row.receptions,
    recYds: row.recYds,
    recTd: row.recTd,
  };
}

export function buildDraftPlayerValueData(
  row: JoinedProjectionRow,
  value: {
    replacementPoints: number | null;
    vor: number | null;
    projectionAuctionValue: number | null;
  },
  marketValue: ProjectionMarketValueOutput,
): DraftPlayerValueData {
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

export function buildStaleDraftPlayerValueDeleteWhere(
  draftId: number,
  projectionSourceId: number,
  joined: JoinedProjectionRow[],
): DraftPlayerValueDeleteWhere {
  const currentPlayerIds = joined.map((row) => row.playerId);
  if (currentPlayerIds.length === 0) {
    return { draftId, projectionSourceId };
  }
  return { draftId, projectionSourceId, playerId: { notIn: currentPlayerIds } };
}

function toVorPosition(position: string): VorPosition | null {
  if (position === 'QB' || position === 'RB' || position === 'WR' || position === 'TE') {
    return position;
  }
  return null;
}

function toStartingLineup(value: unknown): StartingSlot[] {
  if (!Array.isArray(value)) return [...DEFAULT_STARTING_LINEUP];
  const slots = value.filter(isStartingSlot);
  return slots.length > 0 ? slots : [...DEFAULT_STARTING_LINEUP];
}

function isStartingSlot(value: unknown): value is StartingSlot {
  return (
    value === 'QB' ||
    value === 'RB' ||
    value === 'WR' ||
    value === 'TE' ||
    value === 'FLEX' ||
    value === 'SUPER_FLEX'
  );
}

function toScoringSettings(value: unknown): ScoringSettings {
  if (value === null || typeof value !== 'object') return { ...DEFAULT_SCORING_SETTINGS };
  return { ...DEFAULT_SCORING_SETTINGS, ...(value as Partial<ScoringSettings>) };
}

function toTargetRoster(value: unknown): Partial<Record<Position, number>> {
  if (value === null || typeof value !== 'object') return DEFAULT_TARGET_ROSTER;
  return value as Partial<Record<Position, number>>;
}

function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
pnpm test projectionApplication
```

Expected: all tests in `projectionApplication.test.ts` pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/projectionApplication.ts src/__tests__/projectionApplication.test.ts
git commit -m "feat: add draft projection application service"
```

---

### Task 2: Refactor CLI script around import/apply split

**Files:**

- Modify: `prisma/apply-projection-values.ts`
- Modify: `src/__tests__/projectionApply.test.ts`

- [ ] **Step 1: Write failing import helper test**

In `src/__tests__/projectionApply.test.ts`, add:

```ts
import { importProjectionRows } from '../../prisma/apply-projection-values';

it('imports projection rows into source and player projection tables', async () => {
  const projectionSourceFindFirst = jest.fn().mockResolvedValue(null);
  const projectionSourceCreate = jest.fn().mockResolvedValue({ id: 7 });
  const playerProjectionUpsert = jest.fn().mockResolvedValue({});
  const transaction = jest.fn().mockImplementation(async (operations) => Promise.all(operations));
  const prisma = {
    projectionSource: {
      findFirst: projectionSourceFindFirst,
      create: projectionSourceCreate,
    },
    playerProjection: {
      upsert: playerProjectionUpsert,
    },
    $transaction: transaction,
  };
  const projectionDate = new Date('2026-06-01T00:00:00.000Z');

  const result = await importProjectionRows(prisma, [
    projectionRow({
      sleeperId: '10',
      position: 'QB',
      projectedPoints: 300,
      baselineProjectedPoints: 280,
      projectionSource: 'mike_clay',
      projectionDate,
      projectionSeason: 2026,
    }),
  ]);

  expect(result).toEqual([{ projectionSourceId: 7, importedCount: 1 }]);
  expect(projectionSourceCreate).toHaveBeenCalledWith({
    data: { name: 'mike_clay', season: 2026, projectionDate },
  });
  expect(playerProjectionUpsert).toHaveBeenCalledWith(
    expect.objectContaining({
      where: {
        sleeperId_projectionSourceId: {
          sleeperId: '10',
          projectionSourceId: 7,
        },
      },
    }),
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm test projectionApply
```

Expected: fail because `importProjectionRows` is not exported.

- [ ] **Step 3: Move shared helpers and implement import helper**

Modify `prisma/apply-projection-values.ts`:

- import `applyProjectionValuesToDraft`, `buildDraftPlayerValueData`,
  `buildStaleDraftPlayerValueDeleteWhere`, `getSleeperIdUpdates`, and
  `resolvePlayerSleeperIds` from `@/lib/projectionApplication`;
- remove duplicate local implementations of the moved helpers;
- add:

```ts
interface ProjectionImportPrisma {
  projectionSource: {
    findFirst(args: {
      where: { name: string; season: number; projectionDate: Date | null };
    }): Promise<{ id: number } | null>;
    create(args: {
      data: { name: string; season: number; projectionDate: Date | null };
    }): Promise<{ id: number }>;
  };
  playerProjection: {
    upsert(args: {
      where: {
        sleeperId_projectionSourceId: {
          sleeperId: string;
          projectionSourceId: number;
        };
      };
      create: ReturnType<typeof playerProjectionData>;
      update: ReturnType<typeof playerProjectionData>;
    }): unknown;
  };
  $transaction(operations: unknown[], options?: { timeout: number }): Promise<unknown[]>;
}

export interface ProjectionImportResult {
  projectionSourceId: number;
  importedCount: number;
}

export async function importProjectionRows(
  prisma: ProjectionImportPrisma,
  rows: CsvProjectionRow[],
): Promise<ProjectionImportResult[]> {
  const projectionGroups = groupProjectionRowsBySource(rows);
  const results: ProjectionImportResult[] = [];

  for (const group of projectionGroups) {
    const source =
      (await prisma.projectionSource.findFirst({
        where: {
          name: group.source.name,
          season: group.source.season,
          projectionDate: group.source.projectionDate,
        },
      })) ??
      (await prisma.projectionSource.create({
        data: {
          name: group.source.name,
          season: group.source.season,
          projectionDate: group.source.projectionDate,
        },
      }));

    for (const batch of chunk(group.rows, WRITE_BATCH_SIZE)) {
      await prisma.$transaction(
        batch.map((projection) =>
          prisma.playerProjection.upsert({
            where: {
              sleeperId_projectionSourceId: {
                sleeperId: projection.sleeperId,
                projectionSourceId: source.id,
              },
            },
            create: playerProjectionData(projection, source.id),
            update: playerProjectionData(projection, source.id),
          }),
        ),
        { timeout: WRITE_TRANSACTION_TIMEOUT_MS },
      );
    }

    results.push({ projectionSourceId: source.id, importedCount: group.rows.length });
  }

  return results;
}
```

Then simplify `main()` so it:

```ts
const scoringSettings = toScoringSettings(draft.scoringSettings);
const etrMatches = new Map(
  readEtrMatchRows(args.etrMatchesCsv).map((row) => [row.name, row.sleeperId]),
);
const projectionRows = readProjectionRows(args.projectionsCsv, scoringSettings);
const importResults = await importProjectionRows(prisma, projectionRows);
const latestImportedSourceId = importResults.at(-1)?.projectionSourceId;
const applyResult = await applyProjectionValuesToDraft(prisma, {
  draftId: draft.id,
  projectionSourceId: latestImportedSourceId,
  etrMatches,
});

console.log(`Applied projection values to ${applyResult.appliedCount} player-source row(s).`);
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
pnpm test projectionApply projectionApplication
```

Expected: both suites pass.

- [ ] **Step 5: Commit**

```bash
git add prisma/apply-projection-values.ts src/__tests__/projectionApply.test.ts
git commit -m "refactor: split projection import and draft application"
```

---

### Task 3: Wire draft creation to automatic projection application

**Files:**

- Modify: `src/lib/actions.ts`
- Modify: `src/__tests__/createDraft.test.ts`

- [ ] **Step 1: Write failing tests**

In `src/__tests__/createDraft.test.ts`, add:

```ts
const mockApplyProjectionValuesToDraft = jest.fn();

jest.mock('@/lib/projectionApplication', () => ({
  applyProjectionValuesToDraft: (...args: unknown[]) => mockApplyProjectionValuesToDraft(...args),
}));
```

In `beforeEach`, add:

```ts
mockApplyProjectionValuesToDraft.mockResolvedValue({ projectionSourceId: 7, appliedCount: 250 });
```

Add tests:

```ts
it('applies stored projections to the new draft before redirecting', async () => {
  await createDraft(VALID_INPUT);

  expect(mockApplyProjectionValuesToDraft).toHaveBeenCalledWith(
    expect.objectContaining({ $transaction: mockTransaction }),
    { draftId: 5 },
  );
  expect(mockRedirect).toHaveBeenCalledWith('/draft/5');
});

it('fails loudly when automatic projection application fails', async () => {
  mockApplyProjectionValuesToDraft.mockRejectedValue(new Error('No projection source found'));

  await expect(createDraft(VALID_INPUT)).rejects.toThrow('No projection source found');
  expect(mockRedirect).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm test createDraft
```

Expected: fail because `createDraft` does not call `applyProjectionValuesToDraft`.

- [ ] **Step 3: Implement `createDraft` wiring**

Modify `src/lib/actions.ts`:

```ts
import { applyProjectionValuesToDraft } from '@/lib/projectionApplication';
```

After the transaction returns `draftId` and before `redirect`:

```ts
await applyProjectionValuesToDraft(prisma, { draftId });
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
pnpm test createDraft
```

Expected: all create draft tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/actions.ts src/__tests__/createDraft.test.ts
git commit -m "feat: apply projections during draft creation"
```

---

### Task 4: Update documentation for automatic behavior

**Files:**

- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `ROADMAP.md`

- [ ] **Step 1: Update README**

In `README.md`, replace the manual projection section with:

````md
Projection data must be imported into Postgres before creating drafts. New drafts automatically
apply the latest stored projection source after fallback player values are seeded. Draft creation
fails loudly if no usable projection source exists.

To refresh/import projection data manually:

```bash
pnpm tsx prisma/apply-projection-values.ts --draft-id <existing-draft-id>
```
````

That command imports the generated projection CSV into Postgres and reapplies values to the given
draft.

````

- [ ] **Step 2: Update AGENTS**

In `AGENTS.md`, replace the projection-shaped active values bullets that say projection values are
manual with:

```md
- Projection source data lives in `ProjectionSource` and `PlayerProjection`.
- `createDraft` automatically calls `applyProjectionValuesToDraft(prisma, { draftId })` after
  adjusted fallback players are seeded.
- Draft creation fails loudly if no usable projection source exists.
- The CLI `pnpm tsx prisma/apply-projection-values.ts --draft-id <draft-id>` remains available to
  import generated CSV data into Postgres and reapply values to an existing draft.
````

- [ ] **Step 3: Update ROADMAP**

In `ROADMAP.md`, update #5e Current process / Next steps so it says automatic draft creation is done
and the remaining operational need is importing projection sources before creating drafts.

- [ ] **Step 4: Commit docs**

```bash
git add README.md AGENTS.md ROADMAP.md
git commit -m "docs: document automatic projection application"
```

---

### Task 5: Full verification

**Files:**

- No code edits expected.

- [ ] **Step 1: Run targeted tests**

Run:

```bash
pnpm test projectionApplication projectionApply createDraft playerValueMapping
```

Expected: all targeted tests pass.

- [ ] **Step 2: Run full test suite**

Run:

```bash
pnpm test
```

Expected: all Jest tests pass.

- [ ] **Step 3: Run typecheck**

Run:

```bash
pnpm tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 4: Run lint**

Run:

```bash
pnpm lint
```

Expected: exit 0.

- [ ] **Step 5: Push branch**

Run:

```bash
git status --short --branch
git push
```

Expected: branch is clean and pushed to `origin/projection-aware-values`.
