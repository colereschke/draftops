# Workstream B — Draft Lifecycle Enforcement Design

## Goal

Once a draft is marked `COMPLETE`, it remains available for historical review but is permanently read-only. There is no reopening flow in this workstream.

## Server-side lifecycle boundary

Draft mutation authorization will use one active-draft guard that first confirms ownership and then requires `status === 'ACTIVE'`. The guard will preserve distinct failure modes: an unauthorized or missing draft remains a not-found error, while an owned completed draft is a conflict that clearly states the draft is no longer active.

Every existing mutation must call this guard before it writes: `logBid`, `updateBid`, `deleteBid`, and both methods of the nomination and watchlist routes. Read queries, including the draft page and nomination-data route, will continue to use the existing ownership-only lookup.

Workstream A already plans a shared `draftMutationGuard.ts` module containing `requireActiveDraft`. Workstream B owns the lifecycle behavior of that helper and its consumers; Workstream A can extend the same module with player, price, and duplicate-bid validation. This avoids two competing active-status helpers and keeps the final mutation boundary centralized.

## Read-only UI

The draft server pages will pass the draft lifecycle state to their interactive children.

On the value sheet, player rows remain inspectable, but clicking them does not open the bid modal. The modal therefore exposes no log, edit, delete, or nominate action for a completed draft. Existing claims and values remain visible.

On the nomination page, rankings, existing watchlist entries, and current nominations remain visible. The helper removes all mutation controls: Watch, Nominate, removal buttons, and the watchlist search-to-add input. It shows an explicit completed/read-only status so the absence of controls is not ambiguous.

No client-only restriction is trusted for integrity; it is a truthful reflection of the server rule. A direct server-action or HTTP request against a completed draft is still rejected.

## Error handling

Server actions throw the same lifecycle error used by the guard. API routes translate that typed error into its conflict response rather than returning a generic 500. Existing unauthenticated and nonexistent-draft behavior remains unchanged. The UI will not issue lifecycle mutations when read-only, but if a completion race occurs during an in-flight request, the existing error path renders a useful failure rather than implying a save.

## Tests

Tests will establish that the active-draft guard rejects completed drafts and that all three bid actions plus both nomination/watchlist route methods stop before their database mutation. Read endpoints remain available for completed drafts.

Component tests will render completed value-sheet and nomination-helper states and assert that mutation controls are absent while historical content is still visible. Active-draft tests will ensure existing controls remain available.

## Scope

This workstream does not add a reopen action, alter completion itself, or address optimistic rollback, pending states, modal keyboard behavior, accessibility, or general request validation. Those changes remain in the audit's later workstreams.
