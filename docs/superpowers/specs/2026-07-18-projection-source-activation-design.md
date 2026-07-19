# Explicit Projection-Source Activation Design

## Goal

Make draft projection values explicitly versioned and atomically activated so an incomplete or
failed reapplication can never become visible. Preserve an auditable activation history while
bounding the bulk player-value data retained for each draft.

## Current Failure Mode

`DraftPlayerValue` rows are currently keyed by draft, player, and projection source. Readers load
all rows for a draft and infer the active source from the newest `updatedAt` timestamp.

Existing-draft application writes those rows in batches. The first successful batch can therefore
make an incomplete source appear active. Reapplying the same projection source is worse: it updates
rows that readers may already consider active, so adding only `Draft.activeProjectionSourceId`
would not isolate the partial write.

## Decision

Introduce a versioned, per-draft projection value set for every application run. A value set owns
the complete candidate `DraftPlayerValue` collection and records the source, lifecycle, counts,
and timestamps for that run. `Draft` points to exactly one active value set.

Candidate rows remain invisible while their set is staging. After persistence and validation, one
short PostgreSQL transaction locks the draft, revalidates the candidate, marks it active, archives
the previous active set, and flips the draft pointer. Reapplying the same `ProjectionSource`
creates a new value-set version rather than modifying the active version.

This work does not add end-user projection-source selection or rollback UI.

## Schema

Add a `DraftProjectionValueSetStatus` enum:

- `STAGING`: candidate creation or persistence is in progress.
- `ACTIVE`: the set referenced by its draft's active pointer.
- `ARCHIVED`: a previously active successful set.
- `FAILED`: application failed before activation.

Add `DraftProjectionValueSet` with:

- `id`
- `draftId`
- nullable `projectionSourceId` (required for all newly created sets; nullable only for migrated
  legacy null-source rows)
- `status`
- `expectedPlayerCount`
- `appliedPlayerCount`
- `createdAt`
- `activatedAt`
- `failedAt`
- `failureCode`
- `failureMessage`

Add nullable `Draft.activeProjectionValueSetId` and its relation to
`DraftProjectionValueSet`. It is nullable only for migration compatibility and drafts that have
not successfully received projection values.

Add required `DraftPlayerValue.valueSetId`. Change value-row identity from
`(draftId, playerId, projectionSourceId)` to `(valueSetId, playerId)`. Retain `draftId` and
`projectionSourceId` on each row for efficient filtering and source context, with database
constraints ensuring the referenced player and value set belong to the same draft. The migration
must backfill one successful value set for each existing `(draftId, projectionSourceId)` group,
choose the currently inferred group as active using the existing timestamp rule, point each draft
to that set, and preserve all existing values.

The schema must prevent cross-draft pointer and value-set relationships. This should use composite
uniques and foreign keys rather than relying only on application checks. Add a PostgreSQL partial
unique index allowing at most one `ACTIVE` set per draft; the activation transaction keeps that row
and the draft pointer consistent.

## Application Flow

### Calculation and staging

`applyProjectionValuesToDraft` continues to resolve the requested or latest projection source,
load draft settings and players, resolve Sleeper IDs, join available projections, and calculate
projection-shaped values.

Before writing value rows, it creates a `STAGING` value set with the expected joined-player count.
It then writes rows in bounded batches under the new set. Existing active rows are never updated or
deleted during this phase.

Sleeper ID updates are independent identity maintenance. During new-draft creation they remain
inside the outer draft transaction. During an existing-draft reapplication they must not be used as
an activation signal and may complete before value-set activation without changing surfaced
values.

### Validation

Before activation, validate both the calculated candidate and its persisted representation:

- at least one draft player joined the source;
- every calculated output that must be numeric is finite;
- every joined player produced exactly one persisted value row;
- persisted row count equals both expected and applied counts;
- all rows reference the candidate draft, source, and value set;
- no player occurs more than once in the set;
- the set is still `STAGING`.

Players without a projection row remain valid omissions and continue to use `Player.budget`.
Expected count therefore means joined players, not every player in the draft.

### Atomic activation

Activation runs in one short PostgreSQL transaction:

1. Acquire the existing namespaced per-draft advisory lock used by draft mutation boundaries.
2. Reload the draft, candidate set, and persisted candidate count inside the transaction.
3. Reject a candidate that is no longer `STAGING`, belongs to another draft/source, or fails its
   count invariants.
4. Mark the previously active set `ARCHIVED`, if one exists.
5. Mark the candidate `ACTIVE`, record `activatedAt`, and set its applied count.
6. Update `Draft.activeProjectionValueSetId` to the candidate ID.

The status changes and pointer flip commit together. Concurrent applications serialize at this
boundary. The last successfully activated candidate may become active, but neither application can
expose a partial set.

When `applyProjectionValuesToDraft` receives a Prisma transaction client during draft creation or
budget backfill, staging and activation participate in that caller's transaction. It must not open
nested transactions. The existing `useBatchTransaction` compatibility option should be replaced
or narrowed so the transaction behavior is explicit and type-safe.

## Failure Handling

Failures before candidate creation leave no application record. Failures after candidate creation
leave the draft's active pointer unchanged.

For root-client existing-draft applications, catch calculation, persistence, validation, and
activation errors; delete partial candidate value rows and mark the candidate `FAILED` with a
stable failure code, concise failure message, and `failedAt`. Cleanup failures must not replace the
original error, but should be included in operational logging.

For applications running inside an outer transaction, propagate the error so the caller rolls back
the candidate, rows, and any related draft/player changes together. No separate failed audit row is
expected when the containing transaction itself never commits.

Stable failure categories are:

- `NO_PROJECTION_SOURCE`
- `NO_JOINED_PLAYERS`
- `INVALID_CALCULATION`
- `PERSISTED_COUNT_MISMATCH`
- `ACTIVATION_CONFLICT`
- `PERSISTENCE_FAILURE`

The existing CLI should print the value-set ID, projection source ID, applied player count, and
activation timestamp on success. Errors remain fatal and produce a non-zero exit.

## Read Path

`getActiveDraftPlayers` obtains the draft's `activeProjectionValueSetId` and loads only
`DraftPlayerValue` rows for that set. It must not load archived, staging, or failed rows and must no
longer order value rows by `updatedAt`.

`mapPlayersWithDraftValues` maps the already-selected active rows and no longer infers an active
source. If the draft has no active set, or an individual player has no row in it, the existing
fallback mapping uses `Player.budget`, `ceiling`, and `floor`.

All draft pages and the nomination-data API already use `getActiveDraftPlayers`, so the canonical
service remains the sole active-value loader.

## Retention and Auditability

Activation metadata is retained indefinitely. Full `DraftPlayerValue` rows are retained for:

- the active set; and
- the three most recently activated archived sets for the same draft.

After successful activation, best-effort pruning deletes value rows for older archived sets while
leaving their `DraftProjectionValueSet` records intact. Failed candidates have partial rows removed
immediately. Pruning must never delete rows belonging to the active set, a staging set, or any of
the three retained archived sets.

Retention cleanup occurs after activation commits. A cleanup failure does not roll back a valid
activation; it is reported operationally and can be retried safely. The retained-history count is
a named constant, initially `3`.

## Backfill and Compatibility

The migration must preserve the active values seen immediately before deployment:

1. Group existing non-null-source rows by draft and projection source.
2. Create one value-set record per group.
3. Determine each draft's active group using the current newest-row `updatedAt` rule.
4. Mark that group `ACTIVE`, set activation/count metadata, and point the draft to it.
5. Mark other groups `ARCHIVED`.
6. Attach every existing row to its generated set.
7. Add required constraints only after successful backfill.

Existing null-source value rows are not created by current application code. If any exist in a
deployed database, migrate them to an archived compatibility set with no active pointer preference;
the normal `Player` row remains the authoritative fallback.

Budget-value backfill snapshots must include value-set and active-pointer metadata. Reapplying
projections from the budget backfill creates and activates a new set inside that draft's existing
transaction, so a failure rolls back both fallback-value changes and projection activation.

## Testing

### Unit tests

- A new application creates a staging set and writes rows keyed to it.
- Reapplying the same projection source creates a distinct set.
- Candidate validation rejects zero joins, invalid calculations, count mismatches, duplicate
  players, and draft/source mismatches.
- Activation archives the previous set and flips the pointer together.
- Mapping uses only rows supplied by the canonical active-set query and retains per-player
  fallback behavior.
- Retention preserves the active set and three newest archived sets while deleting only older
  value rows.
- CLI results expose set ID, source ID, count, and activation timestamp.
- Budget-backfill planning and snapshots preserve the new metadata.

### PostgreSQL integration tests

- Inject a failure after at least one staging batch and verify the previous set and all its rows
  remain active and unchanged.
- Reapply the same source and verify readers see either the complete old set or complete new set,
  never a mixture.
- Race two candidate activations and verify pointer/status consistency under the advisory lock.
- Force activation failure and verify no staged set becomes active.
- Verify migration constraints reject cross-draft active pointers and value-set/player relations.
- Verify budget fallback updates and projection activation roll back together.

### Quality gate

Run focused Jest suites throughout development, the real-PostgreSQL integration suite for
transactional behavior, and `make check` before review.

## Documentation

Update `AGENTS.md` and `README.md` to describe explicit active value sets, activation metadata,
failure isolation, and retention. Update `docs/draftops-audit-workstreams.md` only when the
implementation and required verification are complete.
