# HARD-022 Projection Application Decomposition Design

## Goal

Decompose `src/lib/projectionApplication.ts` into focused preparation and persistence modules while
preserving every projection-application behavior, transaction boundary, failure mode, and public
interface.

## Scope and constraints

- This is a structural-only HARD-022 refactor. It must not alter valuation calculations, database
  writes, activation behavior, error codes/messages, or operational logging.
- Keep `applyProjectionValuesToDraft` as the public entry point with the same options and result
  contract.
- Preserve `mode: 'staged' | 'transaction'` semantics exactly. Caller-owned transaction mode never
  opens a nested transaction; staged mode requires a transaction-capable root client for activation
  and failed-set cleanup.
- Preserve current ordering: load draft, resolve source, load players, persist newly resolved
  Sleeper IDs, load projections, calculate rows, create a staging value set, write rows, activate,
  then best-effort prune.
- Preserve all `ProjectionApplicationFailure` codes/messages and failure wrapping. A failed staged
  write leaves the previously active value set untouched and attempts atomic failed-set cleanup.
  Only successful cleanup guarantees a `FAILED` value set with its partial rows removed; cleanup
  transaction failure is logged and preserves the original application failure.
- Preserve intentionally non-fatal pruning: log its failure after successful activation and return
  the successful result.
- Retain existing application and integration characterization tests. Add tests only where a new
  module boundary needs a meaningful application-level contract; do not add extraction-only tests.

## Module boundaries

`projectionApplicationTypes.ts` contains shared contracts currently embedded in the monolith:
Prisma-client shape, public options/result, draft/player/projection row shapes, and the value-set
write shape. It contains no runtime behavior.

`projectionPreparation.ts` owns projection candidate preparation:

- selecting the latest source when one was not supplied;
- resolving fallback Sleeper IDs and deriving necessary player-ID updates;
- converting stored projection stats to scored rows under both draft and baseline scoring;
- joining draft players to scored projections;
- calculating VOR and market values;
- building candidate write rows and rejecting non-finite values.

It must not create a value set, write rows, activate a set, or perform cleanup.

`projectionPersistence.ts` owns durable mutation steps:

- resolved-Sleeper-ID updates in sequential batches of 50, with concurrent `player.update` calls
  inside each batch;
- staging value-set creation;
- draft-player-value writes in sequential `createMany` batches of 50;
- activation using the caller-owned transaction or a staged root-client transaction;
- failed-set cleanup under the staged transaction contract;
- best-effort pruning after a successful staged activation.

It must not score projections, calculate VOR/market values, or decide candidate row contents.

`projectionApplication.ts` becomes a thin orchestrator. It loads the draft and data needed for
preparation, sequences preparation and persistence in their current order, and maintains the
complete existing named-export surface through direct exports or re-exports. It must preserve
every current helper/type import path during this structural change, not only the public entry point.

## Preserved transaction and failure behavior

The pre-staging reads and resolved-Sleeper-ID updates remain outside value-set activation just as
today. Candidate calculation errors and no-join failures occur before staging and therefore create
no value set.

Once a value set is created, row writes and activation preserve the current mode distinction. In
`transaction` mode, the supplied Prisma client is assumed to be caller-owned and activation runs
directly through it. In staged mode, activation and any failed-set cleanup use the required
transaction-capable root client with the existing 60-second timeout. Staged cleanup failures remain
logged without hiding the original application failure.

Do not preflight staged transaction capability. Preserve its current activation-time check after
staging and writes, followed by the current cleanup-time check inside the failure path. This keeps
the existing durable side effects, logging, and original-error preservation for a client lacking
`$transaction`.

Preserve three distinct persistence error scopes and their current wrappers: resolved-Sleeper-ID
updates retain their direct update errors; value-set creation alone wraps its failure as
`PERSISTENCE_FAILURE` with the existing `Failed to create a projection value set...` message and
does not attempt cleanup; row writes and activation share the existing failure scope, pass through
an existing `ProjectionApplicationFailure`, otherwise wrap as `PERSISTENCE_FAILURE` with the
existing `Failed to persist projection values...` message, then attempt staged cleanup.

Successful staged activation attempts pruning after activation. Pruning errors are logged and do
not change the returned activation result. Same-source reapplication still creates a distinct
immutable value set before activation.

## Testing and verification

Keep the existing focused unit suites for application orchestration and pure joining/value-data
behavior, plus the PostgreSQL activation integration coverage. Before extraction, add only the
application-level characterization needed to protect moved seams:

- the exact sequential operation order from source/player reads through staged writes, activation,
  and post-activation prune;
- batch size 50 and the differing concurrent Sleeper-update versus sequential `createMany` batch
  behavior;
- the exact `{ timeout: 60_000 }` transaction option in staged activation and cleanup;
- generic-versus-typed failure wrapping, original-error cause/message preservation, and separate
  value-set-creation failure scope;
- missing-transaction activation timing and its best-effort cleanup/logging behavior;
- non-fatal prune failure logging after a successful activation;
- transaction-mode failure behavior without root-client transaction or staged cleanup;
- a complete candidate value row derived from stored projection stats, not only a pre-scored join.

These remain application-orchestration tests, not direct tests of newly extracted helpers.

Run the focused projection suites after each task, then `pnpm tsc --noEmit`, `pnpm lint`, and the
full `make check` before final review. Run the full check outside the sandbox because the project
test suite invokes `git` from `localFonts.test.ts`.

## Non-goals

- No change to projection scoring, VOR, market-value algorithms, or fallback valuation.
- No schema or migration changes.
- No change to CLI import workflows, draft creation behavior, retry behavior, or retention policy.
