# HARD-011: Bid history, exports, and bounded recovery

## Purpose

Make live-auction bid changes reconstructable and ordinary accidental deletions reversible without
requiring a database restore. Recovery is intentionally bounded to 30 minutes; durable audit
history and Neon point-in-time recovery remain the fallback for older incidents.

## Scope

HARD-011 adds bid-level audit history, soft deletion with owner-authorized restoration, owner
exports, a completion snapshot, and an operations runbook. It does not add periodic application
snapshots or a general draft-reopen workflow.

## Data model

`AuctionResult` gains `updatedAt`, nullable `deletedAt`, and nullable `supersededAt`. A result with
a null `deletedAt` is an active bid; normal auction, team-statistics, and roster reads must exclude
deleted results. A deleted result with a non-null `supersededAt` is permanently ineligible for
application restoration.

The existing `(draftId, playerId)` unique constraint is replaced by a PostgreSQL partial unique
index for active results only: `(draftId, playerId) WHERE deletedAt IS NULL`. Prisma cannot express
this index, so the migration creates it in SQL. This lets a deleted player be bid on again while
preserving the historical bid row.

`BidAuditEvent` is append-only and belongs to a draft and bid. It records:

- the event type: `CREATE`, `UPDATE`, `DELETE`, `RESTORE`, or `SUPERSEDE`;
- the authenticated actor ID and event timestamp; and
- JSON snapshots of the bid before and after the mutation.

Audit-event payloads include draft ID, bid ID, actor ID, occurrence time, and immutable before/after
snapshots. Application code has no update or delete path for audit rows, and their relation must not
cascade-delete them. Events are exported in `(occurredAt, id)` order. Existing results remain active
after migration. The audit trail begins at deployment rather than inventing historical actor or
timestamp data.

`DraftCompletionSnapshot` is a one-per-draft record containing `capturedAt`, `schemaVersion`, and a
JSON snapshot of draft settings and active bids. It is retained independently of UI presentation.

## Mutation behavior

Bid create, update, delete, and restore run inside the existing active-owned-draft transaction
boundary and advisory lock. Each successful mutation writes its audit event in the same
transaction.

Deleting a bid sets `deletedAt`; it does not remove the auction-result row. The player immediately
becomes available for a new bid. When a new bid claims a player with a restorable deleted result,
that previous result is marked `supersededAt` in the same transaction and receives a `SUPERSEDE`
audit event; it is permanently ineligible for restoration.

An owner can restore an unsuperseded deleted bid for 30 minutes after deletion. Eligibility is
checked under the advisory lock against the database transaction clock, not the client countdown:
`deletedAt > transaction_timestamp() - interval '30 minutes'`. Restore rechecks that the draft is
active, the bid is still deleted, no active claim now exists, and the restored bid satisfies roster
and affordability policy. It then clears `deletedAt` and writes a `RESTORE` event.

After 30 minutes, application restoration is rejected with `RESTORE_WINDOW_EXPIRED`; a superseded
bid returns a distinct stable conflict result. Updating a deleted bid is rejected. A completed draft
rejects all bid writes, including delete and restore. Concurrent restores are idempotently resolved
through the same lock and active-claim constraint.

`completeOwnedDraft` creates the completion snapshot and changes the status to `COMPLETE` in its
single locked transaction. A snapshot failure rolls back completion, so a completed draft can never
lack its promised snapshot.

## Exports, snapshots, and UI

Owner-authorized, no-store draft export endpoints provide JSON and CSV output with attachment
filenames. CSV is UTF-8, uses stable column order and standard escaping, mitigates spreadsheet-formula
injection in text fields, and contains current active bids only. JSON includes draft settings, active
bids, all bid audit events, and a completion snapshot when one exists; timestamps are ISO strings.

The draft view provides bid-history and recovery controls. A deleted bid exposes restoration while
it remains within the 30-minute window, with remaining time visible. After expiry, the interface
directs the owner to the operations recovery procedure. Completing a draft creates a completion
snapshot that remains exportable independently of the UI.

## Operations

An operations runbook documents normal export, the 30-minute restoration rule, recovery after the
window using Neon PITR, and a repeatable restore drill. The runbook states the audit-history
deployment boundary explicitly.

## Verification

Unit and action tests cover audit events and before/after snapshots for every bid mutation,
authorization, expiry boundaries, completed drafts, duplicate claims, and restore-time
roster/budget legality. They also cover atomic rollback when an audit insert fails, an update attempt
against a deleted bid, and supersession when a player is newly claimed during the recovery window.

Export tests verify ownership isolation, active-only CSV output, injection-safe escaping,
deterministic event order, and JSON audit/snapshot content. UI tests cover the recovery control and
expired/superseded states. Query-level tests inventory every normal reader to ensure it filters
deleted bids. Real-PostgreSQL integration tests cover the partial unique index, delete-versus-new
claim/restore, restore-versus-completion, audit rollback, and completion-snapshot rollback.
