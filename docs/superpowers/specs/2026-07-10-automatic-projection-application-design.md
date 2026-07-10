# Automatic Projection Application Design

## Problem

PR #35 makes projection-shaped dynasty values the active auction target when `DraftPlayerValue`
rows exist. New drafts still only receive the non-projection fallback `Player` values unless someone
manually runs:

```bash
pnpm tsx prisma/apply-projection-values.ts --draft-id <draft-id>
```

That is too easy to forget, and it undermines the main purpose of the PR.

## Decision

Projection data should be stored in Postgres, not read from generated CSV files during draft
creation. Draft creation should automatically apply the latest stored projection source after
seeding adjusted fallback `Player` rows.

If no projection source exists, or if projection application fails, draft creation should fail
loudly. While DraftOps is single-operator and this branch is still valuation-focused, a failed
create is better than silently creating a draft with incomplete values.

## Data Flow

Split the current `prisma/apply-projection-values.ts` behavior into two reusable operations:

1. Import projection source data.
   - Reads generated CSV inputs.
   - Upserts `ProjectionSource`.
   - Upserts raw normalized `PlayerProjection` rows.
   - Does not require a draft.

2. Apply projections to a draft.
   - Reads a draft's league settings and `Player` rows.
   - Resolves player Sleeper IDs from existing `Player.sleeperId` or the ETR match CSV.
   - Reads `PlayerProjection` rows for the selected/latest `ProjectionSource`.
   - Scores projected points under the draft's scoring settings.
   - Computes VOR/projection auction context.
   - Computes projection-shaped market values anchored to `Player.budget`.
   - Upserts `DraftPlayerValue` rows.
   - Deletes stale `DraftPlayerValue` rows for the same source.

## Draft Creation

`createDraft` should keep the existing transaction shape for creating the draft, teams, and adjusted
fallback `Player` rows. After those rows exist, it should apply projections to the new draft before
redirecting.

The application step should:

- select the latest available `ProjectionSource` from Postgres;
- apply that source to the new draft;
- throw if no source exists;
- throw if projection application writes zero joined player values.

This keeps the user-facing invariant simple: a successfully created draft has projection-shaped
active values available for every player matched to the current projection source, with unmatched
players falling back to adjusted dynasty values.

## CLI Compatibility

Keep the existing manual command as a supported operational tool, but make it a thin wrapper around
the reusable import/apply functions. It should still support:

```bash
pnpm tsx prisma/apply-projection-values.ts --draft-id <draft-id>
```

The script should import/update projection source rows from CSVs, then apply the latest or requested
source to the requested draft.

## Error Handling

Fail loudly in draft creation for missing or unusable projection data. This is intentionally strict.
If we later need production resilience for multi-user usage, we can soften this into a visible draft
status or admin repair flow.

Players missing from the active projection source are not an error. They should fall back to
`Player.budget`, which covers free agents, rookies without projections, and unmatched edge cases.

## Testing

Add focused tests for:

- importing projection rows upserts `ProjectionSource` and `PlayerProjection` independently of a
  draft;
- applying stored projections to a draft writes `DraftPlayerValue` rows;
- draft creation calls projection application after players are seeded;
- draft creation throws when no projection source exists;
- players without current projections continue falling back through `mapPlayersWithDraftValues`.

## Documentation

Update README, AGENTS, and ROADMAP after implementation so they no longer say projection application
is manual for new drafts. They should describe the new operational requirement: the database must
have at least one imported `ProjectionSource` before creating a draft.
