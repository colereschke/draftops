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

`AuctionResult` gains `updatedAt` and nullable `deletedAt`. A result with a null `deletedAt` is an
active bid; normal auction, team-statistics, and roster reads must exclude deleted results.

`BidAuditEvent` is append-only and belongs to a draft and bid. It records:

- the event type: `CREATE`, `UPDATE`, `DELETE`, or `RESTORE`;
- the authenticated actor ID and event timestamp; and
- JSON snapshots of the bid before and after the mutation.

Existing results remain active after migration. The audit trail begins at deployment rather than
inventing historical actor or timestamp data.

## Mutation behavior

Bid create, update, delete, and restore run inside the existing active-owned-draft transaction
boundary and advisory lock. Each successful mutation writes its audit event in the same
transaction.

Deleting a bid sets `deletedAt`; it does not remove the auction-result row. An owner can restore a
deleted bid for 30 minutes after its deletion. Restore rechecks that the draft is active, the bid
is still deleted, the player is not actively claimed elsewhere, and the restored bid satisfies
roster and affordability policy. It then clears `deletedAt` and writes a `RESTORE` event.

After 30 minutes, application restoration is rejected with a stable typed outcome. A completed
draft rejects all bid writes, including delete and restore.

## Exports, snapshots, and UI

Owner-authorized draft export endpoints provide JSON and CSV output. CSV contains current active
bids only. JSON includes draft settings, active bids, bid audit events, and a completion snapshot
when one exists.

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
authorization, expiry, completed drafts, duplicate claims, and restore-time roster/budget
legality. Export tests verify ownership isolation, active-only CSV output, and JSON audit/snapshot
content. UI tests cover the recovery control and expired state. A real-PostgreSQL integration test
covers transactional delete/restore behavior.
