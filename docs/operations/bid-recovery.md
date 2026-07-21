# Bid recovery runbook

Use this runbook for a DraftOps auction bid that was deleted accidentally, or for an
incident discovered after the in-app recovery window. Do not use a database restore as a
substitute for the normal restore action.

## Normal operator actions

The draft owner can download the current records while signed in:

- JSON archive: `/api/draft/<draftId>/export/json`
- Active-bid CSV: `/api/draft/<draftId>/export/csv`

Both endpoints are owner-authorized, return an attachment, and are deliberately
`Cache-Control: no-store`. Save the JSON export before making an operational change. It
contains draft settings, active bids, the ordered audit history, and the completion snapshot
when one exists. The CSV is a spreadsheet-safe view of active bids only; it is not a recovery
archive.

## In-app restoration

Deleting a bid removes it from every normal auction view immediately, so that player can be
claimed again. A deleted bid can be restored only when all of these conditions hold:

1. The requester owns the draft and the draft is still `ACTIVE`.
2. The bid has not been superseded by a new active claim for that player.
3. PostgreSQL's transaction clock is strictly less than 30 minutes after `deletedAt`:
   `deletedAt > transaction_timestamp() - interval '30 minutes'`.
4. The original team can still afford the bid and has roster capacity.

The browser countdown is presentation only. The database transaction clock is authoritative;
at exactly 30 minutes, restoration is no longer available. If a new bid was recorded for the
same player, the old bid is permanently superseded and cannot be restored. Its audit history is
retained.

## Completion snapshot and audit boundary

When an owner completes a draft, DraftOps atomically writes one `DraftCompletionSnapshot` before
changing the draft status to `COMPLETE`. If snapshot creation fails, completion rolls back. The
snapshot is included in the JSON export and is a convenient final-auction reference; it does not
replace the audit log or database backups.

`BidAuditEvent` history begins when the HARD-011 migration is deployed. Auction results that
existed before that deployment remain active, but no synthetic pre-deployment `CREATE` events
were generated. Treat the migration deployment timestamp as the audit-history boundary and use
an older database backup or source records for events before it.

## Recovery after the window: Neon PITR

For a deletion older than 30 minutes, a superseded bid, or broader data corruption, use Neon
point-in-time recovery (PITR). This is an operator procedure, not an application action.

1. Export the affected draft's JSON from production and record the draft ID, incident time, and
   intended recovery point.
2. In Neon, create a **new branch** restored to a point immediately before the bad write. Never
   overwrite, rewind, or repoint the production branch during investigation.
3. Connect tooling only to that restored branch. Verify its schema includes the HARD-011
   migrations before reading data.
4. Run the validation queries below against the restored branch and compare their output with the
   production JSON export. Determine the smallest safe correction (normally a targeted replay or
   a manually reviewed SQL change), rather than promoting the restored branch wholesale.
5. Have a second operator review the proposed correction and its expected active-bid/audit
   effects. Apply it through an approved, reversible change process and immediately take another
   JSON export.

PITR availability and retention depend on the Neon plan and branch configuration. Confirm both
before an incident; do not promise a recovery point that Neon cannot provide.

## Restore drill

Perform this drill periodically on a non-production Neon branch:

1. Create or select a disposable draft, log a bid, export its JSON, and record the bid ID.
2. Delete the bid and verify the player is available to bid again. Restore it within 30 minutes
   and verify the `DELETE` then `RESTORE` events appear in the JSON archive.
3. Repeat with a replacement bid for the same player. Verify the old bid becomes superseded and
   cannot be restored.
4. Complete the draft and verify the JSON archive contains exactly one completion snapshot.
5. Create a separate Neon branch restored to before one of those writes. Run the queries below,
   compare with the saved archive, then discard the branch. Do not perform this drill by restoring
   or overwriting production.

## Validation queries

Set `:draft_id` to the affected numeric draft ID in `psql` (for example,
`\\set draft_id 42`). Run these against the production branch for a baseline and the restored
branch for comparison.

```sql
SELECT id, name, status, "createdAt"
FROM "Draft"
WHERE id = :draft_id;

SELECT count(*) AS active_bid_count,
       coalesce(sum(price), 0) AS active_bid_total
FROM "AuctionResult"
WHERE "draftId" = :draft_id
  AND "deletedAt" IS NULL;

SELECT type, count(*) AS event_count
FROM "BidAuditEvent"
WHERE "draftId" = :draft_id
GROUP BY type
ORDER BY type;

SELECT id, "capturedAt", "schemaVersion"
FROM "DraftCompletionSnapshot"
WHERE "draftId" = :draft_id;

SELECT id, "bidId", type, "actorId", "occurredAt"
FROM "BidAuditEvent"
WHERE "draftId" = :draft_id
ORDER BY "occurredAt", id;
```

Before closing the incident, reconcile the active bid count and total, audit-event sequence, and
completion-snapshot presence with the owner. Preserve the incident export and the reviewed change
record with the draft's operational notes.
