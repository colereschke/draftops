# Budget-Scaled Valuations Design

## Summary

DraftOps currently treats every draft as though each team has a $1,000 auction budget. The raw
`2QBAuction` ranking input is calibrated to $200, but DraftOps normalizes it to a $1,000 source
economy before storing or consuming it. `adjustPlayerValues` then applies league settings without
knowing either the normalized source budget or the configured draft budget. Non-$1,000 drafts
therefore inherit the wrong value scale, and projection-shaped active values inherit the same error
because they anchor to the fallback value.

HARD-003 will make both budget stages explicit, scale every auction asset from its normalized source
economy into the configured draft economy, preserve source values for reproducibility, and provide
an idempotent operational backfill for existing non-$1,000 drafts.

## Goals

- Keep existing $1,000 draft values numerically unchanged.
- Scale fallback values proportionally for other configured budgets before applying scoring,
  lineup, scarcity, or concentration adjustments.
- Give built-in and custom ranking sources an explicit normalized source budget, initially $1,000.
- Apply the same budget contract to skill players, individual future picks, and pick packages.
- Preserve `Player.baseBudget`, `baseCeiling`, and `baseFloor` as normalized source values.
- Keep projection-shaped active values anchored to the corrected draft fallback value.
- Backfill existing non-$1,000 drafts safely with a dry run, a pre-mutation JSON snapshot, and
  idempotent recomputation.

## Non-goals

- Changing the existing scoring, scarcity, concentration, projection-market, or VOR formulas.
- Adding a ranking-upload control for arbitrary source budgets in this workstream.
- Reinterpreting the upstream CSV's `2QBAuction` column or removing the legacy TE adjustment.
- Adding a permanent database table for operational backfill snapshots.
- Changing the current $1,000 league's value scale.

## Budget Contract

There are two distinct source stages:

1. Raw imported `2QBAuction` values use a $200 economy.
2. DraftOps normalizes those values into its canonical $1,000 ranking-source economy.

The current magic scale factor of `5` will be expressed as
`DEFAULT_RANKING_SOURCE_BUDGET / RAW_RANKING_BUDGET`. Both the built-in ETR data and custom ranking
uploads continue to produce the same normalized values they produce today.

Each persisted custom `UserRankingSet` records its normalized `sourceBudget`, initially $1,000.
Each `Draft` records the `playerValueSourceBudget` used when its players were seeded. Existing rows
receive a database default of $1,000. The built-in ETR source uses the same explicit $1,000
constant. Both source and draft budgets must be positive safe integers.

The draft scale is:

```text
budgetScale = draftBudget / sourceBudget
```

## Valuation Pipeline

Draft creation will build one source-scale asset pool before applying draft adjustments:

1. Load built-in or custom normalized ranking rows.
2. Infer future-pick baselines from the unadjusted source rows.
3. Generate origin-team future picks or packages at the same source scale.
4. Remove legacy static future-pick rows and combine skill players with generated assets.
5. Pass the complete source-scale pool to `adjustPlayerValues` with source budget, draft budget,
   team count, lineup, and scoring settings.
6. Persist the untouched source fields in `base*` and the draft-adjusted fields in
   `budget`/`ceiling`/`floor`.
7. Apply projections after the corrected fallback rows have been persisted.

For QB, RB, WR, and TE rows, scaling occurs in the same calculation as the existing league
multiplier, before the final rounding:

```text
adjustedBudget = round(sourceBudgetValue * budgetScale * leagueMultiplier)
```

The minimum adjusted budget remains one auction dollar. Ceiling remains 115% of the adjusted
budget. Floor remains 87% of the adjusted budget, subject to a source-economy minimum scaled into
the draft economy. This preserves the current $5 floor at $1,000 while allowing a $1 floor at $200
and a $10 floor at $2,000.

PICK and PKG rows do not receive scoring, lineup, scarcity, or concentration multipliers. Their
source budget, ceiling, and floor are each scaled directly by `budgetScale`, rounded to whole
dollars, and clamped to at least one dollar. At a scale of one, their values pass through exactly as
they do today.

`calculateProjectionMarketValues` remains structurally unchanged. It continues to multiply
`Player.budget` by the projection-market multiplier. Because `Player.budget` is corrected first,
both `DraftPlayerValue.fallbackAuctionValue` and `activeAuctionValue` inherit the correct draft
economy. Projection VOR calculation continues to receive the configured draft budget and remains a
separate contextual value.

## Persistence Semantics

- `UserRankingSet.sourceBudget`: normalized economy represented by its player values.
- `Draft.playerValueSourceBudget`: source economy used to seed that draft's player rows.
- `Player.baseBudget`, `baseCeiling`, `baseFloor`: immutable normalized source values.
- `Player.budget`, `ceiling`, `floor`: draft-scaled fallback values after league adjustments.
- `DraftPlayerValue.fallbackAuctionValue`: copy of the current `Player.budget` for the applied
  projection source.
- `DraftPlayerValue.activeAuctionValue`: projection-shaped value anchored to that fallback.

This work does not add another value column or overload `base*` with draft-scale values.

## Existing Draft Backfill

A dedicated CLI will target drafts whose configured budget differs from their recorded source
budget. It defaults to dry-run mode. The dry run recomputes proposed values from `base*`, reports
affected player counts and before/after aggregate totals, and performs no database writes.

Apply mode requires an explicit `--apply` flag. Before any mutation, the CLI writes a timestamped
JSON snapshot to `valuation-backfill-snapshots/` by default; `--snapshot-dir` can override that
location. The default directory is excluded from Git. The snapshot includes:

- draft identity, budget, source budget, lineup, scoring, and roster settings;
- every affected player's base and fallback value fields plus identity and future-pick metadata;
- every existing `DraftPlayerValue` row for the affected drafts.

If the directory or snapshot file cannot be written successfully, apply mode aborts without
touching the database.

The CLI recomputes from `base*` rather than multiplying current fallback values. It is therefore
safe to rerun without compounding scale. Each draft is updated in its own database transaction:

1. Recompute all player fallback values from source fields and persisted draft settings.
2. Update the draft's player fallback rows.
3. Reapply the latest usable projection source, matching current application behavior, so fallback
   and active projection values agree. Explicit projection-source activation remains HARD-006.
4. Commit the draft transaction.

A failure rolls back the current draft. Previously completed drafts may remain updated, but the
same command can be rerun safely using the original full snapshot and idempotent computation.
$1,000 drafts whose source budget is also $1,000 are reported as unaffected and skipped.

## Error Handling

- Draft creation rejects non-positive or unsafe source and draft budgets before computing values.
- The backfill rejects malformed CLI arguments and invalid persisted budget settings with the draft
  ID in the error.
- Apply mode refuses to run without a successfully written snapshot.
- A draft with no usable projection source fails and rolls back rather than leaving fallback and
  active values inconsistent.
- Database and filesystem errors remain visible to the operator and produce a non-zero exit code.

## Testing Strategy

Development follows test-driven development.

### Pure valuation tests

- Preserve the existing $1,000 golden fixtures for skill players and future-pick assets.
- Add neutral-setting $200 and $2,000 fixtures with exact expected budget, ceiling, and floor values.
- Verify scaling occurs before league multipliers and before final rounding.
- Verify `base*` fields remain source-scale values at every draft budget.
- Verify budget-aware minimums at small and large scales.
- Verify skill players, picks, and packages share the same source-budget contract.

### Draft creation and projection tests

- Verify built-in and custom ranking sources pass their explicit source budget into adjustment.
- Verify the selected source budget is persisted on the draft.
- Verify generated future-pick assets are source-scale inputs before adjustment.
- Verify projection fallback and active values anchor to the scaled `Player.budget`.
- Verify aggregate fallback and active market totals change proportionally, within documented
  whole-dollar rounding tolerance, between $200, $1,000, and $2,000 fixtures.

### Schema and backfill tests

- Verify migration defaults existing ranking sets and drafts to a $1,000 source budget.
- Verify dry run performs no writes and reports exact proposed totals.
- Verify apply mode writes the snapshot before opening a mutation transaction.
- Verify snapshot failure prevents all database writes.
- Verify successful application updates fallback values and reapplies projections atomically.
- Verify a forced projection failure rolls back that draft's player updates.
- Verify running apply twice produces the same stored values and totals.
- Exercise the backfill against a real PostgreSQL database because it changes persisted valuation
  state and transaction behavior.

The final quality gate is `make check` plus `pnpm test:integration` against the repository's real
PostgreSQL test database.

## Operational Notes

The CLI output must identify the snapshot path, affected draft IDs, player counts, before/after
fallback totals, before/after active totals, and whether the run was dry or applied. Operators must
retain the JSON snapshot until the updated drafts have been verified. Restoration automation is not
part of HARD-003, but the snapshot contains every value field needed for manual or follow-up
restoration.
