# HARD-005 Same-Draft Relationships Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make PostgreSQL reject every cross-draft owner-team, bid-team, and player-backed
relationship while safely upgrading existing production-compatible rows to required player IDs.

**Architecture:** `Team(id, draftId)` and `Player(id, draftId)` become candidate keys referenced by
compound foreign keys from every redundant draft-scoped relationship. A guarded transactional
migration audits, uniquely backfills legacy name-only rows, aborts on unsafe data, replaces scalar
foreign keys, and adds only missing draft-leading indexes. Existing application checks stay in
place while shared types stop modeling impossible null player identities.

**Tech Stack:** Prisma 7.8, PostgreSQL/Neon, TypeScript 5 strict mode, Jest 30, `pg`, pnpm 11.

## Global Constraints

- Preserve direct child-to-`Draft` foreign keys and application same-draft/ownership checks.
- Make `AuctionResult.playerId`, `PlayerWatchlist.playerId`, and `NominatedPlayer.playerId`
  required.
- Use compound foreign keys with `ON DELETE RESTRICT` and `ON UPDATE RESTRICT`; draft membership
  must never move through an implicit cascade.
- Keep `AuctionResult.player` and `playerName` columns as display/history snapshots only.
- Do not guess unmatched or ambiguous legacy player identities.
- Preflight failures report only the relationship, violation class, and aggregate count.
- Do not apply the migration to production during development.
- Test constraint behavior and migration rollback against real local PostgreSQL.
- Use single quotes, trailing commas, two-space indentation, 100-character Prettier width, and no
  explicit `any`.
- Add a failing test before changing database behavior.

---

## File Map

### New files

- `prisma/migrations/20260718180000_same_draft_relationships/migration.sql` — guarded backfill,
  candidate keys, compound foreign keys, and missing draft-leading indexes.
- `src/__tests__/integration/sameDraftRelationships.postgres.test.ts` — direct database acceptance
  tests for all six compound relationships and restricted deletion.
- `src/__tests__/integration/sameDraftMigration.postgres.test.ts` — actual migration success,
  preflight failure, and rollback tests against the immediately preceding schema.

### Modified files

- `prisma/schema.prisma` — required player IDs, compound relation definitions, candidate keys, and
  watchlist/nomination draft indexes.
- `scripts/testDatabase.ts` — isolated-schema migration-test helper that replays migrations only
  through a named boundary.
- `src/types/index.ts` — required player IDs on persisted bid/roster domain types.
- `src/lib/computeDraftTeamStats.ts` — required result player IDs and ID-only lookup.
- `src/lib/liveNomination.ts` — required nomination IDs and ID-only position lookup.
- `src/app/draft/[draftId]/page.tsx` — map guaranteed nomination IDs directly.
- `src/app/draft/[draftId]/budget/page.tsx` — call ID-only live-nomination resolution.
- `src/app/api/draft/[draftId]/nomination-data/route.ts` — map guaranteed watchlist and nomination
  IDs directly.
- `src/__tests__/fixtures/draftTeamStats.ts` — replace the legacy null-ID fixture with its stable
  player ID.
- `src/__tests__/computeDraftTeamStats.test.ts` — retain unknown-ID behavior without null fallback.
- `src/__tests__/liveNomination.test.ts` — use stable player IDs and an ID position map.
- `docs/draftops-audit-workstreams.md` — record the verified HARD-005 implementation checkpoint.

---

### Task 1: Guarded migration and database constraints

**Files:**

- Create: `src/__tests__/integration/sameDraftRelationships.postgres.test.ts`
- Create: `src/__tests__/integration/sameDraftMigration.postgres.test.ts`
- Create: `prisma/migrations/20260718180000_same_draft_relationships/migration.sql`
- Modify: `scripts/testDatabase.ts`
- Modify: `prisma/schema.prisma`

**Interfaces:**

- Produces
  `createIsolatedMigrationSchema(beforeMigration: string): Promise<MigrationTestSchema>` for tests.
- `MigrationTestSchema.client` is a connected `pg.Client` whose `search_path` selects the isolated
  schema.
- `MigrationTestSchema.applyMigration(migrationName: string): Promise<void>` executes that
  migration's actual SQL.
- `MigrationTestSchema.dispose(): Promise<void>` restores `public`, drops the isolated schema, and
  closes the client even after a failed transaction.
- Produces PostgreSQL candidate keys `Team_id_draftId_key` and `Player_id_draftId_key`.
- Produces six compound foreign keys whose referencing columns include the owning draft ID.

- [ ] **Step 1: Add direct cross-draft tests before changing the schema**

Create `src/__tests__/integration/sameDraftRelationships.postgres.test.ts`. Build two drafts with
one team and one player each, plus a projection source when constructing `DraftPlayerValue`. Add
one test per invalid relationship:

```ts
await expect(
  prisma.draft.update({
    where: { id: first.draftId },
    data: { ownerTeamId: second.teamId },
  }),
).rejects.toMatchObject({ code: 'P2003' });

await expect(
  prisma.auctionResult.create({
    data: bidData({ draftId: first.draftId, teamId: second.teamId, playerId: first.playerId }),
  }),
).rejects.toMatchObject({ code: 'P2003' });

await expect(
  prisma.auctionResult.create({
    data: bidData({ draftId: first.draftId, teamId: first.teamId, playerId: second.playerId }),
  }),
).rejects.toMatchObject({ code: 'P2003' });

await expect(
  prisma.playerWatchlist.create({
    data: { draftId: first.draftId, playerId: second.playerId, playerName: second.playerName },
  }),
).rejects.toMatchObject({ code: 'P2003' });

await expect(
  prisma.nominatedPlayer.create({
    data: { draftId: first.draftId, playerId: second.playerId, playerName: second.playerName },
  }),
).rejects.toMatchObject({ code: 'P2003' });

await expect(
  prisma.draftPlayerValue.create({
    data: {
      draftId: first.draftId,
      playerId: second.playerId,
      projectionSourceId,
      fallbackAuctionValue: 10,
      activeAuctionValue: 10,
    },
  }),
).rejects.toMatchObject({ code: 'P2003' });
```

Also add a valid same-draft write test and tests proving referenced teams and players cannot be
deleted. Cleanup must clear child rows, set `ownerTeamId` to null, and then delete players, teams,
drafts, and the projection source.

- [ ] **Step 2: Run the constraint tests and observe the missing behavior**

Run:

```bash
pnpm test:integration --runTestsByPath \
  src/__tests__/integration/sameDraftRelationships.postgres.test.ts
```

Expected: FAIL because existing scalar foreign keys allow at least the cross-draft owner/team/player
writes to persist.

- [ ] **Step 3: Add an isolated prior-schema migration harness**

Extend `scripts/testDatabase.ts` without weakening its loopback and `_test` safety checks:

```ts
export interface MigrationTestSchema {
  client: Client;
  schemaName: string;
  applyMigration: (migrationName: string) => Promise<void>;
  dispose: () => Promise<void>;
}

export async function createIsolatedMigrationSchema(
  beforeMigration: string,
): Promise<MigrationTestSchema> {
  const databaseUrl = configureTestDatabaseUrl();
  const schemaName = `migration_${process.pid}_${crypto.randomUUID().replaceAll('-', '')}`;
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  await client.query(`CREATE SCHEMA "${schemaName}"`);
  await client.query(`SET search_path TO "${schemaName}"`);

  for (const directory of listMigrationDirectories()) {
    if (directory.localeCompare(beforeMigration) >= 0) break;
    await client.query(readMigration(directory));
  }

  return {
    client,
    schemaName,
    applyMigration: async (migrationName) => {
      await client.query(readMigration(migrationName));
    },
    dispose: async () => {
      await client.query('ROLLBACK');
      await client.query('SET search_path TO public');
      await client.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      await client.end();
    },
  };
}
```

Extract the existing sorted migration-directory and migration-file reads into private
`listMigrationDirectories()` and `readMigration()` helpers so global setup and isolated migration
tests replay the same files.

- [ ] **Step 4: Add migration success and rollback tests**

Create `src/__tests__/integration/sameDraftMigration.postgres.test.ts` using
`createIsolatedMigrationSchema('20260718180000_same_draft_relationships')`. Seed rows through raw
parameterized SQL so the test exercises the old nullable/scalar-FK schema.

Cover these exact cases:

```ts
it('backfills a unique same-draft player match and applies every constraint', async () => {
  await seedNullBid({ bidName: 'Unique Player', matchingPlayers: ['Unique Player'] });
  await schema.applyMigration(MIGRATION_NAME);

  const result = await schema.client.query(
    'SELECT "playerId" FROM "AuctionResult" WHERE player = $1',
    ['Unique Player'],
  );
  expect(result.rows[0].playerId).toBe(expect.any(Number));
  await expectNullability(schema.client, 'AuctionResult', 'playerId', 'NO');
  await expectCompoundForeignKeys(schema.client);
});

it.each([
  ['unmatched', [], 'AuctionResult.playerId null reference has no same-draft player match'],
  ['ambiguous', ['Duplicate', 'Duplicate'], 'AuctionResult.playerId null reference is ambiguous'],
])('aborts and rolls back an %s null identity', async (_label, players, message) => {
  await seedNullBid({ bidName: 'Duplicate', matchingPlayers: players });
  await expect(schema.applyMigration(MIGRATION_NAME)).rejects.toThrow(message);
  await expectNullability(schema.client, 'AuctionResult', 'playerId', 'YES');
});

it('aborts and rolls back a cross-draft team relationship', async () => {
  await seedCrossDraftBidTeam();
  await expect(schema.applyMigration(MIGRATION_NAME)).rejects.toThrow(
    'AuctionResult.teamId references a team from another draft',
  );
  await expectConstraintAbsent(schema.client, 'AuctionResult_teamId_draftId_fkey');
});

it('aborts when a name backfill would duplicate an existing player identity', async () => {
  await seedBackfillCollision();
  await expect(schema.applyMigration(MIGRATION_NAME)).rejects.toThrow(
    'AuctionResult.playerId backfill would create a duplicate player claim',
  );
  await expectNullability(schema.client, 'AuctionResult', 'playerId', 'YES');
});
```

The ambiguous fixture uses two `Player` rows with the same name in one draft, which the current
schema permits. `afterEach` must call `dispose()` even when migration SQL leaves a failed
transaction.

- [ ] **Step 5: Run the migration tests and observe the missing migration**

Run:

```bash
pnpm test:integration --runTestsByPath \
  src/__tests__/integration/sameDraftMigration.postgres.test.ts
```

Expected: FAIL because `20260718180000_same_draft_relationships/migration.sql` does not exist.

- [ ] **Step 6: Model the compound relationships in Prisma**

Modify `prisma/schema.prisma`:

```prisma
model Draft {
  // existing fields
  ownerTeam Team? @relation(
    "DraftOwnerTeam",
    fields: [ownerTeamId, id],
    references: [id, draftId],
    onDelete: Restrict,
    onUpdate: Restrict
  )
}

model Team {
  // existing fields and indexes
  @@unique([id, draftId])
}

model AuctionResult {
  playerId  Int
  playerRow Player @relation(
    fields: [playerId, draftId],
    references: [id, draftId],
    onDelete: Restrict,
    onUpdate: Restrict
  )
  team Team @relation(
    fields: [teamId, draftId],
    references: [id, draftId],
    onDelete: Restrict,
    onUpdate: Restrict
  )
}

model PlayerWatchlist {
  playerId Int
  player Player @relation(
    fields: [playerId, draftId],
    references: [id, draftId],
    onDelete: Restrict,
    onUpdate: Restrict
  )
  @@index([draftId])
}

model NominatedPlayer {
  playerId Int
  player Player @relation(
    fields: [playerId, draftId],
    references: [id, draftId],
    onDelete: Restrict,
    onUpdate: Restrict
  )
  @@index([draftId])
}

model Player {
  // existing fields and indexes
  @@unique([id, draftId])
}

model DraftPlayerValue {
  player Player @relation(
    fields: [playerId, draftId],
    references: [id, draftId],
    onDelete: Restrict,
    onUpdate: Restrict
  )
}
```

Retain each child's direct `draft` relation and all existing uniqueness constraints.

- [ ] **Step 7: Implement the guarded transactional migration**

Create `prisma/migrations/20260718180000_same_draft_relationships/migration.sql` with explicit
`BEGIN;` and `COMMIT;`. Before any DDL, use `DO $$ ... $$` blocks to count and raise distinct
exceptions for:

- Cross-draft `Draft.ownerTeamId`.
- Cross-draft `AuctionResult.teamId`.
- Cross-draft non-null player IDs in `AuctionResult`, `PlayerWatchlist`, `NominatedPlayer`, and
  `DraftPlayerValue`.
- Null player IDs with zero or multiple same-draft name matches in bids, watchlists, and
  nominations.
- Unique backfill candidates that would collide with an existing `(draftId, playerId)` child row.

Backfill only unique matches:

```sql
UPDATE "AuctionResult" ar
SET "playerId" = matches.id
FROM (
  SELECT ar2.id AS child_id, min(p.id) AS id
  FROM "AuctionResult" ar2
  JOIN "Player" p
    ON p."draftId" = ar2."draftId"
   AND p.name = ar2.player
  WHERE ar2."playerId" IS NULL
  GROUP BY ar2.id
  HAVING count(p.id) = 1
) matches
WHERE ar.id = matches.child_id;
```

Repeat the pattern with `PlayerWatchlist.playerName` and `NominatedPlayer.playerName`. Re-audit for
all null or cross-draft rows, then execute the DDL:

```sql
ALTER TABLE "AuctionResult" ALTER COLUMN "playerId" SET NOT NULL;
ALTER TABLE "PlayerWatchlist" ALTER COLUMN "playerId" SET NOT NULL;
ALTER TABLE "NominatedPlayer" ALTER COLUMN "playerId" SET NOT NULL;

CREATE UNIQUE INDEX "Team_id_draftId_key" ON "Team"(id, "draftId");
CREATE UNIQUE INDEX "Player_id_draftId_key" ON "Player"(id, "draftId");

ALTER TABLE "Draft" DROP CONSTRAINT "Draft_ownerTeamId_fkey";
ALTER TABLE "AuctionResult" DROP CONSTRAINT "AuctionResult_teamId_fkey";
ALTER TABLE "AuctionResult" DROP CONSTRAINT "AuctionResult_playerId_fkey";
ALTER TABLE "PlayerWatchlist" DROP CONSTRAINT "PlayerWatchlist_playerId_fkey";
ALTER TABLE "NominatedPlayer" DROP CONSTRAINT "NominatedPlayer_playerId_fkey";
ALTER TABLE "DraftPlayerValue" DROP CONSTRAINT "DraftPlayerValue_playerId_fkey";
```

Add the six new compound constraints as `NOT VALID`, each with `ON DELETE RESTRICT ON UPDATE
RESTRICT`:

```sql
ALTER TABLE "Draft"
  ADD CONSTRAINT "Draft_ownerTeamId_id_fkey"
  FOREIGN KEY ("ownerTeamId", id) REFERENCES "Team"(id, "draftId")
  ON DELETE RESTRICT ON UPDATE RESTRICT NOT VALID;
ALTER TABLE "AuctionResult"
  ADD CONSTRAINT "AuctionResult_teamId_draftId_fkey"
  FOREIGN KEY ("teamId", "draftId") REFERENCES "Team"(id, "draftId")
  ON DELETE RESTRICT ON UPDATE RESTRICT NOT VALID;
ALTER TABLE "AuctionResult"
  ADD CONSTRAINT "AuctionResult_playerId_draftId_fkey"
  FOREIGN KEY ("playerId", "draftId") REFERENCES "Player"(id, "draftId")
  ON DELETE RESTRICT ON UPDATE RESTRICT NOT VALID;
ALTER TABLE "PlayerWatchlist"
  ADD CONSTRAINT "PlayerWatchlist_playerId_draftId_fkey"
  FOREIGN KEY ("playerId", "draftId") REFERENCES "Player"(id, "draftId")
  ON DELETE RESTRICT ON UPDATE RESTRICT NOT VALID;
ALTER TABLE "NominatedPlayer"
  ADD CONSTRAINT "NominatedPlayer_playerId_draftId_fkey"
  FOREIGN KEY ("playerId", "draftId") REFERENCES "Player"(id, "draftId")
  ON DELETE RESTRICT ON UPDATE RESTRICT NOT VALID;
ALTER TABLE "DraftPlayerValue"
  ADD CONSTRAINT "DraftPlayerValue_playerId_draftId_fkey"
  FOREIGN KEY ("playerId", "draftId") REFERENCES "Player"(id, "draftId")
  ON DELETE RESTRICT ON UPDATE RESTRICT NOT VALID;

ALTER TABLE "Draft" VALIDATE CONSTRAINT "Draft_ownerTeamId_id_fkey";
ALTER TABLE "AuctionResult" VALIDATE CONSTRAINT "AuctionResult_teamId_draftId_fkey";
ALTER TABLE "AuctionResult" VALIDATE CONSTRAINT "AuctionResult_playerId_draftId_fkey";
ALTER TABLE "PlayerWatchlist"
  VALIDATE CONSTRAINT "PlayerWatchlist_playerId_draftId_fkey";
ALTER TABLE "NominatedPlayer"
  VALIDATE CONSTRAINT "NominatedPlayer_playerId_draftId_fkey";
ALTER TABLE "DraftPlayerValue"
  VALIDATE CONSTRAINT "DraftPlayerValue_playerId_draftId_fkey";
```

Then add:

```sql
CREATE INDEX "PlayerWatchlist_draftId_idx" ON "PlayerWatchlist"("draftId");
CREATE INDEX "NominatedPlayer_draftId_idx" ON "NominatedPlayer"("draftId");
```

- [ ] **Step 8: Generate Prisma Client and validate the schema**

Run:

```bash
pnpm prisma generate
pnpm prisma validate
```

Expected: both commands exit 0 and Prisma accepts overlapping compound relations.

- [ ] **Step 9: Run focused real-PostgreSQL tests**

Run:

```bash
pnpm test:integration --runTestsByPath \
  src/__tests__/integration/sameDraftRelationships.postgres.test.ts \
  src/__tests__/integration/sameDraftMigration.postgres.test.ts
```

Expected: PASS, including all six cross-draft rejection cases and every migration rollback case.

- [ ] **Step 10: Commit the database deliverable**

```bash
git add prisma/schema.prisma \
  prisma/migrations/20260718180000_same_draft_relationships/migration.sql \
  scripts/testDatabase.ts \
  src/__tests__/integration/sameDraftRelationships.postgres.test.ts \
  src/__tests__/integration/sameDraftMigration.postgres.test.ts
git commit -m "feat: enforce same-draft database relationships"
```

---

### Task 2: Required player identity through application code

**Files:**

- Modify: `src/types/index.ts`
- Modify: `src/lib/computeDraftTeamStats.ts`
- Modify: `src/lib/liveNomination.ts`
- Modify: `src/app/draft/[draftId]/page.tsx`
- Modify: `src/app/draft/[draftId]/budget/page.tsx`
- Modify: `src/app/api/draft/[draftId]/nomination-data/route.ts`
- Modify: `src/__tests__/fixtures/draftTeamStats.ts`
- Modify: `src/__tests__/computeDraftTeamStats.test.ts`
- Modify: `src/__tests__/liveNomination.test.ts`

**Interfaces:**

- `AuctionResultEntry.playerId`, `RosterEntry.playerId`, `ClaimedBid.playerId`, and
  `DraftTeamResultInput.playerId` become `number`.
- `resolveLiveNomination` consumes rows shaped as `{ playerId: number; playerName: string }` and a
  `ReadonlyMap<number, string>`; it no longer consumes `posByName`.
- `computeDraftTeamStats` resolves active values only through stable player IDs.

- [ ] **Step 1: Run typecheck immediately after Client generation**

Run:

```bash
pnpm tsc --noEmit
```

Expected: FAIL at nullable fixtures and code paths that still model `playerId` as optional or test it
for null.

- [ ] **Step 2: Make persisted domain IDs required**

In `src/types/index.ts`, change the three persisted result interfaces:

```ts
export interface AuctionResultEntry {
  id: number;
  playerId: number;
  // existing fields unchanged
}

export interface RosterEntry {
  id: number;
  playerId: number;
  // existing fields unchanged
}

export interface ClaimedBid {
  id: number;
  playerId: number;
  // existing fields unchanged
}
```

Do not make `Player.id` required because unpersisted source-ranking players legitimately have no
database ID.

- [ ] **Step 3: Remove team-stat name fallback**

In `src/lib/computeDraftTeamStats.ts`:

```ts
export interface DraftTeamResultInput {
  id: number;
  playerId: number;
  // existing fields unchanged
}

const playersById = new Map(
  players.flatMap((player) => (player.id === undefined ? [] : [[player.id, player] as const])),
);

for (const result of team.results) {
  const player = playersById.get(result.playerId);
  // existing result/delta/age calculations unchanged
}
```

Delete `playersByName`; unknown stable IDs must continue producing a null delta rather than falling
back to a same-named player.

- [ ] **Step 4: Make live nomination identity ID-only**

Change `src/lib/liveNomination.ts` to define and consume:

```ts
interface LiveNominationInput {
  playerId: number;
  playerName: string;
}

export function resolveLiveNomination(
  nominated: LiveNominationInput[],
  posByPlayerId: ReadonlyMap<number, string>,
): LiveNomination | null {
  // preserve count and recency logic
}

function resolveNominationPosition(
  nomination: LiveNominationInput,
  posByPlayerId: ReadonlyMap<number, string>,
): string | undefined {
  return posByPlayerId.get(nomination.playerId);
}
```

Update `src/app/draft/[draftId]/budget/page.tsx` to call
`resolveLiveNomination(nominated, posByPlayerId)` and remove the now-unused `posByName` map.

- [ ] **Step 5: Map guaranteed IDs directly in loaders**

Replace null-dropping `flatMap` calls:

```ts
nominatedPlayers={nominatedEntries.map((entry) => entry.playerId)}
```

and:

```ts
watchlist: watchlistEntries.map((entry) => entry.playerId),
nominated: nominatedEntries.map((entry) => entry.playerId),
```

Apply these in the value-sheet page and nomination-data route without changing response keys.

- [ ] **Step 6: Update focused fixtures and unit tests**

In `src/__tests__/fixtures/draftTeamStats.ts`, change the legacy WR result to `playerId: 12`. Keep
the unknown-ID calculator test (`playerId: 999`) and its null-delta expectation.

Rewrite `src/__tests__/liveNomination.test.ts` so every nomination has an ID:

```ts
const posByPlayerId = new Map<number, string>([
  [1, 'WR'],
  [2, 'WR'],
  [3, 'QB'],
  [4, 'RB'],
  [5, 'PKG'],
]);

const nom = (playerId: number, playerName: string) => ({ playerId, playerName });
```

Preserve the sole-position, non-appetite, demand-count, and recency-tiebreak assertions. Add an
unknown ID case to prove player name no longer acts as fallback identity.

- [ ] **Step 7: Run focused unit tests and typecheck**

Run:

```bash
pnpm test --runInBand \
  src/__tests__/computeDraftTeamStats.test.ts \
  src/__tests__/liveNomination.test.ts \
  src/__tests__/api/nomination-data.test.ts
pnpm tsc --noEmit
```

Expected: all focused tests pass and typecheck exits 0.

- [ ] **Step 8: Search for stale nullable persisted IDs**

Run:

```bash
rg -n 'playerId\?: number \| null|playerId === null|playerId: null' src \
  --glob '*.ts' --glob '*.tsx'
```

Expected: no persisted bid/watchlist/nomination domain path still treats `playerId` as nullable.
Projection helper inputs may retain unrelated optional shapes only when they do not represent these
persisted rows.

- [ ] **Step 9: Commit the application deliverable**

```bash
git add src/types/index.ts \
  src/lib/computeDraftTeamStats.ts \
  src/lib/liveNomination.ts \
  'src/app/draft/[draftId]/page.tsx' \
  'src/app/draft/[draftId]/budget/page.tsx' \
  'src/app/api/draft/[draftId]/nomination-data/route.ts' \
  src/__tests__/fixtures/draftTeamStats.ts \
  src/__tests__/computeDraftTeamStats.test.ts \
  src/__tests__/liveNomination.test.ts
git commit -m "refactor: require persisted player identity"
```

---

### Task 3: Index evidence, backlog checkpoint, and final verification

**Files:**

- Modify: `src/__tests__/integration/sameDraftRelationships.postgres.test.ts`
- Modify: `docs/draftops-audit-workstreams.md`

**Interfaces:**

- No new production interface.
- Verification documents the exact database constraints and indexes delivered by Tasks 1 and 2.

- [ ] **Step 1: Add catalog and query-plan assertions**

Extend the PostgreSQL constraint suite to query `pg_indexes` and assert that every common
draft-scoped table has at least one index whose first key is `draftId`. Add explicit expectations
for `PlayerWatchlist_draftId_idx` and `NominatedPlayer_draftId_idx`.

For representative watchlist and nomination lookups, run:

```sql
SET LOCAL enable_seqscan = off;
EXPLAIN (FORMAT JSON)
SELECT id FROM "PlayerWatchlist" WHERE "draftId" = $1;
```

and the equivalent nomination query inside a transaction. Assert the JSON plan contains an index
scan using the intended draft index. Roll back so the planner setting does not leak.

- [ ] **Step 2: Run the complete PostgreSQL integration suite**

Run:

```bash
pnpm test:integration
```

Expected: every real-database suite passes, including concurrency, backfill, migration rollback,
compound-FK, restricted-delete, and index-plan cases.

- [ ] **Step 3: Run the repository quality gate**

Run:

```bash
make check
```

Expected: TypeScript, ESLint, Prettier, and all Jest suites pass.

- [ ] **Step 4: Record the HARD-005 implementation checkpoint**

Update `docs/draftops-audit-workstreams.md`:

- Set HARD-005 to `READY FOR INTEGRATION` while it remains off `main`.
- Record the production audit date and zero cross-draft violations.
- Record that the guarded migration will uniquely backfill the audited null bid identity on
  deployment.
- Summarize the six compound foreign keys, required player IDs, migration guard behavior, and two
  new draft-leading indexes.
- Paste the exact `make check` and `pnpm test:integration` suite/test totals from Steps 2 and 3.

- [ ] **Step 5: Review the final diff for migration and scope safety**

Run:

```bash
git status --short
git diff --check
git diff main...HEAD --stat
git diff main...HEAD -- prisma/schema.prisma \
  prisma/migrations/20260718180000_same_draft_relationships/migration.sql
```

Expected: only HARD-005 schema, migration, tests, type cleanup, and approved documentation are
present; no generated client, environment file, credential, snapshot, or unrelated artifact is
tracked.

- [ ] **Step 6: Commit verification evidence**

```bash
git add src/__tests__/integration/sameDraftRelationships.postgres.test.ts \
  docs/draftops-audit-workstreams.md
git commit -m "docs: record HARD-005 verification"
```

- [ ] **Step 7: Invoke verification and review workflows**

Use `superpowers:verification-before-completion`, then `superpowers:requesting-code-review`. Address
only verified, in-scope findings and rerun the affected checks before declaring the branch ready.
