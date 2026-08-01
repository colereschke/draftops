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
  write must leave the previously active value set untouched, mark the new set failed, and remove
  its partial rows.
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

- batched resolved-Sleeper-ID updates;
- staging value-set creation;
- batched draft-player-value writes;
- activation using the caller-owned transaction or a staged root-client transaction;
- failed-set cleanup under the staged transaction contract;
- best-effort pruning after a successful staged activation.

It must not score projections, calculate VOR/market values, or decide candidate row contents.

`projectionApplication.ts` becomes a thin orchestrator. It loads the draft and data needed for
preparation, sequences preparation and persistence in their current order, and maintains the
existing public exports used by scripts and tests. Compatibility re-exports are acceptable during
the structural move where they prevent unrelated call-site churn.

## Preserved transaction and failure behavior

The pre-staging reads and resolved-Sleeper-ID updates remain outside value-set activation just as
today. Candidate calculation errors and no-join failures occur before staging and therefore create
no value set.

Once a value set is created, row writes and activation preserve the current mode distinction. In
`transaction` mode, the supplied Prisma client is assumed to be caller-owned and activation runs
directly through it. In staged mode, activation and any failed-set cleanup use the required
transaction-capable root client with the existing 60-second timeout. Staged cleanup failures remain
logged without hiding the original application failure.

Successful staged activation attempts pruning after activation. Pruning errors are logged and do
not change the returned activation result. Same-source reapplication still creates a distinct
immutable value set before activation.

## Testing and verification

Keep the existing focused unit suites for application orchestration and pure joining/value-data
behavior, plus the PostgreSQL activation integration coverage. Preserve the existing cases for
latest-source selection, no-source/no-join failures, same-source immutability, caller-owned
transaction mode, batch-write persistence failure cleanup, and active-set preservation.

Only add application-level characterization if moving a boundary would otherwise leave an invariant
unproven. Do not add tests that merely render or call a newly extracted helper in isolation.

Run the focused projection suites after each task, then `pnpm tsc --noEmit`, `pnpm lint`, and the
full `make check` before final review. Run the full check outside the sandbox because the project
test suite invokes `git` from `localFonts.test.ts`.

## Non-goals

- No change to projection scoring, VOR, market-value algorithms, or fallback valuation.
- No schema or migration changes.
- No change to CLI import workflows, draft creation behavior, retry behavior, or retention policy.
