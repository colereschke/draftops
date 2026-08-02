# HARD-022 Projection Application Decomposition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split projection application preparation and persistence into focused modules without changing calculations, durable side effects, transaction behavior, or public imports.

**Architecture:** Keep `applyProjectionValuesToDraft` in a thin compatibility facade. Move shared Prisma/data contracts to one types module, projection scoring and candidate construction to a preparation module, and all writes/activation/failure cleanup to a persistence module. The facade must retain every current named export through direct export or re-export.

**Tech Stack:** TypeScript 5, Prisma 7, PostgreSQL, Jest 30.

## Global Constraints

- Strictly structural-only: preserve all valuation calculations, write ordering, error codes/messages/causes, logging, and public exports.
- Preserve sequential batches of 50 for player-ID updates (concurrent updates inside each batch) and `createMany` projection-value writes (one sequential batch at a time).
- Preserve no transaction preflight: staged mode detects missing `$transaction` only at activation and again on the cleanup path.
- Preserve `mode: 'transaction'` without a nested root transaction or staged cleanup; staged activation and cleanup use `{ timeout: 60_000 }`.
- Failed staging attempts cleanup atomically; cleanup failure is logged and never replaces the original application failure.
- Pruning is best-effort only after successful staged activation; its failure is logged and does not change the result.
- Keep tests application-focused using real orchestration and mocks; do not add direct extracted-helper tests merely to prove extraction.

---

## File structure

- Create: `src/lib/projectionApplicationTypes.ts` — shared public/internal contracts currently in the monolith.
- Create: `src/lib/projectionPreparation.ts` — source lookup, Sleeper resolution, scored joins, candidate calculations, and finite-value validation.
- Create: `src/lib/projectionPersistence.ts` — ID updates, staging, writes, activation, cleanup, and pruning.
- Modify: `src/lib/projectionApplication.ts` — public orchestration facade and compatibility re-exports.
- Modify: `src/__tests__/projectionApplication.test.ts` — application-level characterization of side-effect ordering, timeout, failure, cleanup, and pruning behavior.

## Task 1: Characterize orchestration boundaries before extraction

**Files:**

- Modify: `src/__tests__/projectionApplication.test.ts`

**Interfaces:**

- Consumes: existing `applyProjectionValuesToDraft(prisma, options)` and mocked Prisma services.
- Produces: behavior constraints that all extracted modules must preserve.

- [ ] **Step 1: Add ordering and batch-mechanics characterization**

Use mock implementations that append operation names to an array. Build 51 resolved Sleeper-ID
updates and 51 candidate rows, call the public entry point in staged mode, then assert:

```ts
expect(events).toEqual([
  'draft.findUnique',
  'projectionSource.findFirst',
  'player.findMany',
  'player.update:batch-1',
  'player.update:batch-2',
  'playerProjection.findMany',
  'valueSet.create',
  'draftPlayerValue.createMany:batch-1',
  'draftPlayerValue.createMany:batch-2',
  'transaction:activate',
  'prune',
]);
expect(firstPlayerUpdateBatch).toHaveLength(50);
expect(secondPlayerUpdateBatch).toHaveLength(1);
expect(mockDraftPlayerValueCreateMany).toHaveBeenCalledTimes(2);
```

- [ ] **Step 2: Characterize staged transaction options and missing-client timing**

Assert the staged activation transaction receives `{ timeout: 60_000 }`. With `$transaction`
absent, assert value-set creation and value-row writes occur before the typed
`PERSISTENCE_FAILURE`, and assert the cleanup attempt logs its own missing-transaction failure
without replacing the activation-time error:

```ts
await expect(
  applyProjectionValuesToDraft(prismaWithoutTransaction, { draftId: 5 }),
).rejects.toMatchObject({
  code: 'PERSISTENCE_FAILURE',
  message: expect.stringContaining('transaction-capable'),
});
expect(mockValueSetCreate).toHaveBeenCalledTimes(1);
expect(mockDraftPlayerValueCreateMany).toHaveBeenCalledTimes(1);
expect(mockConsoleError).toHaveBeenCalledWith(
  expect.stringContaining('Failed to clean'),
  expect.any(Error),
);
```

- [ ] **Step 3: Characterize distinct failure scopes and non-fatal pruning**

Add public-entry-point cases that prove value-set creation wraps as `Failed to create...` with no
cleanup, row-write generic errors wrap as `Failed to persist...` with cause retained and staged
cleanup attempted, existing `ProjectionApplicationFailure` passes through unchanged, transaction
mode avoids root transaction/cleanup, and prune errors log while returning the activation result.

```ts
mockValueSetCreate.mockRejectedValueOnce(new Error('set create failed'));
await expect(applyProjectionValuesToDraft(prisma, { draftId: 5 })).rejects.toMatchObject({
  code: 'PERSISTENCE_FAILURE',
  message: expect.stringContaining('Failed to create a projection value set'),
});
expect(mockTransaction).not.toHaveBeenCalled();
```

- [ ] **Step 4: Characterize stored-stat candidate output**

Assert the public workflow writes a row whose `projectedPoints`, `fallbackAuctionValue`,
`activeAuctionValue`, and `valueSource` come from the existing stored-stat scoring and market-value
path, rather than only asserting a pre-scored join helper.

- [ ] **Step 5: Run focused tests**

Run: `pnpm test -- projectionApplication.test.ts projectionApply.test.ts --runInBand`

Expected: all characterization tests pass before any production extraction.

- [ ] **Step 6: Commit**

```bash
git add src/__tests__/projectionApplication.test.ts
git commit -m "test: characterize projection application boundaries"
```

## Task 2: Extract contracts and projection preparation

**Files:**

- Create: `src/lib/projectionApplicationTypes.ts`
- Create: `src/lib/projectionPreparation.ts`
- Modify: `src/lib/projectionApplication.ts`
- Test: `src/__tests__/projectionApplication.test.ts`, `src/__tests__/projectionApply.test.ts`

**Interfaces:**

- Consumes: draft/player/projection rows and existing calculation libraries.
- Produces: `prepareProjectionCandidates(...)`, `getLatestProjectionSourceId(...)`, and all current
  helper exports re-exported by `projectionApplication.ts`.

- [ ] **Step 1: Move shared interfaces without changing their names or shapes**

Move `ProjectionApplyPrisma`, public options/result, row interfaces, and write-row contracts into
`projectionApplicationTypes.ts`. Import types back into the facade and re-export every pre-existing
named type from `projectionApplication.ts`.

- [ ] **Step 2: Move pure/read preparation code**

Move `getLatestProjectionSourceId`, Sleeper-ID resolution/update derivation, stored-projection
scoring, joins, VOR/market calculation, candidate-row construction, finite validation, scoring and
target-roster conversion, and chunking needed for preparation into `projectionPreparation.ts`.
Keep the exact `DEFAULT_SCORING_SETTINGS` baseline calculation and existing no-joined-player typed
failure messages.

```ts
export function prepareProjectionCandidates(
  input: ProjectionPreparationInput,
): ProjectionCandidate[] {
  // Performs the exact existing join, calculateProjectionValues, calculateProjectionMarketValues,
  // candidate filtering, and assertFiniteCandidateRows sequence.
}
```

- [ ] **Step 3: Keep the public facade behavior identical**

Call the preparation module from the existing public workflow without changing reads, source
selection, pre-staging no-join failure timing, or any existing helper import path.

- [ ] **Step 4: Run focused tests and static checks**

Run:

```bash
pnpm test -- projectionApplication.test.ts projectionApply.test.ts --runInBand
pnpm tsc --noEmit
pnpm lint
```

Expected: all commands pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/projectionApplicationTypes.ts src/lib/projectionPreparation.ts \
  src/lib/projectionApplication.ts
git commit -m "refactor: extract projection preparation"
```

## Task 3: Extract staged persistence and complete the facade

**Files:**

- Create: `src/lib/projectionPersistence.ts`
- Modify: `src/lib/projectionApplication.ts`
- Test: `src/__tests__/projectionApplication.test.ts`

**Interfaces:**

- Consumes: `ProjectionApplyPrisma`, prepared candidate rows, `ProjectionApplicationFailure`, and
  `ApplyProjectionValuesOptions['mode']`.
- Produces: persistence operations called by the facade without altering public API behavior.

- [ ] **Step 1: Move pre-staging ID writes with exact batching**

Extract a persistence operation that performs only the existing sequential batches of 50 and
`Promise.all` player updates inside each batch. It must remain before projection reads and must not
wrap update failures in a new error scope.

- [ ] **Step 2: Move staging/write/activation with distinct failure scopes**

Create the set in its own `try`/`catch` with the current `Failed to create a projection value set`
wrapper. Keep row writes and activation in their shared `try`/`catch`, including typed-error
pass-through, generic `Failed to persist projection values` wrapping with `cause`, staged-only
cleanup, and transaction-mode exclusion from cleanup.

```ts
const activated =
  mode === 'transaction'
    ? await activateProjectionValueSet(prisma as never, activationInput)
    : await requireProjectionTransaction(prisma)(
        (tx) => activateProjectionValueSet(tx as never, activationInput),
        { timeout: 60_000 },
      );
```

- [ ] **Step 3: Preserve cleanup and pruning timing**

Do not call `requireProjectionTransaction` before activation. On staged failure, call it again
inside the cleanup attempt, preserve its logging string, and rethrow the original failure. After
successful staged activation only, call pruning and preserve its non-fatal logging string.

- [ ] **Step 4: Reduce the facade to orchestration and compatibility exports**

The facade loads draft/players/projections, calls preparation and persistence in current order,
returns the unchanged result, and re-exports all prior helper/type symbols. It retains no duplicate
calculation or durable mutation logic.

- [ ] **Step 5: Run focused and static verification**

Run:

```bash
pnpm test -- projectionApplication.test.ts projectionApply.test.ts --runInBand
pnpm tsc --noEmit
pnpm lint
```

Expected: all commands pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/projectionPersistence.ts src/lib/projectionApplication.ts
git commit -m "refactor: extract projection persistence"
```

## Task 4: Full verification and final review

**Files:**

- Verify: `src/lib/projectionApplication.ts`, `src/lib/projectionApplicationTypes.ts`,
  `src/lib/projectionPreparation.ts`, `src/lib/projectionPersistence.ts`
- Verify: `src/__tests__/projectionApplication.test.ts`, `src/__tests__/projectionApply.test.ts`

**Interfaces:**

- Consumes: completed structural refactor.
- Produces: a verified, review-ready, main-based PR diff.

- [ ] **Step 1: Inspect scope**

Run:

```bash
git diff main...HEAD -- src/lib/projectionApplication.ts src/lib/projectionApplicationTypes.ts \
  src/lib/projectionPreparation.ts src/lib/projectionPersistence.ts \
  src/__tests__/projectionApplication.test.ts src/__tests__/projectionApply.test.ts
git status --short
```

Confirm only the planned structural decomposition, necessary characterization tests, and approved
design/plan documentation are present.

- [ ] **Step 2: Run the full quality gate outside the sandbox**

Run: `make check`

Expected: typecheck, lint, formatting, and all unit tests pass. Use elevated execution because
`localFonts.test.ts` invokes `git`, which sandbox policy blocks.

- [ ] **Step 3: Request final Sol review**

Review against the approved design, this plan, and the full `main...HEAD` diff. Resolve all critical
and important findings before publication.

- [ ] **Step 4: Commit any review fix**

```bash
git add <reviewed-files>
git commit -m "test: preserve projection application behavior"
```
