# DraftOps Projection Architecture

Last reconciled: 2026-08-03

This document describes the durable boundaries and valuation contracts of DraftOps' projection
subsystem. It is architectural context, not an ETL command guide. For local setup, input
acquisition, CSV generation, matching, and validation, see
[`scripts/projections/README.md`](../scripts/projections/README.md).

## Product role

DraftOps is a single-operator auction decision tool. Projections are one input to its decision
engine, not the product's sole definition of player value.

The system keeps these concerns separate:

- **Sleeper identity:** who this player is.
- **Rankings:** what the market or dynasty source thinks the player is worth.
- **Projections:** what the player is expected to produce in a defined season.
- **League settings:** how that production scores in this draft.
- **Draft state:** how the live auction changes availability, budgets, and recommendations.

Projection data must improve league-specific context without erasing the market-calibrated dynasty
value that operators rely on during a live auction.

## System boundary

```text
External projection source
        ↓
Raw import and normalization
        ↓
Sleeper identity matching
        ↓
Persisted ProjectionSource / PlayerProjection rows
        ↓
Draft scoring and replacement calculations
        ↓
Staged DraftPlayerValue rows
        ↓
Validated active value-set pointer
        ↓
Canonical draft player loader and live views
```

The projection subsystem owns source import, normalization, identity matching, scoring context,
replacement/VOR calculations, value-set staging, and activation. Draft pages consume the canonical
active-player loader; they do not parse projection files or infer which historical source is active.

## Identity and ingestion

Sleeper is the stable identity layer shared by projections, custom rankings, and roster sync.
Projection source rows should join through Sleeper IDs rather than display names.

The current ETL accepts a licensed external projection PDF and Sleeper's public player JSON, then
produces generated local CSVs. Generated files are inputs to CLI workflows only; deployed runtime
code must use persisted database identity and projection rows.

The matcher is deliberately conservative:

1. Exact name, team, and position.
2. Normalized name, team, and position.
3. Normalized name and team.
4. Normalized name and position.
5. A constrained manual alias where the position/team context remains valid.

Ambiguous or missing matches stay visible in the unmatched report. The system must prefer a visible
unmatched player to silently assigning projections to the wrong identity.

The operational pipeline and checks are documented in
[`scripts/projections/README.md`](../scripts/projections/README.md).

## Persistence model

Projection data is stored separately from draft fallback values and raw identity data:

- `SleeperPlayer` — global identity reference used by rankings and projection matching.
- `Player` — draft-scoped player row with source/base and adjusted fallback values.
- `ProjectionSource` — source, season, date, and activation metadata.
- `PlayerProjection` — normalized raw projection statistics keyed by Sleeper ID and source.
- `DraftProjectionValueSet` — one complete candidate or historical activation set for a draft.
- `DraftPlayerValue` — draft-scored points, replacement context, VOR, fallback value, active value,
  and value-source metadata for one player in one value set.

League-scored fields belong in `DraftPlayerValue`, not `PlayerProjection`, because the same raw
projection can score differently under different draft settings.

## Value contract

DraftOps has two valuation paths:

### Fallback value

Fallback values come from built-in or custom rankings, scaled into the draft budget and adjusted for
lineup, scarcity, concentration, and scoring settings. They keep the app usable when projection
data is missing and preserve dynasty-market context when a one-year projection is weak or noisy.

`Player.base*` fields preserve source-denominated values. `Player.budget`, `ceiling`, and `floor` are
the draft-denominated fallback values.

### Projection-shaped active value

Projection calculations provide league-specific scoring, replacement, VOR, and projection auction
context. They shape the active market target relative to the fallback value rather than replacing it
with raw VOR dollars.

The active value must therefore satisfy these rules:

- `fallbackAuctionValue` captures the draft fallback at application time.
- `projectionAuctionValue` is stored context, not automatically the surfaced target.
- `activeAuctionValue` remains anchored to fallback and records its `valueSource`.
- A player without a current projection row falls back to `Player.budget`.
- A weak rookie projection must not lower a dynasty fallback value; a strong projection may raise it.

The rationale for this contract and the peer-normalized lift is recorded in
[`docs/DECISIONS.md`](DECISIONS.md).

## Scoring and replacement

Raw projected statistics are scored under the draft's settings. Replacement levels must account for
the actual league shape, including:

- team count
- starting lineup
- flex and Superflex slots
- roster size
- target roster construction
- scoring bonuses and TE premium

The conceptual calculation is:

```text
projected points = score(raw projected stats, draft scoring settings)
VOR = projected points - replacement points for the player's position
```

Negative VOR may be clamped for projection-dollar allocation, but raw projection and replacement
context should remain available for future roster-strength analysis. A simple initial allocation is
preferable to a highly tuned model that cannot be explained during a live auction.

## Activation and failure behavior

Projection application is staged as a complete candidate value set:

1. Resolve identities and prepare the player pool.
2. Calculate draft-specific scoring, replacement, VOR, and value context.
3. Persist the candidate rows under a fresh value-set record.
4. Validate joins, counts, and calculation invariants.
5. Atomically update `Draft.activeProjectionValueSetId` under the shared per-draft lock.

Failures before activation leave the previous active set untouched. Readers query only the explicit
active pointer, never the newest `updatedAt` row. The active set and a bounded number of recent
archived row sets are retained for auditability and rollback safety.

## Deliberate non-goals

- Do not blend raw VOR dollars directly into dynasty market dollars.
- Do not make projection availability a prerequisite for the fallback auction tool beyond the
  existing draft-creation contract requiring a usable active source.
- Do not implement a general strategy lens that labels rebuild/balanced/contender teams without a
  separate, shape-preserving design.
- Do not duplicate Sleeper matching in roster sync or rankings import.
- Do not treat generated CSVs as deployed runtime data.

## Future extensions

Potential future work includes additional projection sources, source comparison, confidence/risk
metadata, a setup/admin wrapper around imports, projection-aware roster-strength analysis, and a
replacement strategy lens. Each extension must preserve the identity/storage/value boundaries above
and add a decision record when it changes the valuation contract.
