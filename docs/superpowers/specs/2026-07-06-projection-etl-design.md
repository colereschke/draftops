# Projection ETL Design

## Goal

Build a reproducible local ETL pipeline that parses Mike Clay's 2026 NFL Projection Guide,
matches projected offensive players to active Sleeper player identities, and writes auditable CSV
outputs for future DraftOps valuation work.

## Scope

V1 extracts offensive fantasy player projections for `QB`, `RB`, `WR`, and `TE` only. It does not
extract kickers, defenses, IDP, returners, unit grades, weekly projections, or projected standings.
The output preserves Mike Clay's `Pts` value as `base_fantasy_points`; league-specific fantasy
point calculation is deferred to a future valuation engine.

The scripts are committed. Raw source files and generated CSVs are local artifacts and are ignored
by git.

## Architecture

The ETL lives under `scripts/projections/` as a small Python package plus a CLI wrapper. The package
has separate modules for name/team/position normalization, Sleeper JSON normalization, Mike Clay PDF
extraction, projection-to-Sleeper matching, CSV writing, and validation. This keeps source parsing,
identity matching, and app-facing outputs independent so future projection sources can be added
without changing consumers.

Inputs are read from:

```text
data/raw/NFLDK2026_CS_ClayProjections2026.pdf
data/raw/sleeper_players.json
```

Outputs are written to:

```text
data/generated/raw_mike_clay_projections.csv
data/generated/normalized_sleeper_players.csv
data/generated/master_projections.csv
data/generated/projection_match_report.csv
data/generated/unmatched_players.csv
```

## Matching Rules

Sleeper is the canonical identity source. Matching uses active Sleeper players only. The matcher
prefers exact normalized name, team, and position matches, then normalized name plus team or
position when still unambiguous. Suffix-normalized matches such as `Marvin Harrison Jr.` to
`Marvin Harrison` are high-confidence only when team and position also agree.

Fuzzy matching is intentionally out of V1 unless the candidate set is small and confidence is high.
Uncertain matches remain unmatched instead of being forced into a Sleeper identity.

Rows that cannot be confidently matched are still included in `master_projections.csv` with blank
Sleeper identity fields and are also written to `unmatched_players.csv`.

## Tooling

Python dependencies and quality configuration live in repo-root `pyproject.toml`. Ruff handles
formatting/linting, and mypy handles static checks for the projection package. The ETL can be run
through:

```bash
python scripts/projections/generate_master_csv.py
```

## Validation

Validation prints counts by position, matched/unmatched counts, duplicate projection keys,
duplicate matched Sleeper IDs, numeric parse problems, and suspicious zero-stat rows. Unit tests
cover normalization, active-only Sleeper filtering, conservative matching, and master CSV row
generation. A real-PDF smoke run verifies the extraction path and writes the generated CSVs.
