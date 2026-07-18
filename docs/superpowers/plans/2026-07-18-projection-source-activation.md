# Explicit Projection-Source Activation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Version every per-draft projection application and atomically activate only a validated,
complete value set.

**Architecture:** `DraftProjectionValueSet` is the durable application/audit record and
`Draft.activeProjectionValueSetId` is the sole activation pointer. Projection application stages
immutable rows under a fresh set, validates the persisted candidate, and flips the pointer in a
short advisory-locked transaction; readers query only the pointed-to set.

**Tech Stack:** Next.js 16, TypeScript 5 strict mode, Prisma 7, PostgreSQL advisory locks, Jest,
real-PostgreSQL integration tests.

## Global Constraints

- Add a failing test before every behavior change.
- Use the existing per-draft PostgreSQL advisory-lock namespace for activation.
- Preserve all existing values during migration and preserve the pre-migration active selection.
- Keep activation metadata indefinitely.
- Keep full rows for the active set plus three prior activated sets per draft.
- Delete partial failed-set rows immediately; retention cleanup is best-effort after activation.
- Players missing from the active set continue to use `Player.budget`.
- Do not add source-selection, rollback, or admin UI.
- Run real PostgreSQL tests for failure isolation and concurrency; mocked Prisma tests are not
  sufficient.

---

## File Structure

- `prisma/schema.prisma`: value-set enum/model, active pointer, compound relations, and indexes.
- `prisma/migrations/20260718200000_explicit_projection_activation/migration.sql`: additive schema,
  data backfill, pointer selection, constraints, and partial active-set uniqueness.
- `src/lib/draftLock.ts`: shared per-draft advisory-lock primitive used by draft mutations and
  projection activation.
- `src/lib/projectionValueSet.ts`: failure type, candidate validation, activation, failed-run
  recording, and retention pruning.
- `src/lib/projectionApplication.ts`: calculation orchestration and immutable staged persistence.
- `src/lib/activeDraftPlayers.ts`: active-pointer lookup and active-set-only value query.
- `src/lib/playerValueMapping.ts`: maps already-selected values without timestamp/source inference.
- `prisma/apply-projection-values.ts`: reports activation metadata from the application result.
- `src/lib/budgetValueBackfill.ts`: snapshots active/value-set metadata and aggregates the newly
  activated set.
- `src/__tests__/projectionValueSet.test.ts`: focused lifecycle/retention unit tests.
- `src/__tests__/projectionApplication.test.ts`: staged-application unit tests.
- `src/__tests__/activeDraftPlayers.test.ts`: active-only query tests.
- `src/__tests__/playerValueMapping.test.ts`: mapping tests without active-source inference.
- `src/__tests__/projectionApply.test.ts`: CLI workflow result tests.
- `src/__tests__/budgetValueBackfill.test.ts`: backfill snapshot and new-set aggregation tests.
- `src/__tests__/integration/projectionActivation.postgres.test.ts`: batch failure, same-source
  reapplication, concurrent activation, retention, and compound-FK tests.
- `src/__tests__/integration/budgetValueBackfill.postgres.test.ts`: atomic fallback/value-set
  rollback coverage.
- `AGENTS.md`, `README.md`, `docs/draftops-audit-workstreams.md`: operational contract and verified
  completion evidence.

---

### Task 1: Add and backfill explicit value-set schema

**Files:**

- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260718200000_explicit_projection_activation/migration.sql`
- Create: `src/__tests__/integration/projectionActivation.postgres.test.ts`

**Interfaces:**

- Produces: Prisma models `DraftProjectionValueSet`, `DraftProjectionValueSetStatus`,
  `Draft.activeProjectionValueSetId`, and `DraftPlayerValue.valueSetId`.
- Produces: database uniqueness for `(valueSetId, playerId)`, cross-draft compound foreign keys,
  and at most one `ACTIVE` set per draft.

- [ ] **Step 1: Write a migration integration test for preserved active selection**

Create a fixture with one draft, one player, two sources, and two existing value rows whose
`updatedAt` values identify the newer source. Assert after migrations/reset that the draft pointer
references the newer group, both rows have value-set IDs, and the older set is `ARCHIVED`:

```ts
expect(draft.activeProjectionValueSetId).toBe(newerValue.valueSetId);
expect(newerValue.valueSet.status).toBe('ACTIVE');
expect(olderValue.valueSet.status).toBe('ARCHIVED');
expect(newerValue.valueSet.appliedPlayerCount).toBe(1);
```

Because the normal integration reset applies migrations before fixtures exist, implement this case
with a temporary schema/table fixture or execute the migration's backfill statements against a
legacy-shaped transaction fixture. Keep the test isolated and restore the public schema afterward.

- [ ] **Step 2: Run the migration test and verify it fails**

Run:

```bash
pnpm test:integration -- projectionActivation.postgres.test.ts
```

Expected: FAIL because the value-set model and active pointer do not exist.

- [ ] **Step 3: Add the Prisma schema shape**

Add:

```prisma
enum DraftProjectionValueSetStatus {
  STAGING
  ACTIVE
  ARCHIVED
  FAILED
}

model DraftProjectionValueSet {
  id                  Int                           @id @default(autoincrement())
  draftId             Int
  projectionSourceId  Int?
  status              DraftProjectionValueSetStatus @default(STAGING)
  expectedPlayerCount Int
  appliedPlayerCount  Int                           @default(0)
  createdAt           DateTime                      @default(now())
  activatedAt         DateTime?
  failedAt            DateTime?
  failureCode         String?
  failureMessage      String?

  draft            Draft              @relation("DraftProjectionValueSets", fields: [draftId], references: [id])
  projectionSource ProjectionSource?  @relation(fields: [projectionSourceId], references: [id])
  values           DraftPlayerValue[]
  activeForDraft   Draft?              @relation("ActiveDraftProjectionValueSet")

  @@unique([id, draftId])
  @@unique([id, draftId, projectionSourceId])
  @@index([draftId, activatedAt])
  @@index([projectionSourceId])
}
```

Add the pointer and collection to `Draft`, the value-set collection to `ProjectionSource`, and
`valueSetId` plus compound relations to `DraftPlayerValue`. Reuse HARD-005's existing
`Player(id, draftId)` compound identity and `DraftPlayerValue` player constraint.

- [ ] **Step 4: Write the SQL migration with safe backfill ordering**

The migration must:

1. Create the enum and value-set table.
2. Add nullable pointer/value-set columns.
3. Insert one set per `(draftId, projectionSourceId)`, including a null-source compatibility group.
4. Attach rows by null-safe source comparison using `IS NOT DISTINCT FROM`.
5. Rank groups per draft by `MAX(DraftPlayerValue.updatedAt) DESC, valueSet.id DESC`.
6. Mark rank 1 `ACTIVE`, mark the rest `ARCHIVED`, fill counts/timestamps, and update the pointer.
7. Make `DraftPlayerValue.valueSetId` required.
8. Replace the old uniqueness constraint with `(valueSetId, playerId)`.
9. Add compound draft/player, draft/set/source, and active-pointer foreign keys.
10. Add this PostgreSQL-only invariant:

```sql
CREATE UNIQUE INDEX "DraftProjectionValueSet_one_active_per_draft"
ON "DraftProjectionValueSet" ("draftId")
WHERE status = 'ACTIVE';
```

Use explicit constraint names and fail loudly if orphaned rows prevent the constraints.

- [ ] **Step 5: Generate Prisma client and validate schema**

Run:

```bash
pnpm prisma validate
pnpm prisma generate
pnpm tsc --noEmit
```

Expected: all three commands pass.

- [ ] **Step 6: Run the migration test**

Run:

```bash
pnpm test:integration -- projectionActivation.postgres.test.ts
```

Expected: PASS for migration preservation and compound-constraint cases.

- [ ] **Step 7: Commit the schema unit**

```bash
git add prisma/schema.prisma prisma/migrations/20260718200000_explicit_projection_activation/migration.sql src/__tests__/integration/projectionActivation.postgres.test.ts
git commit -m "feat: add versioned projection value sets"
```

---

### Task 2: Introduce shared locking and value-set lifecycle primitives

**Files:**

- Create: `src/lib/draftLock.ts`
- Modify: `src/lib/draftMutation.ts`
- Create: `src/lib/projectionValueSet.ts`
- Create: `src/__tests__/projectionValueSet.test.ts`
- Modify: `src/__tests__/draftMutation.test.ts`

**Interfaces:**

- Produces: `lockDraftForMutation(tx: Prisma.TransactionClient, draftId: number): Promise<void>`.
- Produces: `ProjectionApplicationFailure` with `ProjectionApplicationFailureCode`.
- Produces: `activateProjectionValueSet(tx, input): Promise<ActivatedProjectionValueSet>`.
- Produces: `markProjectionValueSetFailed(prisma, input): Promise<void>`.
- Produces: `pruneProjectionValueSetRows(prisma, draftId): Promise<void>`.

- [ ] **Step 1: Test the shared lock extraction**

Update the draft-mutation test to mock `lockDraftForMutation` and assert it runs before the owned
draft lookup. Add a direct test asserting the generated SQL contains `pg_advisory_xact_lock` and
the existing namespace `1_144_002_001`.

- [ ] **Step 2: Run the lock test and verify it fails**

```bash
pnpm test -- draftMutation.test.ts
```

Expected: FAIL because `src/lib/draftLock.ts` does not exist.

- [ ] **Step 3: Extract the lock without changing behavior**

Create:

```ts
import type { Prisma } from '@prisma/client';

const DRAFT_MUTATION_LOCK_NAMESPACE = 1_144_002_001;

export async function lockDraftForMutation(
  tx: Prisma.TransactionClient,
  draftId: number,
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${DRAFT_MUTATION_LOCK_NAMESPACE}, ${draftId})`;
}
```

Replace the private lock in `draftMutation.ts` with this shared function.

- [ ] **Step 4: Add failing lifecycle tests**

Test these exact behaviors with mocked Prisma delegates:

```ts
await expect(
  activateProjectionValueSet(tx, { draftId: 5, valueSetId: 11, projectionSourceId: 7 }),
).resolves.toMatchObject({ valueSetId: 11, projectionSourceId: 7, appliedCount: 2 });

expect(mockLockDraftForMutation).toHaveBeenCalledWith(tx, 5);
expect(mockArchiveUpdateMany).toHaveBeenCalledBefore(mockDraftPointerUpdate);
expect(mockActivateUpdate).toHaveBeenCalledBefore(mockDraftPointerUpdate);
```

Add rejection cases for non-`STAGING` status, draft/source mismatch, and persisted count mismatch.
Add retention input with five archived sets and assert only the two oldest sets' value rows are
deleted when the active set plus three newest archives are retained.

- [ ] **Step 5: Run lifecycle tests and verify they fail**

```bash
pnpm test -- projectionValueSet.test.ts
```

Expected: FAIL because the lifecycle module does not exist.

- [ ] **Step 6: Implement lifecycle types and activation**

Define:

```ts
export type ProjectionApplicationFailureCode =
  | 'NO_PROJECTION_SOURCE'
  | 'NO_JOINED_PLAYERS'
  | 'INVALID_CALCULATION'
  | 'PERSISTED_COUNT_MISMATCH'
  | 'ACTIVATION_CONFLICT'
  | 'PERSISTENCE_FAILURE';

export class ProjectionApplicationFailure extends Error {
  constructor(
    readonly code: ProjectionApplicationFailureCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ProjectionApplicationFailure';
  }
}

export interface ActivatedProjectionValueSet {
  valueSetId: number;
  projectionSourceId: number;
  appliedCount: number;
  activatedAt: Date;
}
```

`activateProjectionValueSet` must lock, reload the candidate and draft pointer, count persisted
rows, validate all IDs/counts, archive the previous active set, activate the candidate, and update
the pointer. Use conditional `updateMany({ where: { id, status: 'STAGING' } })` and require count 1
to detect activation conflicts.

- [ ] **Step 7: Implement failed-run cleanup and retention**

Set:

```ts
export const RETAINED_ARCHIVED_VALUE_SET_COUNT = 3;
```

`markProjectionValueSetFailed` deletes rows for the candidate then changes `STAGING` to `FAILED`
with code/message/time. `pruneProjectionValueSetRows` selects archived set IDs ordered by
`activatedAt DESC, id DESC`, drops the first three IDs, and deletes only `DraftPlayerValue` rows
for the remainder. It does not delete metadata records.

- [ ] **Step 8: Run focused tests**

```bash
pnpm test -- draftMutation.test.ts projectionValueSet.test.ts
pnpm tsc --noEmit
```

Expected: PASS.

- [ ] **Step 9: Commit lifecycle primitives**

```bash
git add src/lib/draftLock.ts src/lib/draftMutation.ts src/lib/projectionValueSet.ts src/__tests__/draftMutation.test.ts src/__tests__/projectionValueSet.test.ts
git commit -m "feat: add projection value set lifecycle"
```

---

### Task 3: Stage, validate, and atomically activate projection applications

**Files:**

- Modify: `src/lib/projectionApplication.ts`
- Modify: `src/__tests__/projectionApplication.test.ts`
- Modify: `src/lib/actions.ts`
- Modify: `src/__tests__/createDraft.test.ts`

**Interfaces:**

- Consumes: Task 2 lifecycle functions.
- Produces:

```ts
export interface ApplyProjectionValuesResult {
  valueSetId: number;
  projectionSourceId: number;
  appliedCount: number;
  activatedAt: Date;
}
```

- Produces explicit modes: root-client staged batching versus caller-owned transaction.

- [ ] **Step 1: Replace upsert expectations with immutable-set expectations**

Update `projectionApplication.test.ts` so a successful call must:

1. create a fresh `STAGING` set;
2. create rows with `valueSetId` rather than upsert by draft/player/source;
3. count/validate the candidate;
4. activate it;
5. return activation metadata; and
6. invoke retention only after activation.

Add a same-source test that calls application twice and expects two value-set creations with no
updates to the first set's rows.

- [ ] **Step 2: Add failure-path tests**

Add tests for:

- zero joined players raises `NO_JOINED_PLAYERS` before a set is created;
- `NaN` or infinite calculated fields raise `INVALID_CALCULATION`;
- a write rejection marks a root-client candidate failed and preserves the original cause;
- caller-owned transaction mode propagates without out-of-transaction failed-run cleanup;
- persisted count mismatch prevents activation.

- [ ] **Step 3: Run focused tests and verify failure**

```bash
pnpm test -- projectionApplication.test.ts createDraft.test.ts
```

Expected: FAIL on the old upsert/delete workflow and old result shape.

- [ ] **Step 4: Refactor calculation into a candidate builder**

Keep scoring/math behavior unchanged. Build a fully validated array before persistence:

```ts
interface ProjectionValueCandidateRow extends DraftPlayerValueData {
  draftId: number;
  playerId: number;
  projectionSourceId: number;
}

function assertFiniteCandidate(rows: ProjectionValueCandidateRow[]): void {
  for (const row of rows) {
    const numeric = [
      row.projectedPoints,
      row.replacementPoints,
      row.vor,
      row.projectionAuctionValue,
      row.fallbackAuctionValue,
      row.activeAuctionValue,
    ].filter((value): value is number => value !== null);
    if (numeric.some((value) => !Number.isFinite(value))) {
      throw new ProjectionApplicationFailure(
        'INVALID_CALCULATION',
        `Projection calculation produced an invalid value for player ${row.playerId}`,
      );
    }
  }
}
```

- [ ] **Step 5: Implement root-client staged application**

Create the set only after calculation validation. Persist `DraftPlayerValue.createMany` batches
under its ID. Call the Task 2 activation in `prisma.$transaction`, then run best-effort pruning.
On persistence/activation failure, call `markProjectionValueSetFailed` if the set remains staging
and rethrow a typed failure preserving `cause`.

- [ ] **Step 6: Implement caller-owned transaction application**

Replace the boolean `useBatchTransaction` ambiguity with a discriminated option:

```ts
type ApplyProjectionValuesOptions =
  | {
      draftId: number;
      projectionSourceId?: number;
      etrMatches?: Map<string, string>;
      mode?: 'staged';
    }
  | {
      draftId: number;
      projectionSourceId?: number;
      etrMatches?: Map<string, string>;
      mode: 'transaction';
    };
```

In transaction mode, create rows sequentially or in safe `createMany` batches through the passed
transaction delegate, validate counts, and activate without opening a nested transaction. Errors
propagate so the outer transaction rolls back.

- [ ] **Step 7: Update draft creation**

Change `createDraft` to call:

```ts
await applyProjectionValuesToDraft(tx, {
  draftId: draft.id,
  etrMatches,
  mode: 'transaction',
});
```

Update mocks and assertions for the new result/option shape. Draft creation must still fail and
roll back when projection application fails.

- [ ] **Step 8: Run focused tests**

```bash
pnpm test -- projectionApplication.test.ts createDraft.test.ts
pnpm tsc --noEmit
```

Expected: PASS with unchanged valuation fixtures.

- [ ] **Step 9: Commit staged application**

```bash
git add src/lib/projectionApplication.ts src/lib/actions.ts src/__tests__/projectionApplication.test.ts src/__tests__/createDraft.test.ts
git commit -m "feat: stage and activate projection values atomically"
```

---

### Task 4: Query only the explicit active value set

**Files:**

- Modify: `src/lib/activeDraftPlayers.ts`
- Modify: `src/lib/playerValueMapping.ts`
- Modify: `src/__tests__/activeDraftPlayers.test.ts`
- Modify: `src/__tests__/playerValueMapping.test.ts`
- Modify: `src/__tests__/activeDraftPlayerConsumers.test.ts`

**Interfaces:**

- Consumes: `Draft.activeProjectionValueSetId` from Task 1.
- Produces: active-only `DraftPlayerValue.findMany({ where: { valueSetId } })` query.
- Produces: `mapPlayersWithDraftValues(players, activeDraftValues)` with no timestamp inference.

- [ ] **Step 1: Add an active-only loader test**

Mock `draft.findUnique` to return `{ activeProjectionValueSetId: 11 }`. Assert:

```ts
expect(mockDraftPlayerValueFindMany).toHaveBeenCalledWith({
  where: { draftId: 5, valueSetId: 11 },
  select: expect.objectContaining({ playerId: true, activeAuctionValue: true }),
});
```

Assert there is no `orderBy: { updatedAt: 'desc' }`. Add a null-pointer case that does not query
value rows and maps every player through fallback values.

- [ ] **Step 2: Replace active-source inference test fixtures**

Delete the mapping test that chooses a source by newest row. Replace it with a test passing one
already-selected value row and a second player with no row, asserting active and fallback mappings
respectively.

- [ ] **Step 3: Run tests and verify failure**

```bash
pnpm test -- activeDraftPlayers.test.ts playerValueMapping.test.ts activeDraftPlayerConsumers.test.ts
```

Expected: FAIL because the loader still fetches all historical rows and the mapper still infers by
timestamp.

- [ ] **Step 4: Implement active-only loading**

Fetch players and the draft pointer concurrently. Query values only when the pointer is non-null.
Keep the `draftId` predicate alongside `valueSetId` as defense in depth. Remove `updatedAt` and
`projectionSourceId` from the selected mapping shape unless another consumer requires them.

- [ ] **Step 5: Simplify mapping**

Replace `selectActiveDraftValues` and `getActiveProjectionSourceId` with a direct map:

```ts
const valuesByPlayerId = new Map(draftValues.map((value) => [value.playerId, value]));
```

Retain existing ceiling/floor calculation and fallback semantics exactly.

- [ ] **Step 6: Run focused tests and typecheck**

```bash
pnpm test -- activeDraftPlayers.test.ts playerValueMapping.test.ts activeDraftPlayerConsumers.test.ts
pnpm tsc --noEmit
```

Expected: PASS.

- [ ] **Step 7: Commit active-only reads**

```bash
git add src/lib/activeDraftPlayers.ts src/lib/playerValueMapping.ts src/__tests__/activeDraftPlayers.test.ts src/__tests__/playerValueMapping.test.ts src/__tests__/activeDraftPlayerConsumers.test.ts
git commit -m "fix: load only explicitly active projection values"
```

---

### Task 5: Update CLI and budget backfill contracts

**Files:**

- Modify: `prisma/apply-projection-values.ts`
- Modify: `src/__tests__/projectionApply.test.ts`
- Modify: `src/lib/budgetValueBackfill.ts`
- Modify: `src/__tests__/budgetValueBackfill.test.ts`
- Modify: `prisma/backfill-budget-scaled-values.ts`

**Interfaces:**

- Consumes: Task 3 `ApplyProjectionValuesResult`.
- Produces CLI observability for set/source/count/time.
- Produces snapshots containing `activeProjectionValueSetId` and value-set records.

- [ ] **Step 1: Add CLI result tests**

Update workflow expectations to:

```ts
applyResult: {
  valueSetId: 13,
  projectionSourceId: 7,
  appliedCount: 267,
  activatedAt: new Date('2026-07-18T12:00:00.000Z'),
}
```

Extract a pure `formatProjectionApplyResult` helper and assert its output includes all four fields.

- [ ] **Step 2: Add budget snapshot and aggregate tests**

Extend typed fixtures with `activeProjectionValueSetId`, `projectionValueSets`, and value-row
`valueSetId`. Assert apply mode calls projections with `mode: 'transaction'` and aggregates by
`valueSetId: projectionResult.valueSetId`, never by source ID.

- [ ] **Step 3: Run focused tests and verify failure**

```bash
pnpm test -- projectionApply.test.ts budgetValueBackfill.test.ts
```

Expected: FAIL on old result, snapshot, and aggregate shapes.

- [ ] **Step 4: Implement CLI observability**

Return the new result unchanged from `runProjectionImportWorkflow`. Format success as a single
stable line containing value set, source, row count, and ISO activation time. Keep the import-only
path unchanged.

- [ ] **Step 5: Update budget backfill**

Select and snapshot:

- `Draft.activeProjectionValueSetId`;
- `Draft.projectionValueSets` with source/status/count/timestamps/failure fields; and
- every `DraftPlayerValue.valueSetId`.

Call application in transaction mode and aggregate the result using the returned `valueSetId`.
Do not prune within the outer backfill transaction; schedule safe pruning after its commit.

- [ ] **Step 6: Run focused tests**

```bash
pnpm test -- projectionApply.test.ts budgetValueBackfill.test.ts
pnpm tsc --noEmit
```

Expected: PASS.

- [ ] **Step 7: Commit operational integrations**

```bash
git add prisma/apply-projection-values.ts prisma/backfill-budget-scaled-values.ts src/lib/budgetValueBackfill.ts src/__tests__/projectionApply.test.ts src/__tests__/budgetValueBackfill.test.ts
git commit -m "feat: expose projection activation metadata"
```

---

### Task 6: Prove failure isolation and concurrency in PostgreSQL

**Files:**

- Modify: `src/__tests__/integration/projectionActivation.postgres.test.ts`
- Modify: `src/__tests__/integration/budgetValueBackfill.postgres.test.ts`

**Interfaces:**

- Exercises the real Prisma client, real transactions, triggers, advisory locks, and schema
  constraints from Tasks 1-5.

- [ ] **Step 1: Add a mid-batch failure test**

Seed an active set, then create more than the configured batch size of candidate rows. Install a
temporary PostgreSQL trigger that fails after at least one batch has committed. Assert application
rejects and:

```ts
expect(reloadedDraft.activeProjectionValueSetId).toBe(originalSetId);
expect(originalRows).toEqual(originalRowsBeforeFailure);
expect(failedSet.status).toBe('FAILED');
expect(failedSet.values).toHaveLength(0);
```

- [ ] **Step 2: Add same-source reapplication visibility test**

Apply source 7 twice with changed fallback inputs. Hold the second activation transaction after
staging and query through `getActiveDraftPlayers` from another connection. Assert it sees the
complete first set. Release activation and assert it sees the complete second set.

- [ ] **Step 3: Add concurrent activation test**

Stage two valid sets, start activation from separate clients, and use the advisory lock to
serialize them. Assert exactly one set is `ACTIVE`, the pointer references it, no partial rows are
mixed, and the other successful set is `ARCHIVED`.

- [ ] **Step 4: Add retention and foreign-key tests**

Create an active set plus five archived sets. Run pruning and assert rows remain only for active +
three newest archives while all six metadata records remain. Attempt cross-draft active pointer,
player/value, and set/value writes and expect PostgreSQL foreign-key violations.

- [ ] **Step 5: Extend budget rollback test**

Force projection-value persistence or activation to fail inside budget backfill. Assert fallback
`Player` fields, active pointer, set statuses, and active rows all match their pre-backfill values.

- [ ] **Step 6: Run the integration suite**

```bash
pnpm test:integration
```

Expected: all real-PostgreSQL suites pass with no leaked triggers, functions, fixtures, or value
sets.

- [ ] **Step 7: Commit integration evidence**

```bash
git add src/__tests__/integration/projectionActivation.postgres.test.ts src/__tests__/integration/budgetValueBackfill.postgres.test.ts
git commit -m "test: verify atomic projection activation in postgres"
```

---

### Task 7: Document, audit, and verify HARD-006

**Files:**

- Modify: `AGENTS.md`
- Modify: `README.md`
- Modify: `docs/draftops-audit-workstreams.md`

**Interfaces:**

- Produces the operational documentation and completion evidence for HARD-006.

- [ ] **Step 1: Update documentation**

Document:

- `Draft.activeProjectionValueSetId` as the sole active-value pointer;
- immutable staging and atomic activation;
- fallback behavior for unmatched players;
- CLI activation output;
- indefinite metadata audit history;
- active plus three archived full-row retention; and
- failed-set cleanup behavior.

Do not claim completion in the audit backlog yet.

- [ ] **Step 2: Run targeted suites**

```bash
pnpm test -- projectionValueSet.test.ts projectionApplication.test.ts activeDraftPlayers.test.ts playerValueMapping.test.ts projectionApply.test.ts budgetValueBackfill.test.ts
pnpm test:integration
```

Expected: all focused and PostgreSQL suites pass.

- [ ] **Step 3: Run the full quality gate**

```bash
make check
```

Expected: TypeScript, ESLint, Prettier, and all Jest suites pass.

- [ ] **Step 4: Review the diff for scope and generated artifacts**

```bash
git status --short
git diff --check main...HEAD
git diff --stat main...HEAD
```

Expected: only HARD-006 implementation, tests, migration, approved spec/plan, and documentation are
present; no snapshots, coverage, scratch files, or unrelated changes.

- [ ] **Step 5: Mark HARD-006 complete in the audit document**

Record the implementation checkpoint, exact test counts, integration cases, and final commit/PR
reference available at that time. Change status only after every required verification above is
green.

- [ ] **Step 6: Commit documentation and completion evidence**

```bash
git add AGENTS.md README.md docs/draftops-audit-workstreams.md
git commit -m "docs: record explicit projection activation"
```

- [ ] **Step 7: Invoke verification-before-completion**

Use `superpowers:verification-before-completion`, re-run any command required by that checklist,
and report exact suite/test counts rather than claiming success from earlier output.
