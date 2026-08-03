# HARD-022 Auction Workspace Decomposition

## Scope

This is the first staged HARD-022 PR. It refactors only the AuctionSheet and PlayerTable
workspace. Draft creation, projection application, and Sleeper roster synchronization remain out
of scope for this change.

The refactor must preserve all current user-visible behavior, route/API contracts, database
behavior, URL state, accessibility attributes, and stable `data-testid` selectors.

## Architecture

`AuctionSheet` becomes the composition boundary. It continues to own URL-backed view state,
nomination state, modal visibility, and Sleeper-dialog visibility, but delegates domain
derivations, bid mutation orchestration, and table rendering.

### Pure auction selectors

Create an `auctionSelectors.ts` module for the derived data currently interleaved with React
state:

- player and bid identity keys;
- claim and nominated sets;
- filtered and sorted player lists, including existing null ordering and rank tie-breaks;
- owner spending, open-position statistics, total player count, and future-pick metadata.

These functions receive data explicitly and have no React, navigation, or server-action
dependencies.

### Bid mutation orchestration

Create `useAuctionBidMutations.ts` for optimistic bid add/update/delete state, server-action
execution, typed error-to-message mapping, and refresh recovery. The hook exposes the optimistic
claims, modal callbacks, status/error state, and pending state needed by the coordinator.

It does not own display filters, sorting, or nomination requests; those remain with
`AuctionSheet` because they are separate view and live-nomination concerns. It accepts a narrow
successful-create callback so `AuctionSheet` retains nomination cleanup and onboarding state. The
existing success sequence remains intact: clear the LIVE state, await onboarding completion, then
close the modal; an onboarding failure follows the current mutation-recovery path.

### Table rendering

Split the current table presentation into focused `PlayerTableHeader` and `PlayerTableRow`
components. `PlayerTable` continues to own table-level layout and maps supplied players to rows.
The extracted components retain the existing DOM structure, interactive behavior, and test IDs.

## Data flow

Server-provided players and claimed bids enter `AuctionSheet`. The mutation hook overlays
optimistic bid changes. Selector functions derive claims, filtering/sorting, header metrics, and
nomination state. `AuctionSheet` passes the derived list and display state to `PlayerTable`; row
clicks open the existing bid modal. Successful or failed mutations retain the existing status,
refresh, and read-only behavior.

## Error handling

The existing stable mutation messages and authorization redirect remain unchanged. Server-action
failures, network failures, and optimistic recovery continue to refresh the route as they do
today. No new error types or client-facing messages are introduced.

## Testing

Tests focus on application behavior, not the mechanics of extraction:

- retain the existing AuctionSheet and PlayerTable tests unchanged where they already describe a
  user-visible contract;
- add application-level interactions for a successful bid edit and removal, asserting the existing
  action payload and resulting modal/status behavior; extend the delete-failure scenario to retain
  its route-refresh recovery contract;
- add targeted selector tests only for important existing rules without direct coverage: null
  ordering for generic, spread, and claimed-price sorts; claimed-player exclusion from open
  positional totals; and PICK/PKG exclusion from the player count;
- retain a component-level assertion that search filters the visible table immediately even though
  URL synchronization is debounced;
- verify mutation recovery through existing component-level interactions rather than testing hook
  internals;
- do not add tests for component boundaries, forwarding props, implementation call counts, or
  private file layout.

The required validation is targeted Jest coverage during development followed by `make check`.

## Non-goals

- No changes to auction legality, server actions, API routes, schema, or database transactions.
- No visual redesign, selector renaming, or accessibility-contract changes.
- No new global state, context, or reducer architecture.
- No decomposition of the draft form, projection service, or Sleeper dialog in this PR.
