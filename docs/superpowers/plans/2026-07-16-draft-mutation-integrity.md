# Draft Mutation Integrity Implementation Plan

**Status:** Implemented and verified on `hard-001-002-draft-integrity` on 2026-07-16.

**Verification:** `make check` passed 84 suites / 682 tests; `pnpm test:integration` passed 6
real-PostgreSQL tests; the completed-draft browser acceptance flow passed without page errors.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make completed drafts immutable and make every bid legal, serialized, and atomic.

**Architecture:** All draft writes run through one transaction helper that takes a namespaced
PostgreSQL advisory lock for the draft, then rechecks ownership and `ACTIVE` status inside the
transaction. Bid mutations reuse that serialized transaction to derive trusted player metadata,
evaluate team budget and roster state, write the result, and remove nominations atomically.

**Tech Stack:** Next.js 16 server actions and route handlers, TypeScript 5, Prisma 7, PostgreSQL,
Jest/React Testing Library, pnpm 11.

## Global Constraints

- Use pnpm only.
- Add a failing test and observe the expected failure before each behavior change.
- IDs and dollar values must be positive `Number.isSafeInteger` values.
- A skill-player position (`QB`, `RB`, `WR`, or `TE`) consumes one roster slot; `PICK` and `PKG`
  consume budget but no roster slot.
- Maximum legal price leaves one dollar for every unfilled skill-player roster slot after the bid.
- Every completed-draft write returns a stable typed `DRAFT_COMPLETE` outcome and changes no rows.
- Unexpected database failures must propagate after rollback; do not relabel them as domain errors.
- Do not add a duplicate player-claim migration: current `main` already has
  `@@unique([draftId, playerId])` and its migration.

---

### Task 1: Shared locked mutation boundary

**Files:**

- Create: `src/lib/draftMutation.ts`
- Test: `src/__tests__/draftMutation.test.ts`

**Interfaces:**

- Produces `DraftMutationCode`, `DraftMutationFailure`, `DraftMutationResult<T>`,
  `withActiveOwnedDraftMutation(userId, draftId, operation)`, `completeOwnedDraft(userId,
draftId)`, and `isPositiveSafeInteger(value)`.
- `operation` receives a `Prisma.TransactionClient` and the locked draft row.

- [ ] **Step 1: Write failing boundary tests**

  Cover invalid IDs, missing ownership, `COMPLETE`, lock-before-read ordering, success, expected
  domain failure conversion, unexpected failure propagation, and completion using the identical
  advisory-lock namespace.

- [ ] **Step 2: Verify red**

  Run: `pnpm test -- src/__tests__/draftMutation.test.ts --runInBand`

  Expected: FAIL because `@/lib/draftMutation` does not exist.

- [ ] **Step 3: Implement the boundary**

  Use a two-integer advisory key so this lock family cannot collide accidentally with the
  user-hash lock used during draft creation:

  ```ts
  const DRAFT_MUTATION_LOCK_NAMESPACE = 1_144_002_001;

  export async function withActiveOwnedDraftMutation<T>(
    userId: string,
    draftId: number,
    operation: (tx: Prisma.TransactionClient, draft: LockedDraft) => Promise<T>,
  ): Promise<DraftMutationResult<T>>;
  ```

  Inside `prisma.$transaction`, call
  `pg_advisory_xact_lock(DRAFT_MUTATION_LOCK_NAMESPACE, draftId)`, query by `id` and `ownerId`,
  reject non-active drafts, then invoke `operation`. Catch only `DraftMutationFailure`; rethrow
  every other error so Prisma rolls back and callers retain infrastructure visibility.

- [ ] **Step 4: Verify green**

  Run: `pnpm test -- src/__tests__/draftMutation.test.ts --runInBand`

  Expected: PASS.

### Task 2: Lifecycle enforcement for actions and API routes

**Files:**

- Modify: `src/lib/actions.ts`
- Modify: `src/lib/onboarding-actions.ts`
- Modify: `src/app/api/draft/[draftId]/nominated/route.ts`
- Modify: `src/app/api/draft/[draftId]/watchlist/route.ts`
- Test: `src/__tests__/actions.test.ts`
- Test: `src/__tests__/completeDraft.test.ts`
- Test: `src/__tests__/onboarding-actions.test.ts`
- Test: `src/__tests__/api/nominated.test.ts`
- Test: `src/__tests__/api/watchlist.test.ts`

**Interfaces:**

- Bid actions return `DraftMutationResult` rather than relying on exception messages.
- Nomination/watchlist routes map `DRAFT_COMPLETE` to HTTP 409 with
  `{ ok: false, code: 'DRAFT_COMPLETE' }`.
- `completeDraft` delegates to `completeOwnedDraft`, and `advanceOnboardingStep` uses the active
  mutation boundary.

- [ ] **Step 1: Add completed-draft and invalid-ID tests**

  Assert POST and DELETE are both blocked, completion is locked, onboarding practice progression
  is blocked, and no mutation delegate is invoked after a lifecycle failure.

- [ ] **Step 2: Verify red**

  Run:
  `pnpm test -- src/__tests__/actions.test.ts src/__tests__/completeDraft.test.ts src/__tests__/onboarding-actions.test.ts src/__tests__/api/nominated.test.ts src/__tests__/api/watchlist.test.ts --runInBand`

  Expected: lifecycle cases fail against the current unlocked writes.

- [ ] **Step 3: Route all writes through the boundary**

  Move player lookup plus upsert/delete inside the locked route transaction. Preserve 401 for
  unauthenticated users, 404 for missing ownership/player, 400 for malformed IDs, and use 409 only
  for completed/conflicting state. Treat missing DELETE rows as idempotent success.

- [ ] **Step 4: Verify green**

  Re-run the Task 2 command. Expected: PASS.

### Task 3: Sleeper mapping and catch-up lifecycle enforcement

**Files:**

- Modify: `src/lib/sleeper-roster-actions.ts`
- Test: `src/__tests__/sleeper-roster-actions.test.ts`

**Interfaces:**

- Add `draft_complete` to the existing Sleeper response unions to avoid breaking all established
  lowercase codes.
- Preview functions remain available because they are read-only; mapping and catch-up persistence
  use `withActiveOwnedDraftMutation` after external Sleeper fetches complete.

- [ ] **Step 1: Add failing completed-draft tests**

  Verify mapping and catch-up return `{ ok: false, code: 'draft_complete' }`, invoke no write, and
  recheck status after a delayed Sleeper response.

- [ ] **Step 2: Verify red**

  Run: `pnpm test -- src/__tests__/sleeper-roster-actions.test.ts --runInBand`

  Expected: completed drafts currently persist.

- [ ] **Step 3: Move both persistence paths into the shared boundary**

  Keep validation and remote fetches outside the database transaction. Once data is ready, acquire
  the draft lock, recheck lifecycle, re-read database-dependent rows, and persist with the supplied
  transaction client.

- [ ] **Step 4: Verify green**

  Run the Task 3 command. Expected: PASS.

### Task 4: Completed-draft read-only UI

**Files:**

- Modify: `src/app/draft/[draftId]/layout.tsx`
- Modify: `src/app/draft/[draftId]/page.tsx`
- Modify: `src/app/draft/[draftId]/nominate/page.tsx`
- Modify: `src/components/AuctionSheet/AuctionSheet.tsx`
- Modify: `src/components/AuctionSheet/PlayerTable.tsx`
- Modify: `src/components/NominationHelper/NominationHelper.tsx`
- Modify: `src/components/NominationHelper/NominationTable.tsx`
- Modify: `src/components/NominationHelper/WatchlistSidebar.tsx`
- Test: `src/__tests__/AuctionSheet.claimed.test.tsx`
- Test: `src/__tests__/NominationHelper.ui.test.tsx`
- Test: `src/__tests__/OnboardingTargets.test.tsx`

**Interfaces:**

- `AuctionSheet` and `NominationHelper` receive `isReadOnly: boolean`.
- `PlayerTable.onRowClick`, nomination handlers, and watchlist handlers become optional so their
  absence renders semantic non-interactive content rather than disabled fake buttons.

- [ ] **Step 1: Add failing read-only component tests**

  Assert an explicit `data-testid="draft-read-only-banner"` appears; bid modal entry, nomination,
  watchlist add/remove, Sleeper catch-up, and onboarding practice targets do not exist; search,
  filters, sorting, and historical rows remain usable.

- [ ] **Step 2: Verify red**

  Run:
  `pnpm test -- src/__tests__/AuctionSheet.claimed.test.tsx src/__tests__/NominationHelper.ui.test.tsx src/__tests__/OnboardingTargets.test.tsx --runInBand`

  Expected: the controls are still rendered.

- [ ] **Step 3: Implement read-only rendering**

  Pass `draft.status === 'COMPLETE'` from server pages. Suppress tour progress in the draft layout
  for completed drafts. Keep informational UI intact, but omit every function that writes.

- [ ] **Step 4: Verify green**

  Re-run the Task 4 command. Expected: PASS.

### Task 5: Bid legality service and atomic server actions

**Files:**

- Create: `src/lib/bidMutation.ts`
- Modify: `src/lib/actions.ts`
- Modify: `src/components/AuctionSheet/AuctionSheet.tsx`
- Test: `src/__tests__/bidMutation.test.ts`
- Test: `src/__tests__/actions.test.ts`

**Interfaces:**

- Produce `createBidRecord`, `updateBidRecord`, and `deleteBidRecord`, each operating through the
  shared active-draft transaction.
- Produce typed codes `INVALID_INPUT`, `TEAM_NOT_FOUND`, `PLAYER_NOT_FOUND`, `BID_NOT_FOUND`,
  `PLAYER_ALREADY_CLAIMED`, `ROSTER_FULL`, and `BID_EXCEEDS_MAX` in addition to lifecycle codes.

- [ ] **Step 1: Add numeric and legality boundary tests**

  Test zero, negative, decimal, `NaN`, infinities, `Number.MAX_SAFE_INTEGER + 1`, malformed IDs,
  full rosters, exact maximum bids, one dollar above maximum, PICK/PKG slot behavior, same-team
  updates, cross-team moves, and unrelated Prisma `P2002` errors.

- [ ] **Step 2: Verify red**

  Run:
  `pnpm test -- src/__tests__/bidMutation.test.ts src/__tests__/actions.test.ts --runInBand`

  Expected: current actions accept illegal values and are not atomic.

- [ ] **Step 3: Implement legality and atomic writes**

  Derive player metadata from the locked draft's `Player`. For a target team, exclude the existing
  bid during update, sum all prices, count only skill-player positions, then enforce:

  ```ts
  resultingSkillCount <= draft.rosterSize;
  team.budget - resultingSpend >= draft.rosterSize - resultingSkillCount;
  ```

  Create the bid and delete its nomination inside one callback. Translate `P2002` only when its
  target identifies the draft/player unique constraint. Revalidate only on `{ ok: true }`. Update
  the client to switch on result codes and show actionable modal messages.

- [ ] **Step 4: Verify green**

  Re-run the Task 5 command. Expected: PASS.

### Task 6: Apply bid legality to Sleeper catch-up batches

**Files:**

- Modify: `src/lib/bidMutation.ts`
- Modify: `src/lib/sleeper-roster-actions.ts`
- Test: `src/__tests__/sleeper-roster-actions.test.ts`

**Interfaces:**

- Export an internal transaction-scoped bid legality function so catch-up can validate multiple
  entries under the already-held draft lock without opening nested transactions.
- Extend conflict reasons with `roster_full` and `bid_exceeds_max`.

- [ ] **Step 1: Add failing batch-legality tests**

  Cover two same-team entries whose combined cost is illegal, exact-budget batches, full roster,
  concurrent duplicate classification, and rollback when nomination cleanup throws.

- [ ] **Step 2: Verify red**

  Run: `pnpm test -- src/__tests__/sleeper-roster-actions.test.ts --runInBand`

  Expected: catch-up currently bypasses team legality.

- [ ] **Step 3: Validate and insert sequentially in one transaction**

  Maintain in-transaction team state per accepted entry. Preserve valid entries and return typed
  conflicts for invalid ones; allow unexpected database errors to abort and roll back the entire
  batch.

- [ ] **Step 4: Verify green**

  Run the Task 6 command. Expected: PASS.

### Task 7: Real PostgreSQL race and rollback verification

**Files:**

- Create: `src/__tests__/integration/draft-integrity.postgres.test.ts`
- Create: `jest.integration.config.ts`
- Modify: `package.json`
- Modify: `.env.example`

**Interfaces:**

- Add `pnpm test:integration`, deriving a dedicated `draftops_test` URL when
  `TEST_DATABASE_URL` is absent and refusing all non-local databases or names without `_test`.

- [ ] **Step 1: Add the integration harness and failing race tests**

  Seed uniquely named drafts/teams/players and clean them in dependency order. Use independent
  PostgreSQL connections to test completion-versus-bid, completion-versus-Sleeper mutation,
  duplicate-player claims, and two bids competing for the same team's maximum budget. Install a
  temporary PostgreSQL trigger that raises on nomination deletion to prove bid rollback.

- [ ] **Step 2: Verify the tests fail against pre-fix behavior**

  Run: `TEST_DATABASE_URL=<dedicated-local-test-url> pnpm test:integration`

  Expected before Tasks 1-6: at least the completion and budget races fail. Expected after Tasks
  1-6: PASS.

- [ ] **Step 3: Keep the harness production-safe**

  Ensure no test can target the normal development or production URL accidentally, all pools close
  in `afterAll`, and trigger/function cleanup runs in `finally` blocks.

- [ ] **Step 4: Verify integration green**

  Run the Task 7 command. Expected: all PostgreSQL integrity tests pass.

### Task 8: Final verification and backlog status

**Files:**

- Modify: `docs/draftops-audit-workstreams.md` in the authoritative main checkout after the
  implementation has passed review.

- [ ] **Step 1: Run focused and full checks**

  Run `pnpm tsc --noEmit`, `pnpm lint`, `pnpm format:check`, the integration suite, and
  `make check`. Expected: all pass with no new warnings.

- [ ] **Step 2: Review the diff**

  Run `git diff --check`, inspect every changed file, confirm no stale Workstream A/B migration or
  generated artifact entered the branch, and verify every write surface is covered.

- [ ] **Step 3: Update hardening status**

  Mark HARD-001 and HARD-002 complete only if the unit, component, and real-PostgreSQL acceptance
  tests all pass. Record the branch name and verification commands; otherwise leave the relevant
  item in progress and list the exact unmet criterion.
