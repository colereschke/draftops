# DraftOps Engineering Hardening Backlog

Audit date: 2026-07-16

Status reconciliation: 2026-07-21, through merged PR #79.

This is the authoritative engineering-hardening backlog for DraftOps. It replaces the
2026-07-14 Workstreams A-H audit while preserving a mapping to that work and recording the
disposition of the existing A/B worktrees.

The repository was healthy at the time of this audit:

- `pnpm tsc --noEmit` passed.
- `pnpm lint` passed with one warning from generated `coverage/` output.
- 81 Jest suites and 636 tests passed on `main`.
- Overall Jest coverage was 88.65% statements, 87.04% branches, 81.75% functions, and
  88.65% lines.
- `pnpm build` passed when Google Font downloads were available.
- `make projections-check` passed 49 Python tests plus Ruff and mypy.
- `pnpm audit --prod` reported two moderate dependency advisories; see HARD-013.

Passing checks do not cover the highest-risk areas identified here: real PostgreSQL concurrency,
draft lifecycle races, cross-view value consistency, and production browser flows.

## Priority and status definitions

- **P0**: correctness or data-integrity risk. Resolve before the next broader beta or a live draft
  using generalized settings.
- **P1**: important production hardening. Resolve before actively soliciting wider Discord usage.
- **P2**: UX, performance, maintainability, and operational maturity.
- **P3**: lower-risk polish.
- **IN PROGRESS** means useful work exists but is not safe to merge as-is.
- **READY FOR INTEGRATION** means an implementation is verified on a branch but is not yet on
  `main`.
- **READY** means no known branch is implementing the item.
- **COMPLETE** means the change is already on `main` and verified.

The `Problem`, `Implementation direction`, and `Acceptance criteria` sections preserve the original
audit context. For completed items, the status and implementation checkpoint describe the current
state on `main` and supersede that historical wording.

## Required workflow for every item

Each implementation session should:

1. Read `AGENTS.md` completely.
2. Run `git pull origin main` in the main checkout before creating a branch or worktree.
3. Create a fresh branch/worktree from current `main` unless an item explicitly identifies a safe
   continuation branch.
4. Add a failing test before changing behavior.
5. Keep unrelated refactors and generated planning artifacts out of the PR.
6. Run the targeted tests during development and `make check` before review.
7. For schema or transaction work, also test against a real PostgreSQL database; mocked Prisma
   tests are not sufficient.

---

## P0 - correctness and data integrity

### HARD-001 - Make completed drafts transactionally immutable

- **Status:** COMPLETE - merged in PR #53 (`231b869`)
- **Effort:** Medium
- **Sequence:** Implement before HARD-002 and HARD-010

#### Implementation checkpoint (2026-07-16)

The fresh implementation supersedes the stale Workstream B branches. It introduces a shared
typed mutation boundary that takes a namespaced per-draft PostgreSQL advisory lock, rechecks
ownership and `ACTIVE` status inside the write transaction, and serializes completion through the
same lock. Bid actions, nomination/watchlist routes, onboarding practice progression, Sleeper
mapping, and Sleeper catch-up all use that boundary. Completed value-sheet and nomination views
render an explicit read-only banner while retaining historical data, filtering, sorting, and
navigation.

Verification on the branch:

- `make check`: 84 suites and 682 tests passed with TypeScript, ESLint, and Prettier clean.
- `pnpm test:integration`: 6 real-PostgreSQL concurrency and rollback tests passed.
- Browser acceptance: controls existed while active; after completing through `/drafts`, bid,
  Sleeper, nomination, watchlist, and onboarding mutation entry points were absent, with no page or
  browser errors.

#### Problem

`Draft.status = COMPLETE` is not a complete write barrier. Bid actions, nomination/watchlist
routes, and Sleeper roster synchronization can still mutate a completed draft. The current UI also
continues to expose mutation controls.

A status check before a write is not enough: `completeDraft` can race with a bid or Sleeper sync
that has already checked the draft.

#### Primary locations

- `src/lib/actions.ts`
- `src/lib/draft.ts`
- `src/lib/sleeper-roster-actions.ts`
- `src/app/api/draft/[draftId]/nominated/route.ts`
- `src/app/api/draft/[draftId]/watchlist/route.ts`
- `src/app/draft/[draftId]/page.tsx`
- `src/app/draft/[draftId]/nominate/page.tsx`
- `src/components/AuctionSheet/`
- `src/components/NominationHelper/`

#### Implementation direction

1. Create one typed server-side mutation boundary, such as `requireActiveOwnedDraft`.
2. Make every draft write use it: bid create/update/delete, nomination, watchlist, Sleeper mapping,
   catch-up synchronization, and future draft-scoped mutations.
3. Serialize completion and mutations with the same per-draft PostgreSQL advisory or row lock.
   Acquire the lock and recheck status inside the transaction that performs the write.
4. Return a stable typed outcome such as `DRAFT_COMPLETE`; do not couple clients to arbitrary
   exception strings.
5. Pass draft status into the value sheet and nomination workspace and remove all mutation entry
   points when complete, including Sleeper sync and onboarding practice actions.
6. Keep historical data, filtering, sorting, and navigation available in read-only mode.
7. If reopening is desired later, implement it as a separate confirmed and audited action.

#### Acceptance criteria

- Every write surface rejects a completed draft without changing rows.
- A completion-versus-bid race has deterministic behavior under a real PostgreSQL test.
- A completion-versus-Sleeper-sync race cannot write after completion.
- Complete drafts show an explicit read-only banner and no mutation controls.
- Active drafts retain current behavior.

#### Required tests

- Server action and API tests for every completed-draft mutation.
- A real-database concurrency test using two transactions.
- Component tests for completed and active value-sheet/nomination states.
- A browser test that completes a draft and confirms all mutation entry points disappear.

### HARD-002 - Enforce bid legality and make bid logging atomic

- **Status:** COMPLETE - merged in PR #53 (`231b869`)
- **Effort:** Medium to large
- **Sequence:** After HARD-001; before HARD-004 and HARD-010

#### Implementation checkpoint (2026-07-16)

The fresh implementation reuses the sound policy ideas from Workstream A without importing its
stale migration or branch history. `src/lib/bidMutation.ts` validates safe positive integer IDs and
prices, derives trusted player metadata from the draft-scoped player row, serializes bid checks and
writes under the draft lock, enforces roster capacity and the one-dollar-per-open-slot maximum,
and handles same-team updates and cross-team moves against the resulting state. Bid creation and
nomination cleanup are atomic, expected player-claim uniqueness failures receive a typed conflict,
and unrelated database failures propagate.

The verification evidence is shared with HARD-001 above. The PostgreSQL cases specifically cover
concurrent duplicate claims, concurrent same-team maximum-budget bids, and forced nomination
cleanup failure with bid rollback.

#### Problem

Bid actions accept untrusted numbers without enforcing safe positive whole dollars, valid IDs,
roster capacity, or affordability. Bid creation and nomination cleanup are separate commits on
`main`, so cleanup failure can leave a persisted bid while the client sees an error.

The database now prevents duplicate non-null player IDs, but clients still need a typed conflict
outcome and the application must handle lifecycle and team-budget races.

#### Primary locations

- `src/lib/actions.ts`
- `src/lib/threat.ts`
- `src/lib/draft.ts`
- `prisma/schema.prisma`
- `src/__tests__/actions.test.ts`

#### Implementation direction

1. Introduce shared runtime validation for all action fields. IDs and prices must be
   `Number.isSafeInteger` and positive.
2. Derive player metadata from the draft-scoped `Player` row; never trust client position, NFL
   team, rank, or display name.
3. Decide and encode the auction legality rule. Recommended maximum bid is remaining budget minus
   one dollar for every required roster slot after the acquired player. Updates must temporarily
   remove the existing bid before recalculating legality.
4. Lock the affected draft/team while checking roster and budget invariants.
5. Put bid creation and nomination removal in one transaction.
6. Translate Prisma uniqueness failures into `PLAYER_ALREADY_CLAIMED` without swallowing unrelated
   `P2002` errors.
7. Return structured mutation results for authorization, validation, lifecycle, conflict, and
   infrastructure failures.

#### Acceptance criteria

- Negative, zero, decimal, non-finite, unsafe, and malformed values are rejected.
- A team cannot violate the chosen budget or roster-capacity policy.
- Concurrent claims for one player produce one winner and one clear conflict.
- Bid creation and nomination cleanup succeed or fail together.
- Updates validate the resulting team state, not the pre-update state.

#### Required tests

- Boundary tests for every invalid numeric/ID class.
- Real-PostgreSQL concurrent duplicate and concurrent team-budget tests.
- Transaction rollback test when nomination cleanup fails.
- Update tests that move a bid between teams and change its price.

### HARD-003 - Scale valuations to the configured draft budget

- **Status:** COMPLETE - merged in PR #56 (`dfd5eac`)
- **Effort:** Large
- **Sequence:** Before HARD-006 and HARD-016

#### Implementation checkpoint (2026-07-17)

PR #56 made the ranking-source economy explicit on `UserRankingSet` and `Draft`, scaled skill
players and future-pick assets into each draft budget before league adjustments, preserved source
values in `Player.base*`, and kept projection-shaped values anchored to the corrected fallback.
It also added a dry-run-first, snapshot-backed existing-draft backfill with per-draft transactions
and projection reapplication.

Verification: `make check` passed 84 suites / 702 tests; two real-PostgreSQL integration tests
covered apply idempotency and rollback; independent whole-branch review found no remaining
critical or important findings.

#### Problem

Player source values are calibrated to a $1,000 auction, but `adjustPlayerValues` does not receive
the configured draft budget. A $200 draft therefore receives approximately $1,000-scale fallback
values. Projection-shaped active values inherit the error because they anchor to `Player.budget`.

The current $1,000 league is unaffected; generalized budgets are affected.

#### Primary locations

- `src/lib/actions.ts`
- `src/lib/valueAdjustment.ts`
- `src/lib/projectionMarketValue.ts`
- `src/lib/projectionApplication.ts`
- `src/lib/futurePickAssets.ts`
- `prisma/schema.prisma`

#### Implementation direction

1. Give every ranking source an explicit source budget, initially `$1,000`.
2. Apply `draftBudget / sourceBudget` before scoring, lineup, and scarcity adjustments.
3. Scale skill players and future-pick/package assets from the same budget basis.
4. Preserve clear semantics: base fields are source values, `Player.budget` is the draft-adjusted
   fallback, and `activeAuctionValue` is the projection-shaped draft value.
5. Reapply projections after fallback scaling.
6. Build a dry-run-capable, idempotent backfill for existing non-$1,000 drafts and snapshot affected
   drafts before applying it.

#### Acceptance criteria

- $1,000 golden fixtures are unchanged.
- $200 and $2,000 fixtures scale proportionally before league adjustments.
- Future picks/packages and skill players use the same source-budget contract.
- Aggregate market-value totals remain calibrated to the configured league economy.

### HARD-004 - Use one canonical active-value and team-statistics service

- **Status:** COMPLETE - merged in PR #57 (`807a509`)
- **Effort:** Medium to large
- **Sequence:** After HARD-002 and HARD-003

#### Implementation checkpoint (2026-07-17)

`src/lib/rosterPolicy.ts` now defines the shared QB/RB/WR/TE roster-slot rule used by bid
legality and `computeDraftTeamStats`. PICK/PKG results reduce budget and remain roster assets, but
do not use roster slots or influence average roster age. The canonical calculator also accepts an
optional per-team net budget delta (zero by default), preserving the budget-transfer seam needed by
feature 10 without modeling trades as auction wins.

`getActiveDraftPlayers` centralizes draft-value mapping, dynamic pick adjustment, and auction-mode
filtering. The value sheet, teams, budget, nomination page, and nomination-data API now consume it;
the teams, budget, and API also use the canonical calculator. The old `budget.ts` and
`computeTeamStats.ts` implementations are removed. A Jest path ignore prevents the shared fixture
module from being discovered as an empty test suite.

Verification: `make check` passed with 89 suites and 757 tests; typecheck, lint, format check, and
focused canonical-value/statistics/API suites also passed.

#### Problem

Budget, roster, and nomination views calculate roster counts and active player values differently.
The nomination API counts PICK/PKG results as roster slots while the budget/teams functions count
only QB/RB/WR/TE. The budget view uses fallback values where the teams view uses active projection
and dynamic pick values.

This can produce different buying power, threat, delta, tendency, and nomination advice depending
on the page.

#### Primary locations

- `src/lib/activeDraftPlayers.ts`
- `src/lib/computeDraftTeamStats.ts`
- `src/lib/rosterPolicy.ts`
- `src/app/api/draft/[draftId]/nomination-data/route.ts`
- `src/app/draft/[draftId]/budget/page.tsx`
- `src/app/draft/[draftId]/teams/page.tsx`
- `src/app/draft/[draftId]/nominate/page.tsx`

#### Implementation direction

1. Document an explicit `countsTowardRoster` policy for skill players, packages, and picks.
2. Create one `getActiveDraftPlayers(draftId)` query/service that applies active projections,
   dynamic future-pick values, and auction-mode filtering.
3. Create one pure `computeDraftTeamStats` function consumed by all pages and APIs.
4. Build player lookup maps once instead of repeated `players.find` calls.
5. Feed tendencies, deltas, threat calculations, and nomination scoring from the same outputs.

#### Acceptance criteria

- One fixture returns identical team statistics in every route/view.
- PICK/PKG roster and spending behavior is documented and tested.
- Active-value selection is identical on value sheet, teams, budget, and nomination pages.
- The duplicate team-stat implementations are removed.

---

## P1 - production hardening

### HARD-005 - Enforce same-draft relationships in PostgreSQL

- **Status:** COMPLETE - merged in PR #67 (`d271d78`)
- **Effort:** Large
- **Sequence:** After HARD-001 and a production data audit

#### Implementation checkpoint (2026-07-19)

PR #67 audited production, deterministically backfilled the one safe null player identity, and
added guarded compound relationships for all six protected team/player/owner paths. The migration
runs in one transaction, locks relationship writes during preflight and backfill, validates every
new constraint, and aborts with relationship-specific aggregate failures instead of leaving a
partial schema.

Verification: the pre- and post-migration production audits found zero orphaned or cross-draft
relationships; `make check` passed 89 suites / 758 tests; 25 real-PostgreSQL integration tests and a
clean schema-drift check passed.

#### Problem

Child rows store `draftId` plus `teamId` and/or `playerId`, but foreign keys do not guarantee those
records belong to the same draft. `Draft.ownerTeamId` can likewise point at a team from another
draft if application checks are bypassed.

#### Primary locations

- `prisma/schema.prisma`
- `prisma/migrations/`
- bid/watchlist/nomination integration tests

#### Implementation direction

1. Audit production data for cross-draft relationships and orphaned IDs.
2. Repair or quarantine violations before creating constraints.
3. Add `[id, draftId]` candidate keys and composite foreign keys where Prisma models them cleanly;
   otherwise redesign redundant `draftId` storage or add database-level constraints explicitly.
4. Protect the owner-team relation with the same invariant.
5. Add draft-leading indexes for common child queries after checking query plans.

#### Acceptance criteria

- Cross-draft team/player/owner relationships fail at the database layer.
- The migration aborts with a useful message if bad legacy data exists.
- Application ownership checks remain as defense in depth.

### HARD-006 - Make projection-source activation explicit and atomic

- **Status:** COMPLETE - merged in PR #70 (`c6a9701`)
- **Effort:** Large
- **Sequence:** After HARD-003

#### Implementation checkpoint (2026-07-19)

PR #70 added versioned `DraftProjectionValueSet` records and an explicit active-set pointer.
Projection refreshes now stage and validate a complete candidate before atomically archiving the
prior set and activating the new one under the shared draft advisory lock. Failed batches leave the
current set untouched, and retention keeps the active set plus three archived row sets.

Verification: `make check` passed 91 suites / 767 tests and 29 real-PostgreSQL integration tests
covered migration backfill, failed/same-source isolation, concurrent activation, retention, budget
rollback, and the HARD-005 compound relationships.

#### Problem

The active projection source is inferred from the newest `DraftPlayerValue.updatedAt`. Existing-
draft projection application writes in batches, so a partial failure can make an incomplete source
appear active and silently push missing players to fallback values. Pages also load historical
values that cannot be active.

#### Primary locations

- `src/lib/playerValueMapping.ts`
- `src/lib/projectionApplication.ts`
- `prisma/apply-projection-values.ts`
- `prisma/schema.prisma`
- draft page loaders

#### Implementation direction

1. Add `Draft.activeProjectionSourceId` or a dedicated activation record.
2. Stage a complete candidate value set without changing the active pointer.
3. Validate expected joins, player counts, and calculation invariants.
4. Atomically flip activation only after validation.
5. Query only fallback rows and the explicit active source.
6. Retain a bounded number of historical sources.

#### Acceptance criteria

- Failed reapplication leaves the previous source fully active.
- Pages do not load unrelated historical value rows.
- Activation source/date is observable and auditable.

### HARD-007 - Validate draft creation and shorten its transaction

- **Status:** READY FOR INTEGRATION - implemented and verified on
  `worktree-hard-007-validate-draft-creation`
- **Effort:** Large

#### Implementation checkpoint (2026-07-19)

The current branch adds one shared Zod schema for client/server draft input, typed mutation results,
case-insensitive handle validation, exactly-one-owner validation, bounded numeric/settings checks,
batched team insertion, pre-transaction player preparation, a justified 15-second transaction
timeout, and per-stage duration logging. Draft creation remains atomic with automatic projection
application. Review follow-ups tie future-pick years to an explicitly persisted creation timestamp,
make first-draft onboarding initialization conflict-safe, and keep unexpected action failures in the
inline draft form while reporting them.

Verification: TypeScript, ESLint, Prettier, and 90 Jest suites / 799 tests pass. A dedicated
real-PostgreSQL latency test covers the full transaction stage sequence and a two-second injected
player-insert delay.

#### Deferred follow-up after integration

Measure and, if worthwhile, remove projection application's redundant read-back of the newly
inserted player pool. The likely shape is `player.createManyAndReturn` plus an explicit seeded-player
input to projection application, eliminating the roughly 270-row `findMany` and guaranteed no-op
Sleeper-ID update loop without duplicating projection logic. Keep this as a focused performance
follow-up with real-PostgreSQL timing and rollback coverage.

The custom-ranking read intentionally represents the ranking snapshot captured when submission
begins; changing that to commit-time freshness requires an explicit product/versioning contract.
Case-insensitive handle uniqueness remains enforced at the draft-creation boundary; add a database
normalization migration only if it becomes a required invariant for additional write paths. Do not
extract the one-line duplicate-value check or P2002 parsing until reuse materially improves coupling.

#### Problem

Draft creation permits empty names, multiple owner teams, non-finite/range-invalid settings, and
case-insensitive handle collisions. It also performs sequential team creation plus player and
projection work inside one long interactive transaction, which is risky under Neon latency.

#### Primary locations

- `src/lib/actions.ts`
- `src/app/drafts/new/page.tsx`
- `src/lib/projectionApplication.ts`
- `src/__tests__/createDraft.test.ts`

#### Implementation direction

1. Define a shared client/server schema for draft inputs.
2. Require exactly one owner team and normalized case-insensitive unique handles.
3. Validate finite integer budgets, team/roster counts, target counts, lineup slots, scoring ranges,
   and Sleeper roster IDs.
4. Move pure calculations and safe reads outside the transaction.
5. Replace sequential team/player/value writes with measured bulk operations.
6. Set a justified explicit transaction timeout and record stage/duration metrics.

#### Acceptance criteria

- Crafted server-action inputs cannot persist invalid settings.
- Draft creation remains all-or-nothing.
- A latency-injected real-database test completes within the chosen timeout.

### HARD-008 - Harden rankings ingestion and manual matching

- **Status:** COMPLETE - merged in PR #74 (`d9f26a4`)
- **Effort:** Medium

#### Problem

The CSV parser splits the document into lines before parsing fields, breaking valid quoted
multiline values. Imports do not bound file/row/cell size or reject infinite/duplicate values.
Manual match resolution does not verify target existence, position compatibility, or uniqueness
within the ranking set.

#### Primary locations

- `src/lib/csv.ts`
- `src/lib/rankingsImport.ts`
- `src/lib/rankings-actions.ts`
- `src/app/rankings/page.tsx`

#### Implementation direction

1. Use a maintained CSV parser or a full-document state machine.
2. Support BOMs, escaped quotes, CRLF, and quoted multiline fields.
3. Bound bytes, rows, field lengths, and accumulated validation errors.
4. Require finite values and documented age/rank/budget ranges.
5. Define duplicate player and duplicate rank policy.
6. Validate manual Sleeper IDs, positions, and ranking-set uniqueness server-side.

#### Acceptance criteria

- Valid multiline/escaped CSV fixtures import correctly.
- Oversized or malformed input fails before database writes.
- Crafted manual-match actions cannot assign arbitrary or duplicate identities.

### HARD-009 - Harden Sleeper imports and settings translation

- **Status:** COMPLETE - merged in PR #73 (`cea8f17`)
- **Effort:** Medium

#### Problem

Sleeper requests have no timeout and only partial runtime validation. The import server action is
unauthenticated. Unsupported roster positions are silently removed from the starting lineup while
still contributing to roster size, making IDP/K/IR leagues appear successfully imported with
incomplete settings.

#### Primary locations

- `src/lib/sleeper.ts`
- `src/lib/sleeper-actions.ts`
- `src/lib/sleeper-roster-actions.ts`

#### Implementation direction

1. Authenticate import actions and validate league IDs before network access.
2. Add `AbortSignal.timeout` and bounded retry for safe transient failures.
3. Runtime-validate league, user, and roster payloads.
4. Return distinct not-found, timeout, rate-limit, malformed-response, and unsupported-setting
   outcomes.
5. Warn or reject unsupported lineup/scoring fields instead of silently dropping them.
6. Document whether IR, taxi, kicker, and IDP slots count toward auction roster size.

#### Acceptance criteria

- Anonymous calls are rejected before contacting Sleeper.
- Requests terminate within a defined timeout.
- Malformed responses cannot enter domain logic through type assertions.
- Unsupported leagues receive a visible, actionable explanation.

### HARD-010 - Make optimistic mutations resilient and accessible

- **Status:** COMPLETE - merged in PR #66 (`3d581b6`)
- **Effort:** Medium
- **Sequence:** After HARD-001/HARD-002 typed outcomes

#### Implementation checkpoint (2026-07-19)

PR #66 made bid entry a semantic form, blocked duplicate submissions, added two-step bid removal,
and made watchlist/nomination optimistic mutations restore snapshots and refresh canonical state on
thrown or non-2xx failures. Per-player pending state and a shared `aria-live` status surface make
mutation progress and outcomes accessible.

Verification: `make check` passed 90 suites / 772 tests. Focused coverage includes thrown-fetch and
non-2xx rollback, canonical refetch, duplicate-submit blocking, Enter-key bid submission, guarded
deletion, and live-region announcements.

#### Problem

Some watchlist/nomination requests do not catch thrown network errors, leaving optimistic client
state incorrect. Bid transitions ignore `isPending`, allowing duplicate submissions. Bid removal
is immediate, and the modal is not a semantic form.

#### Primary locations

- `src/components/AuctionSheet/AuctionSheet.tsx`
- `src/components/BidModal/BidModal.tsx`
- `src/components/NominationHelper/NominationHelper.tsx`
- related component tests

#### Implementation direction

1. Track per-entity pending state and block duplicate actions.
2. Wrap every optimistic request in `try/catch/finally` and restore exact snapshots on failure.
3. Use a semantic form so Enter submits normally.
4. Announce pending, success, and failure through an `aria-live` status region.
5. Confirm destructive actions or provide a reliable undo window.
6. Refresh canonical server state after conflicts.

#### Acceptance criteria

- Thrown fetches and non-2xx responses both restore state.
- Double clicks create at most one server mutation.
- Keyboard-only bid logging works.
- Mutation outcomes are visible and announced.

### HARD-011 - Add bid history, export, and recovery controls

- **Status:** COMPLETE - merged in PR #75 (`d921d56`)
- **Effort:** Medium to large

#### Problem

Auction results have no `updatedAt`, change history, actor trail, or recovery mechanism. An
accidental edit/delete permanently changes a live draft without evidence. There is no documented
snapshot or restore workflow.

#### Primary locations

- `prisma/schema.prisma`
- `src/lib/actions.ts`
- draft export/API surface to be designed
- operations documentation

#### Implementation direction

1. Add an append-only `BidAuditEvent` for create/update/delete with actor and previous/new values.
2. Prefer soft deletion or a bounded undo window for user-facing removal.
3. Add owner-authorized JSON and CSV draft exports.
4. Document Neon backup/PITR behavior and perform a restore drill.
5. Snapshot at completion and consider periodic snapshots during live use.

#### Acceptance criteria

- Every bid mutation is reconstructable.
- Deleted bids can be recovered by an authorized owner.
- A completed draft can be exported independently of the UI.
- A tested recovery runbook exists.

### HARD-012 - Expand CI to production-shaped checks

- **Status:** COMPLETE - merged across PR #59 (`aaf5103`) and PR #72 (`817e7df`)
- **Effort:** Medium

#### Implementation checkpoint (2026-07-19)

PR #59 split CI into quality, production build, PostgreSQL migration/integration, and projection
jobs; added minimal permissions and concurrency cancellation; and excluded generated coverage from
quality discovery. PR #72 completed the remaining browser gap with signed-cookie test auth,
dedicated E2E fixtures, and Playwright smoke tests for auth redirect, bid logging, nomination, and
teams/budget rendering against a production build. PR #58 supplies the scheduled production audit
backstop tracked by HARD-013.

Verification included clean-database migration/seed checks, the real-PostgreSQL integration suite,
production build, 49 projection-tooling tests plus Ruff/mypy, and four Chromium smoke specs.
Accessibility-specific regression coverage remains owned by HARD-015, which is now complete,
rather than keeping this CI and production-smoke ticket open.

#### Problem

Workstream C correctly excluded local worktrees, but CI still omits production build, Python
projection checks, migration deployment, real Prisma integration, browser flows, accessibility,
and dependency scanning. Generated `coverage/` output is also currently linted and produces a
warning after `pnpm test:coverage`.

#### Primary locations

- `.github/workflows/ci.yml`
- `eslint.config.mjs`
- `jest.config.ts`
- `package.json`
- future Playwright/integration-test configuration

#### Implementation direction

1. Preserve the merged `.worktrees/**` exclusions from commit `316c59f`.
2. Ignore generated `coverage/**` output in ESLint/Jest discovery as appropriate.
3. Add `pnpm build` and `make projections-check` to CI.
4. Start ephemeral PostgreSQL, run `prisma migrate deploy`, seed smoke, and critical ownership,
   lifecycle, constraint, and transaction tests.
5. Add Playwright smoke coverage with a test-auth mechanism.
6. Add automated accessibility and scheduled advisory scans.
7. Use minimal workflow permissions and concurrency cancellation.

#### Acceptance criteria

- Local worktrees and generated artifacts never affect checks.
- A broken clean-database migration blocks CI.
- Core auction/completion flows run in a browser.
- Projection Python checks and production build run on every PR.

### HARD-013 - Resolve known production dependency advisories

- **Status:** COMPLETE - merged in PR #58 (`a5afff3`)
- **Effort:** Small to medium

#### Implementation checkpoint (2026-07-17)

PR #58 moved the CLI-only `shadcn` package to development dependencies, pinned patched transitive
versions of `@hono/node-server` and PostCSS, added grouped Dependabot updates, and added a weekly
production audit workflow.

Verification: `pnpm audit --prod` reported no known vulnerabilities; `make check` and the production
build passed; repository inspection confirmed `shadcn` has no runtime imports.

#### Problem

`pnpm audit --prod` reports moderate advisories in `@hono/node-server` through Prisma/shadcn
tooling and PostCSS through the pinned Next.js dependency. The `shadcn` CLI is listed as a runtime
dependency despite being development tooling.

#### Primary locations

- `package.json`
- `pnpm-lock.yaml`
- `.github/workflows/ci.yml`

#### Implementation direction

1. Move `shadcn` to `devDependencies`.
2. Upgrade to patched Prisma/Next releases when compatible.
3. Use a pnpm override only after build, Prisma, and browser verification if upstream remains
   blocked.
4. Add Renovate or Dependabot with reviewed grouped updates.
5. Add scheduled `pnpm audit --prod` or OSV scanning; do not blindly auto-fix lockfiles.

#### Acceptance criteria

- Production audit is clean or each remaining advisory has documented exploitability/mitigation.
- CLI-only packages are not runtime dependencies.
- Dependency changes pass the production-shaped CI suite.

### HARD-014 - Replace raw error leakage with structured observability

- **Status:** COMPLETE - merged in PR #78 (`e4c9c04`)
- **Effort:** Medium

#### Problem

Error boundaries display raw `error.message`. `/api/log-error` is unauthenticated/rate-unlimited,
and its size limit trusts `Content-Length`, which does not bound chunked or headerless bodies.
Logging lacks consistent request, deployment, user, and draft correlation.

#### Primary locations

- `src/app/error.tsx`
- `src/app/global-error.tsx`
- `src/app/api/log-error/route.ts`
- `src/lib/reportClientError.ts`
- future `instrumentation.ts`

#### Implementation direction

1. Show generic user copy plus a safe incident/digest ID.
2. Read and bound actual request bytes before JSON parsing.
3. Authenticate/sign or tightly rate-limit client-error ingestion.
4. Sanitize stack, URL, and user-provided fields for secrets/PII.
5. Emit structured logs with request ID, deployment, action, draft, and safe user context.
6. Add an error tracker or Vercel log drain with alerts and synthetic route monitoring.

#### Acceptance criteria

- Internal provider/database messages never reach the UI.
- Oversized chunked requests are rejected.
- A user report can be correlated to a deployment and failing action.

### HARD-015 - Address accessibility and contrast defects

- **Status:** COMPLETE - merged in PR #77 (`360d3cf`)
- **Effort:** Medium to large

#### Problem

The application lacks a consistent skip-link/main-landmark strategy and live regions for async
outcomes. Several searches rely on placeholders, some tables/cards use non-semantic interaction,
controls can be too small for comfortable touch use, and `transition-all` is used without complete
reduced-motion coverage. Muted/error color tokens include normal-text combinations below 4.5:1.

#### Primary locations

- `src/app/layout.tsx`
- `src/app/globals.css`
- `src/components/ui/button.tsx`
- `src/components/ui/toggle.tsx`
- `src/components/AuctionSheet/`
- `src/components/NominationHelper/`

#### Implementation direction

1. Add skip navigation and one `main` landmark per route.
2. Add explicit labels, names, and relevant autocomplete metadata.
3. Replace interactive rows/divs with semantic buttons/links or separate row navigation from
   nested controls.
4. Add a shared application status/live region.
5. Fix contrast at the semantic-token level and add token-pair contrast tests.
6. Provide comfortable touch variants and property-specific transitions.
7. Honor reduced motion and add axe plus keyboard-flow tests.

#### Acceptance criteria

- Critical routes have no serious automated axe violations.
- Primary workflows are keyboard operable.
- Semantic normal-text colors meet the selected WCAG contrast threshold.
- Async outcomes are announced without unexpected focus changes.

### HARD-016 - Make configuration labels truthful

- **Status:** COMPLETE - merged in PR #76 (`95c04c1`)
- **Effort:** Small to medium
- **Sequence:** After HARD-003/HARD-004

#### Problem

Several reusable views hardcode 12-team, Superflex, TE Premium, $1,000, and 30-man labels despite
configurable draft settings. Global metadata also describes every deployment as a 12-team
Superflex tool.

#### Primary locations

- `src/components/AuctionSheet/AuctionHeader.tsx`
- `src/components/BudgetPressure/BudgetPressureView.tsx`
- `src/components/RosterTracker/RosterTracker.tsx`
- `src/app/layout.tsx`

#### Implementation direction

1. Create a shared `describeDraftSettings` formatter.
2. Derive labels from stored team count, budget, roster size, lineup, and scoring settings.
3. Display active value source/projection date and completed/read-only status.
4. Use generic global metadata and optional draft-specific metadata.

#### Acceptance criteria

- 1QB, Superflex, $200, and $1,000 fixtures display truthful labels.
- No league-default string remains in a reusable draft header/caption.

---

## P2 - performance, platform, and maintainability

### HARD-017 - Reduce large client payloads and background work

- **Status:** COMPLETE - merged in PR #79 (`96bd16c`)
- **Effort:** Medium

#### Problem

The value sheet renders the full dense player table, rankings resolution serializes all Sleeper
players when any row is unmatched, polling can overlap and continues in hidden tabs, and some joins
perform repeated linear scans.

#### Primary locations

- `src/components/AuctionSheet/PlayerTable.tsx`
- `src/app/rankings/page.tsx`
- `src/components/RankingsUpload/ResolveUnmatchedList.tsx`
- `src/components/NominationHelper/NominationHelper.tsx`
- `src/components/BudgetPressure/BudgetRefresher.tsx`
- `src/lib/computeTeamStats.ts`

#### Implementation direction

1. Measure RSC payload, rendered nodes, and interaction latency before optimizing.
2. Apply `content-visibility` or virtualization when measurements justify it.
3. Replace the all-player ranking payload with bounded, debounced server search.
4. Abort superseded requests, prevent overlapping polls, and pause polling in hidden tabs.
5. Use maps for player/result joins.
6. Establish payload and interaction budgets with Speed Insights or equivalent telemetry.

#### Acceptance criteria

- Sleeper search sends a bounded result set.
- Polls neither overlap nor run continuously in hidden tabs.
- Value-sheet interactions remain responsive on representative mobile hardware.

#### Residual follow-up

The only remaining work is to create an uptime monitor for
`https://<your-production-domain>/api/health` and alert whenever it returns anything other than
HTTP 200, once production traffic is flowing through the app.

### HARD-018 - Preserve working context in URLs and add route loading states

- **Status:** READY
- **Effort:** Medium

#### Problem

Value-sheet filters/search/sort, roster selection, and nomination position are local state. Refresh,
sharing, and browser navigation lose the operator's context. Most personalized route segments also
lack loading/not-found states.

#### Primary locations

- `src/components/AuctionSheet/AuctionSheet.tsx`
- `src/components/RosterTracker/RosterTracker.tsx`
- `src/components/NominationHelper/NominationHelper.tsx`
- `src/app/draft/[draftId]/`

#### Implementation direction

1. Put primary filters, search, sort, and selected team in query parameters.
2. Debounce search and replace history during transient typing.
3. Keep modal/pending state local.
4. Add segment `loading.tsx`, `not-found.tsx`, and tailored error states.
5. Test refresh, shared URLs, and back/forward restoration.

#### Acceptance criteria

- A copied filtered URL reproduces the working view.
- Back/forward restores meaningful state.
- Route navigation provides immediate pending feedback.

### HARD-019 - Add platform security headers and adopt the Next.js 16 proxy convention

- **Status:** READY
- **Effort:** Medium

#### Problem

`next.config.ts` defines no security headers, and the app still uses the older `middleware.ts`
convention. Request-boundary redirects must remain defense in depth rather than replacing
authorization inside actions/routes.

#### Primary locations

- `next.config.ts`
- `middleware.ts`
- authentication/API smoke tests

#### Implementation direction

1. Add content-type, referrer, permissions, and frame-protection headers.
2. Introduce CSP in report-only mode, review violations, then enforce it with any required nonce
   strategy for Next/Auth.js/Base UI.
3. Migrate to the supported Next.js 16 `proxy.ts` convention.
4. Keep server-action and route authorization independent of proxy behavior.

#### Acceptance criteria

- Security headers are present on application responses.
- Enforced CSP does not break OAuth, dialogs, or styling.
- Direct API/action calls remain authorized independently.

### HARD-020 - Harden database and build-time initialization

- **Status:** READY
- **Effort:** Medium

#### Problem

Prisma/pg initialize at module import, so missing environment values can fail module evaluation
during builds/tooling. Pool size/timeouts are implicit. Production builds also depend on downloading
three Google Font families.

#### Primary locations

- `src/lib/db.ts`
- `src/app/layout.tsx`
- `prisma.config.ts`
- environment/deployment documentation

#### Implementation direction

1. Lazily and centrally initialize Prisma.
2. Configure bounded pool size, connect/idle timeouts, and application name.
3. Use intentional pooled runtime and direct migration URLs where appropriate.
4. Confirm Vercel/Neon region alignment and observe connection counts under load.
5. Self-host WOFF2 fonts with `next/font/local`, or document the accepted networked-build
   dependency explicitly.

#### Acceptance criteria

- Build-time imports do not eagerly require a live database connection.
- Connection use remains bounded under concurrent actions.
- Migration/runtime connection roles are documented.
- Builds are reproducible under documented network assumptions.

### HARD-021 - Repair setup and documentation drift

- **Status:** READY
- **Effort:** Small

#### Problem

README still describes SQLite and old routes/schema. `.env.example` omits required auth/owner
variables. `prisma/seed.ts` catches failures without setting a non-zero exit status, so setup can
appear successful after a failed seed.

#### Primary locations

- `README.md`
- `.env.example`
- `prisma/seed.ts`
- `Makefile`
- `AGENTS.md` and `CLAUDE.md` consistency

#### Implementation direction

1. Update architecture, routes, Postgres/Neon, auth, projections, and setup documentation.
2. Add all required variables with safe placeholders.
3. Make seed failures exit non-zero and make seed behavior transactionally safe where practical.
4. Add a clean-environment setup smoke check.

#### Acceptance criteria

- A new contributor can set up the project from tracked documentation alone.
- Failed migrations/seeds make `make setup` fail.
- README, AGENTS, CLAUDE, and environment examples agree.

### HARD-022 - Decompose oversized modules after behavior is characterized

- **Status:** READY
- **Effort:** Medium
- **Sequence:** After P0 behavior changes in the affected files

#### Problem

The new-draft page, projection application, Sleeper dialog, AuctionSheet, and PlayerTable span
multiple concerns and exceed the repository's preferred component size. Refactoring them while P0
behavior is still moving would increase conflict and regression risk.

#### Primary locations

- `src/app/drafts/new/page.tsx`
- `src/lib/projectionApplication.ts`
- `src/components/SleeperRosterSync/`
- `src/components/AuctionSheet/AuctionSheet.tsx`
- `src/components/AuctionSheet/PlayerTable.tsx`

#### Implementation direction

1. Add characterization tests before moving behavior.
2. Separate draft form schema/state from setting sections.
3. Separate auction filtering, mutation orchestration, and rendering.
4. Separate projection loading, calculation, persistence, and activation.
5. Keep domain logic outside React components.
6. Do not combine decomposition with unrelated behavior changes.

#### Acceptance criteria

- Extracted modules have one named responsibility.
- Characterization tests remain unchanged and green.
- No duplicate state/domain logic is introduced.

---

## Recommended execution order

Do not assign overlapping items to concurrent sessions without explicit coordination.

Completed on `main`: HARD-001 through HARD-006, HARD-008, HARD-009, HARD-010, HARD-011,
HARD-012, HARD-013, HARD-014, HARD-015, HARD-016, and HARD-017.

1. **Integrate current draft/input work:** ~~HARD-007~~
2. **Input/service boundaries:** ~~HARD-008~~ and ~~HARD-009~~ may then run independently
3. **Mutation recovery:** ~~HARD-011~~
4. **Settings truthfulness:** ~~HARD-016~~
5. **Production operations:** ~~HARD-014~~, HARD-019, HARD-020
6. **UX/performance:** ~~HARD-015~~, ~~HARD-017~~, HARD-018
7. **Cleanup:** HARD-021 -> HARD-022

The original P0 gate, HARD-001 through HARD-004, is complete on `main`. The next integration target
is HARD-007; its deferred player read-back optimization is not a correctness blocker.

## Model assignment guidance

The detail in this document is sufficient for capable default-model sessions on many items, but it
is not a substitute for task-specific repository inspection and planning. Assign models according
to reasoning risk rather than raw implementation size.

### Strongest model as primary implementer

Use the strongest available model for work where a locally plausible implementation can still be
subtly wrong across concurrency, migrations, or valuation semantics:

The original strongest-model items (HARD-001, HARD-002, HARD-003, HARD-005, and HARD-006) are
complete and are no longer assignments. Use the strongest model as primary for remaining work only
when HARD-007's deferred optimization changes projection transaction boundaries, or when a new
production migration/concurrency design is added to an existing ticket.

### Default model as implementer, strongest-model review required

The following items are reasonable default-model assignments when scoped to one item and backed by
their required tests, but their architecture or final diff should be reviewed by the strongest
available model before merge:

- ~~HARD-007~~ - draft validation and transaction shortening
- ~~HARD-009~~ - Sleeper service and settings hardening
- ~~HARD-011~~ - bid audit, export, and recovery design
- ~~HARD-014~~ - error ingestion and observability
- ~~HARD-017~~ - performance changes after measurement
- HARD-019 - CSP, security headers, and proxy migration
- HARD-020 - Prisma initialization and serverless pooling
- HARD-022 - behavior-preserving component decomposition

### Default model can own end-to-end

These are sufficiently bounded for a capable default-model session to implement and verify without
a mandatory strongest-model review beyond the repository's normal PR process:

- ~~HARD-008~~ - rankings and CSV validation
- ~~HARD-015~~ - accessibility and contrast
- ~~HARD-016~~ - truthful settings labels
- ~~HARD-017~~ - performance changes after measurement
- HARD-018 - URL state and route loading states
- HARD-021 - setup and documentation repair

Regardless of the primary implementer, require strongest-model review for any PR that materially
changes P0 behavior, production schema/migrations, concurrency/locking, valuation mathematics, or
authentication/security boundaries.

---

## Existing worktree and branch disposition

These findings are based on the branch state observed on 2026-07-16. All three worktrees passed
their own TypeScript, ESLint, and Jest suites, but were not safe to merge into the then-current
`main`. This section is historical: PR #53 superseded Workstreams A and B, PR #67 completed the
remaining same-draft constraints associated with A, and PRs #59/#72 completed the broader CI work
that followed Workstream C.

### Prior Workstream A - Auction Data Integrity

- **Path:** `.claude/worktrees/workstream-a-auction-data-integrity`
- **Branch:** `worktree-workstream-a-auction-data-integrity`
- **Observed head:** `998828d`
- **Merge base with main:** `5336269`
- **Verification:** 73 suites / 584 tests, typecheck, and lint passed
- **Disposition:** SUPERSEDED. Do not merge or rebase this branch; its useful behavior was
  reimplemented and merged through PR #53, with database relationship hardening completed by PR
  #67.

#### Keep as implementation reference

- `requireActiveDraft` for bid actions.
- Server-derived player metadata.
- Positive integer price validation as a starting point.
- Transactional bid creation plus nomination cleanup.
- Explicit duplicate-player conflict handling.
- Rejection of won players from nomination/watchlist POST operations.
- The focused mutation-guard/action/API tests.

#### Do not port unchanged

- `prisma/migrations/20260714150000_unique_auction_result_playerid_draft/migration.sql`.
  Current `main` already creates `AuctionResult(draftId, playerId)` uniqueness in
  `20260714150000_sleeper_roster_sync`; applying A's migration would conflict with current history.
- The earlier name-based uniqueness/helper commits retained in branch history.
- The branch's schema ordering change from `[draftId, playerId]` to `[playerId, draftId]` without a
  query-plan reason.
- The 1,116-line generated re-hardening plan unless it remains useful outside the final PR.

#### Resolution on `main`

- PR #53 added safe-integer/ID validation, affordability and roster-capacity enforcement,
  transactional lifecycle locking, ACTIVE gating across all mutation paths, typed results, and
  real-PostgreSQL concurrency/rollback tests.
- PR #67 added the database-level same-draft team/player/owner constraints.

No integration action remains for this historical worktree; it may be removed after confirming it
contains no private scratch data worth retaining.

### Prior Workstream B - Draft Lifecycle Enforcement

- **Original path:** `.worktrees/workstream-b-draft-lifecycle-enforcement`
- **Original branch/head:** `workstream-b-draft-lifecycle-enforcement` at `25eec18`
- **Clean path:** `.worktrees/workstream-b-draft-lifecycle-clean`
- **Clean branch/head:** `workstream-b-draft-lifecycle-clean` at `826d2c4`
- **Merge base with main:** `2bae0dc` for both
- **Verification:** each passed 65 suites / 531 tests, typecheck, and lint
- **Disposition:** SUPERSEDED. PR #53 reimplemented and merged the lifecycle behavior. Do not merge,
  rebase, or cherry-pick either historical branch as a unit.

The clean branch is the better historical reference because it removes extraneous generated docs,
the duplicate migration, and unrelated quality-gate changes. Its useful lifecycle commits are:

- `72c6b28` - value sheet read-only state.
- `7d208ba` - semantic non-interactive player names in read-only mode.
- `e5413f6` - read-only nomination workspace.
- `e5cabf4` and `826d2c4` - stable UI selectors.
- `a35218a` - auxiliary route lifecycle enforcement.

Do not cherry-pick them blindly. The branch predates stable player-ID UI, onboarding, value spreads,
Sleeper roster sync/catch-up, and later AuctionSheet/NominationHelper changes. Its server helper and
routes are name-based and incompatible with the current identity model. A current implementation
must also hide/block the newer Sleeper and onboarding mutation paths.

HARD-001 is complete on `main`; both B worktrees may be removed after confirming they contain no
private scratch data worth retaining.

### Prior Workstream C - Quality Gate

- **Branch:** `workstream-quality-gate`
- **Merged commit:** `316c59f` (`Exclude local worktrees from quality checks (#44)`)
- **Disposition:** COMPLETE. Do not redo it.

PR #59 removed the generated `coverage/` lint warning and expanded the quality gate; PR #72 added
the remaining browser smoke coverage. No Workstream C follow-up remains.

---

## Legacy A-H mapping

| Prior workstream                             | Current disposition                                                   | Replacement items                      |
| -------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------- |
| A - Auction Data Integrity                   | Superseded; replacement work complete on `main`                       | HARD-002, HARD-005                     |
| B - Draft Lifecycle Enforcement              | Superseded; replacement work complete on `main`                       | HARD-001                               |
| C - Trustworthy Quality Gate                 | Complete, including broader CI and browser coverage                   | HARD-012                               |
| D - Mutation Failure & Concurrency UX        | Mutation UX and bid recovery complete                                 | HARD-010, ~~HARD-011~~                 |
| E - Settings Truthfulness & Navigation State | Valuation and settings truthfulness complete; navigation work remains | HARD-003, ~~HARD-016~~, HARD-018       |
| F - Accessibility & Responsive Performance   | Accessibility complete; responsive performance remains                | ~~HARD-015~~, ~~HARD-017~~             |
| G - Error, API & External-Service Hardening  | Service hardening partly complete; security headers remain            | ~~HARD-009~~, ~~HARD-014~~, HARD-019   |
| H - Codebase Simplification                  | Canonical stats complete; HARD-007 ready; other work remains          | HARD-004, HARD-007, HARD-020, HARD-022 |

New findings without a direct prior-workstream equivalent are HARD-006 (complete), HARD-013
(complete), and HARD-021 (ready).
