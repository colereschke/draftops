# DraftOps Audit Workstreams

Audit date: 2026-07-14

This document breaks the codebase audit into largely independent workstreams that can be assigned to concurrent sessions. The recommended order is: data integrity and lifecycle first, then test tooling, then reliability and UX. Avoid combining unrelated fixes in one PR.

## Workstream A — Auction Data Integrity

Priority: P0

Goal: make it impossible for normal retries, double-clicks, or crafted requests to corrupt auction state.

### Issues

1. A player can have multiple `AuctionResult` records in a draft.
   - `AuctionResult` has no `@@unique([player, draftId])` constraint.
   - `logBid` unconditionally calls `create`.
   - Impact: duplicate wins corrupt spend, roster counts, buying power, tendencies, and dynamic pick values.
   - Files: `prisma/schema.prisma`, `src/lib/actions.ts`.

2. Bid actions trust client-provided player metadata and price.
   - `logBid` accepts player, position, NFL team, rank, price, and team ID as authoritative.
   - `updateBid` accepts an unbounded price.
   - A crafted server-action request can create a non-pool player, use an invalid position, or submit an unreasonable/negative price.

3. Nominated/watchlist endpoints accept arbitrary names.
   - They do not check that the player belongs to the draft, remains available, or is eligible for the requested transition.

### Suggested approach

- Add a unique constraint for `(player, draftId)` and migrate existing duplicate data deliberately if it exists.
- Resolve the `Player` record by name and draft ID inside `logBid`; derive position/team/rank from the database rather than client input.
- Validate every action/route payload at the server boundary. A shared schema layer is preferable to duplicated ad hoc checks.
- Require positive integer prices, valid team ownership, an available player, and a draft in `ACTIVE` status.
- Treat the bid insert and nominated-player cleanup as one transaction.
- Decide the desired behavior for a duplicate insert: a clear conflict error is safer than silently overwriting a bid.

### Tests to add

- Duplicate log requests for one player produce exactly one winner.
- Invalid player, position, team, price, and draft ID are rejected.
- Nominated/watchlist APIs reject unknown and already-won players.
- A failed insert leaves nomination state unchanged.

## Workstream B — Draft Lifecycle Enforcement

Priority: P0

Goal: a completed draft is genuinely read-only.

### Issue

`completeDraft` sets `Draft.status = COMPLETE`, but bid actions and nomination/watchlist routes only check ownership. Completed drafts can still change through both the UI and direct requests.

### Suggested approach

- Centralize an `assertActiveDraftForUser` helper or extend `getDraft` with an explicit active requirement.
- Enforce it for bid, watchlist, nomination, and future mutating actions.
- Update the completed-draft UI to read-only state: no bid editing, nomination, watchlist mutations, or completion action.
- Consider whether reopening a completed draft is a supported explicit action; do not make it implicit.

### Tests to add

- Every mutation rejects a completed draft.
- Completed routes retain read access but expose no mutation controls.

## Workstream C — Restore a Trustworthy Quality Gate

Priority: P1

Goal: `pnpm lint` and `pnpm test` must evaluate only this checkout.

### Issue

The nested `.worktrees/` directory is not excluded by ESLint or Jest. Lint reaches an old reference file. Jest runs both checkouts and loads a second React dependency, causing invalid-hook-call failures and false test failures.

### Suggested approach

- Add `.worktrees/**` to `eslint.config.mjs` ignores.
- Add `<rootDir>/.worktrees/` to Jest `testPathIgnorePatterns`; if necessary also configure haste/module discovery to ignore it.
- Check whether similar local checkouts need a general convention rather than a one-off ignore.
- Run `pnpm lint`, `pnpm test --runInBand`, `pnpm typecheck`, and `pnpm format:check` after the change.

### Acceptance criteria

- No test path or lint diagnostic comes from `.worktrees/`.
- The full suite’s output is stable when a worktree exists locally.

## Workstream D — Mutation Failure & Concurrency UX

Priority: P1

Goal: live-draft interactions are resilient, keyboard-friendly, and honest about save state.

### Issues

- Nomination helper mutations have no network-error `try/catch`; optimistic state can remain incorrect.
- The value-sheet nomination request has no rejection handler, so failed requests can leave a false LIVE state.
- Rapid Watch/Nominate clicks can create duplicate local entries even though server upserts are idempotent.
- The bid modal is not a form: Enter in the Price input does not submit.
- Bid action controls remain active during mutation, making duplicate submissions easy.
- Removing a bid is immediate and destructive.

### Suggested approach

- Wrap each fetch in `try/catch/finally`, restore optimistic snapshots on any failure, and show a visible error state.
- Maintain per-player pending state and disable duplicate actions while a request is in flight.
- Make BidModal a semantic `<form>` with `onSubmit`; use a pending state for submit/delete.
- Provide confirmation or an undo window for deletion.
- Clear the client-only nomination overlay once a bid succeeds or a refresh confirms it.

### Tests to add

- Rejected fetch and thrown fetch both roll back optimistic state.
- Double-clicking nomination/watch/bid does not duplicate visible state or results.
- Enter submits a valid bid; controls disable during save.
- Delete requires confirmation or supports undo.

## Workstream E — Settings Truthfulness & Navigation State

Priority: P1/P2

Goal: a custom draft is represented accurately and its working state survives refreshes.

### Issues

- Value Sheet, Budget Pressure, and Team Rosters hard-code league characteristics such as 12 teams, $1,000, and 30-man rosters.
- Filters, search, sort, notes, available-only, roster selection/sort, and nomination position filter are component-local state only.

### Suggested approach

- Pass actual draft settings to every header/caption and make terminology work for non-Superflex/non-TE-premium leagues where supported.
- Put shareable/recoverable controls in URL query parameters, with sensible defaults.
- Preserve selected team and active draft-table state after refresh/back navigation.

### Acceptance criteria

- No visible hard-coded default appears in a custom-settings draft.
- Copying a page URL restores its primary controls.

## Workstream F — Accessibility & Responsive Performance

Priority: P2

Goal: support keyboard and assistive-tech use while keeping live pages responsive.

### Issues

- The player and nomination tables render hundreds of rows without virtualization/content visibility.
- Async errors, save outcomes, and auto-refresh status are not announced with `aria-live`.
- There is no skip link/main landmark strategy, and the dark application does not declare `color-scheme: dark`.
- Several search/filter inputs rely on placeholders instead of explicit accessible labels.
- Form inputs generally omit useful `name`/`autocomplete` metadata.

### Suggested approach

- Introduce virtualization or a progressive rendering strategy for large tables; measure filtering/sort responsiveness on mobile.
- Add an `aria-live="polite"` status area for loading, saving, errors, and refresh feedback.
- Add a skip link targeting a `<main id="main-content">` landmark.
- Set `color-scheme: dark` and explicit native-control colors.
- Give every field a programmatic label and appropriate names/autocomplete behavior.

### Tests to add

- Keyboard traversal and activation of main controls.
- Async save/error status is announced.
- Large player lists render within an agreed performance budget.

## Workstream G — Error, API, and External-Service Hardening

Priority: P2

Goal: errors are useful without leaking internals, and external failures fail predictably.

### Issues

- Error boundaries render raw `error.message` to users.
- `/api/log-error` is unauthenticated and rate-unlimited; it can be used to forge/noise server logs.
- Sleeper requests have no abort timeout, so an upstream stall can leave import pending indefinitely.
- Route JSON parsing and parameter validation are inconsistent; malformed requests can become generic 500s.

### Suggested approach

- Show a stable, actionable generic error to users; preserve diagnostic detail in structured server logging/observability.
- Rate-limit error ingestion and restrict/normalize fields in production.
- Add a timeout via `AbortSignal.timeout` or an `AbortController` around Sleeper calls and map timeout errors to a clear UI message.
- Create shared helpers for safe JSON parsing and positive integer route parameters.

## Workstream H — Codebase Simplification

Priority: P2

Goal: reduce drift and unnecessary work before it becomes a correctness issue.

### Opportunities

- `src/lib/budget.ts` and `src/lib/computeTeamStats.ts` duplicate core budget/roster calculations with different outputs and behavior.
- `computeTeamStats` repeatedly uses `players.find` for every bid; construct a player map once.
- Consider a shared draft mutation service that owns authorization, active-status checks, validation, transaction handling, and revalidation.

### Suggested approach

- Consolidate team-stat calculation around a single core function with narrowly shaped adapters for each view.
- Preserve existing semantics with characterization tests before refactoring.
- Keep this work separate from Workstreams A/B unless the shared service materially reduces duplication in the same PR.

## Cross-workstream sequencing

1. Complete Workstream A before Workstream D: UI retries and optimistic behavior need a server-side integrity backstop.
2. Complete Workstream B alongside A if practical; both establish mutation policy.
3. Complete Workstream C early so all subsequent sessions have reliable validation.
4. Workstreams E–H can proceed independently after A/B, except for any shared mutation helper introduced by H.

## Audit validation notes

- `pnpm typecheck` passed.
- Browser verification reached the sign-in page with no error overlay or recorded console errors.
- Current lint/test failures are not reliable indicators of the active checkout until Workstream C excludes nested worktrees.
