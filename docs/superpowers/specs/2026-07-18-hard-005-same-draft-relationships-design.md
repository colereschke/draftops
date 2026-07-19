# HARD-005 Same-Draft Relationships Design

Date: 2026-07-18

## Summary

DraftOps scopes auction data by `Draft`, but several child tables separately store `draftId`
alongside a `teamId` or `playerId` whose existing single-column foreign key can point to a row from
another draft. This change makes the draft boundary part of those relationships at the PostgreSQL
layer. It also removes nullable player identity from bids, watchlists, and nominations because all
current writers already resolve a real draft-scoped player.

Application ownership and same-draft lookups remain in place as defense in depth. The database
becomes the final authority when application checks are bypassed, a script is incorrect, or a
future writer omits the expected filter.

## Production audit

A read-only audit ran against the production Neon database through its direct endpoint on
2026-07-18. The audit opened an explicit read-only transaction, applied a 15-second statement
timeout, and returned only relationship labels and aggregate counts.

The following relationships had zero orphaned or cross-draft references:

- `Draft.ownerTeamId -> Team(draftId)`
- `AuctionResult.teamId -> Team(draftId)`
- `AuctionResult.playerId -> Player(draftId)`
- `PlayerWatchlist.playerId -> Player(draftId)`
- `NominatedPlayer.playerId -> Player(draftId)`
- `DraftPlayerValue.playerId -> Player(draftId)`

One `AuctionResult` had a null `playerId`. A second read-only query found exactly one same-draft
player whose name matches that bid, so the row can be backfilled deterministically. Watchlist and
nomination rows had no null player IDs.

At audit time, the relevant approximate production row counts were 4 drafts, 48 teams, 1,563
players, 280 auction results, 16 nominations, 0 watchlist rows, and 607 draft player values. These
sizes make ordinary candidate-key creation acceptable, while foreign keys should still use the
lower-lock `NOT VALID` then `VALIDATE CONSTRAINT` sequence.

## Goals

- Reject every cross-draft owner-team, bid-team, and player-backed relationship in PostgreSQL.
- Backfill valid legacy name-only rows and require stable player identity going forward.
- Abort migration with a relationship-specific message if unexpected legacy violations exist.
- Preserve application ownership checks and existing valid behavior.
- Add only draft-leading indexes that common queries need and do not already have.
- Prove the migration and constraints against real PostgreSQL rather than mocked Prisma calls.

## Non-goals

- Redesigning draft ownership or removing `draftId` from child tables.
- Changing API payloads, user-facing errors, or UI behavior.
- Automatically guessing ambiguous player matches or quarantining unknown production data.
- Adding cascading deletion or a general draft-deletion workflow.
- Refactoring unrelated draft queries or domain types.

## Schema design

`Team` and `Player` receive `@@unique([id, draftId])` candidate keys. The primary IDs remain the
normal application identifiers; the compound keys exist so PostgreSQL can enforce tenant/draft
membership in referencing rows.

The following relations become compound foreign keys:

| Relationship            | Referencing columns                   | Referenced columns    |
| ----------------------- | ------------------------------------- | --------------------- |
| Draft owner team        | `Draft(ownerTeamId, id)`              | `Team(id, draftId)`   |
| Bid team                | `AuctionResult(teamId, draftId)`      | `Team(id, draftId)`   |
| Bid player              | `AuctionResult(playerId, draftId)`    | `Player(id, draftId)` |
| Watchlist player        | `PlayerWatchlist(playerId, draftId)`  | `Player(id, draftId)` |
| Nomination player       | `NominatedPlayer(playerId, draftId)`  | `Player(id, draftId)` |
| Projection value player | `DraftPlayerValue(playerId, draftId)` | `Player(id, draftId)` |

The installed Prisma 7.8 validator accepts the overlapping relation shape, including the optional
owner-team relation that reuses `Draft.id` and the bid relations that reuse
`AuctionResult.draftId`.

`AuctionResult.playerId`, `PlayerWatchlist.playerId`, and `NominatedPlayer.playerId` become required
columns and required Prisma relations. `DraftPlayerValue.playerId` is already required.
`Draft.ownerTeamId` remains optional, but any non-null value must identify a team whose `draftId`
equals the draft's own `id`.

The direct child-to-draft foreign keys remain. The old single-column team, player, and owner-team
foreign keys are replaced by compound equivalents rather than retained as duplicates. Compound
relations use `ON DELETE RESTRICT` and `ON UPDATE RESTRICT`. Deleting a referenced player or team,
or changing a referenced ID/draft-membership pair, is therefore forbidden until its historical
children are handled intentionally.

`AuctionResult.player` and the `playerName` columns remain as immutable display/history snapshots.
They no longer serve as runtime identity fallbacks after the migration.

## Migration design

The migration is transactional and performs these stages in order:

1. Audit every target relationship for missing parents and cross-draft references.
2. Classify null bid, watchlist, and nomination player references by same-draft name-match count.
3. Abort before schema changes if any null reference has zero or multiple candidate players.
4. Backfill references that have exactly one candidate in the same draft.
5. Repeat the relationship audit and abort if any orphan, cross-draft reference, or null remains.
6. Set bid, watchlist, and nomination `playerId` columns to `NOT NULL`.
7. Create the `Team(id, draftId)` and `Player(id, draftId)` candidate keys.
8. Drop the superseded single-column owner-team, team, and player foreign keys.
9. Add the compound foreign keys as `NOT VALID` constraints.
10. Validate each new constraint before committing.
11. Add the missing draft-leading query indexes.

Preflight failures identify the relationship and violation class with an aggregate count. They do
not print player names, team handles, owner IDs, or other production data. The migration does not
repair cross-draft rows or ambiguous matches automatically. PostgreSQL rolls the whole migration
back if any preflight, DDL, or validation step fails.

PostgreSQL documents compound foreign keys and the `NOT VALID` / `VALIDATE CONSTRAINT` deployment
pattern used here:

- <https://www.postgresql.org/docs/current/ddl-constraints.html>
- <https://www.postgresql.org/docs/current/sql-altertable.html>

## Index design

The production index audit found usable draft-leading indexes for:

- `Team`, through `(draftId, sleeperRosterId)`
- `AuctionResult`, through `(draftId, playerId)`
- `Player`, through `(draftId, futurePickOriginHandle)`
- `DraftPlayerValue`, through both `(draftId)` and its compound unique key

`PlayerWatchlist` and `NominatedPlayer` only have indexes beginning with player name or player ID,
so they receive explicit `(draftId)` indexes. No redundant draft-only index is added to the other
tables.

The implementation will record `EXPLAIN` evidence for representative `WHERE draftId = ...`
queries. Small production tables may correctly choose sequential scans; acceptance depends on a
usable draft-leading access path being available, not forcing PostgreSQL to choose an index for a
tiny result set.

## Application impact

Existing actions and routes already find players and teams with both the row ID and draft ID. Those
checks stay unchanged except where stronger generated types make a nullable fallback unnecessary.
Application code continues returning its existing typed outcomes such as `PLAYER_NOT_FOUND` and
`TEAM_NOT_FOUND` before reaching the database in normal request flows.

Shared domain types for persisted bids, roster rows, and claimed bids change `playerId` from
optional/nullable to required where the database guarantees it. Loaders can map IDs directly
instead of dropping null entries. Test fixtures that intentionally model identity-less historical
records are updated or moved to migration-specific coverage.

If application checks are bypassed, PostgreSQL rejects cross-draft writes as foreign-key
violations. This is an infrastructure failure for an internal invariant breach, not a new
client-visible business outcome. No route or component behavior changes are part of HARD-005.

## Test strategy

Behavior changes begin with failing real-PostgreSQL tests before schema or migration changes.

### Constraint integration tests

Create two complete draft fixtures and attempt each invalid write directly through Prisma:

- Set a draft's owner to the other draft's team.
- Create a bid using the other draft's team.
- Create a bid using the other draft's player.
- Create a watchlist entry using the other draft's player.
- Create a nomination using the other draft's player.
- Create a draft player value using the other draft's player.

Each write must fail at the database layer and leave no invalid row. Matching same-draft writes
must continue to succeed. Deleting a referenced team or player must fail because of `RESTRICT`.

### Migration integration tests

Run the actual migration SQL against an isolated real-PostgreSQL schema representing the
immediately preceding migration state:

- A uniquely matchable null player reference is backfilled and the migration succeeds.
- An unmatched null reference aborts with its relationship name and leaves the schema unchanged.
- An ambiguous null reference aborts rather than guessing.
- A cross-draft relationship aborts with its relationship name and leaves the schema unchanged.

### Regression and validation

- Keep action and API coverage that verifies same-draft application lookups.
- Run `pnpm prisma validate` and regenerate Prisma Client.
- Run focused unit and integration tests throughout development.
- Run `pnpm test:integration` against local PostgreSQL.
- Run `make check` before review.

## Deployment

The implementation must not apply the migration manually to production during development. After
the branch is reviewed and merged, the normal deployment migration command applies it. The
pre-deployment read-only audit should be rerun immediately before deployment if production data
has changed materially since 2026-07-18.

Because the current production audit is clean and the single null bid is uniquely repairable, no
separate repair release is required. If the deployment-time preflight discovers a new violation,
deployment stops; the violating data must be investigated and repaired explicitly before retrying.
