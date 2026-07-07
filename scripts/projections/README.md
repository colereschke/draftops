# DraftOps Projection ETL

Local Python ETL for generating projection CSVs from Mike Clay's 2026 NFL Projection Guide and the
Sleeper NFL player database.

## Setup

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -e '.[dev]'
```

## Inputs

Place raw files here:

```text
data/raw/NFLDK2026_CS_ClayProjections2026.pdf
data/raw/sleeper_players.json
```

Both paths are ignored by git.

## Generate CSVs

```bash
.venv/bin/python scripts/projections/generate_master_csv.py
```

Outputs are written to ignored local files:

```text
data/generated/raw_mike_clay_projections.csv
data/generated/normalized_sleeper_players.csv
data/generated/master_projections.csv
data/generated/projection_match_report.csv
data/generated/unmatched_players.csv
```

## Match ETR Values to Sleeper

After generating/refreshing Sleeper player data, match the original ETR dynasty values to Sleeper
IDs so rankings values can be joined to projection values:

```bash
.venv/bin/python -m draftops_projections.match_etr_values \
  --etr-csv existing_project_docs/auction-tool/src/Dynasty_Rankings.csv \
  --sleeper-json data/raw/sleeper_players.json \
  --output-csv data/generated/etr_sleeper_matches.csv
```

`data/generated/etr_sleeper_matches.csv` is generated output and should not be edited manually.

## Apply Projection Values to a Draft

After `master_projections.csv` and `etr_sleeper_matches.csv` exist, apply projection-aware VOR
values to one draft's `Player` rows:

```bash
pnpm tsx prisma/apply-projection-values.ts --draft-id <draft-id>
```

The script defaults to these generated inputs:

```text
data/generated/master_projections.csv
data/generated/etr_sleeper_matches.csv
```

You can override either path:

```bash
pnpm tsx prisma/apply-projection-values.ts \
  --draft-id <draft-id> \
  --projections-csv data/generated/master_projections.csv \
  --etr-matches-csv data/generated/etr_sleeper_matches.csv
```

The script stores Sleeper identity plus calculated value outputs on `Player`:

```text
sleeperId
projectedPoints
replacementPoints
vor
projectionAuctionValue
fallbackAuctionValue
activeAuctionValue
valueSource
projectionSource
projectionDate
projectionSeason
```

Raw projection stats remain CSV input for now. Do not manually edit generated CSVs.

## Checks

```bash
.venv/bin/python -m pytest scripts/projections/tests -q
.venv/bin/python -m ruff format scripts/projections
.venv/bin/python -m ruff check scripts/projections
.venv/bin/python -m ruff format --check scripts/projections
.venv/bin/python -m mypy
```

## Scope

V1 extracts only `QB`, `RB`, `WR`, and `TE` rows from the team projection pages. It does not parse
kickers, defenses, IDP, returners, or standings pages.

Mike Clay's `Pts` column is stored as `base_fantasy_points`. League-specific fantasy point
calculation belongs in the future valuation engine.

## Matching

Sleeper is the identity source. The matcher uses active Sleeper players only and applies conservative
matching:

1. exact name + team + position
2. normalized name + team + position
3. normalized name + team
4. normalized name + position
5. manual alias constrained by position and team when team is present

Every fallback must produce exactly one candidate. Ambiguous or missing matches are written to
`unmatched_players.csv` and remain in `master_projections.csv` with blank Sleeper identity fields.
