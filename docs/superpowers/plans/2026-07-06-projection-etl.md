# Projection ETL Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reproducible Python ETL that extracts Mike Clay QB/RB/WR/TE projections, matches
them to active Sleeper players, and writes auditable CSV outputs.

**Architecture:** Add a focused Python package under `scripts/projections/draftops_projections`.
Keep extraction, normalization, matching, CSV generation, and validation in separate modules with a
thin CLI wrapper. Raw inputs and generated outputs live under ignored `data/raw` and
`data/generated` directories.

**Tech Stack:** Python 3.11+, setuptools editable package install, pdfplumber, pytest, ruff,
mypy, existing pnpm/Jest app checks.

---

## Files

- Create: `pyproject.toml`
- Modify: `.gitignore`
- Create: `scripts/projections/README.md`
- Create: `scripts/projections/generate_master_csv.py`
- Create: `scripts/projections/draftops_projections/__init__.py`
- Create: `scripts/projections/draftops_projections/aliases.py`
- Create: `scripts/projections/draftops_projections/csv_utils.py`
- Create: `scripts/projections/draftops_projections/extract_mike_clay.py`
- Create: `scripts/projections/draftops_projections/match_players.py`
- Create: `scripts/projections/draftops_projections/models.py`
- Create: `scripts/projections/draftops_projections/normalize.py`
- Create: `scripts/projections/draftops_projections/sleeper.py`
- Create: `scripts/projections/draftops_projections/validate.py`
- Create: `scripts/projections/tests/test_csv_generation.py`
- Create: `scripts/projections/tests/test_match_players.py`
- Create: `scripts/projections/tests/test_normalize.py`
- Local only: `data/raw/NFLDK2026_CS_ClayProjections2026.pdf`
- Local only: `data/raw/sleeper_players.json`

## Task 1: Python Tooling and Ignored Data Directories

- [ ] **Step 1: Add `.gitignore` coverage**

Add:

```gitignore
data/raw/
data/generated/
.venv/
.mypy_cache/
.pytest_cache/
.ruff_cache/
```

- [ ] **Step 2: Add `pyproject.toml`**

Configure dependencies and tools:

```toml
[build-system]
requires = ["setuptools>=69", "wheel"]
build-backend = "setuptools.build_meta"

[project]
name = "draftops-projections"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = ["pdfplumber>=0.11.4"]

[project.optional-dependencies]
dev = ["mypy>=1.14.0", "pytest>=8.3.4", "ruff>=0.8.4"]

[tool.ruff]
line-length = 100
target-version = "py311"

[tool.ruff.lint]
select = ["E", "F", "I", "UP", "B"]

[tool.mypy]
python_version = "3.11"
strict = true
files = ["scripts/projections/draftops_projections", "scripts/projections/tests"]

[[tool.mypy.overrides]]
module = ["pdfplumber.*"]
ignore_missing_imports = true

[tool.setuptools.packages.find]
where = ["scripts/projections"]
include = ["draftops_projections*"]
```

- [ ] **Step 3: Create a virtualenv and install Python dev dependencies**

Run:

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -e '.[dev]'
```

Expected: dependencies install successfully.

## Task 2: Normalization and Sleeper Loading

- [ ] **Step 1: Write failing normalization tests**

Create `scripts/projections/tests/test_normalize.py` covering suffix removal, punctuation removal,
team mapping, supported offensive positions, and representative Sleeper records with `active`,
`position`, `team`, `full_name`, `first_name`, `last_name`, `player_id`, null team, and
non-offensive positions.

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
.venv/bin/python -m pytest scripts/projections/tests/test_normalize.py -q
```

Expected: import failure because modules do not exist yet.

- [ ] **Step 3: Implement models, normalization, aliases, and active-only Sleeper loading**

Create dataclasses for `ProjectionRow`, `SleeperPlayer`, `MatchResult`, and `MasterProjectionRow`.
Implement `normalize_name`, `normalize_team`, `normalize_position`, `load_active_sleeper_players`,
and an initially small manual alias map. Team normalization must include:

```text
ARZ -> ARI
JAC -> JAX
BLT -> BAL
CLV -> CLE
HST -> HOU
LA -> LAR
LV -> LV
OAK -> LV
WSH -> WAS
FA/null/empty -> empty string
```

`load_active_sleeper_players` must exclude inactive players and non-`QB/RB/WR/TE` players.

- [ ] **Step 4: Run tests and verify pass**

Run:

```bash
.venv/bin/python -m pytest scripts/projections/tests/test_normalize.py -q
```

Expected: all tests pass.

## Task 3: Conservative Matching

- [ ] **Step 1: Write failing matching tests**

Create `scripts/projections/tests/test_match_players.py` covering:

- exact name/team/position match
- suffix-normalized name/team/position match
- inactive Sleeper players excluded by loader
- duplicate names resolved by team and position
- ambiguous matches return unmatched
- alias matches constrained by position and team when projection team is available

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
.venv/bin/python -m pytest scripts/projections/tests/test_match_players.py -q
```

Expected: matcher import failure or missing behavior failure.

- [ ] **Step 3: Implement matcher**

Implement deterministic matching methods:

```text
exact_name_team_position
normalized_name_team_position
normalized_name_team
normalized_name_position
alias
unmatched
```

Use confidence `1.00` for exact, `0.98` for normalized/suffix team-position matches, `0.95`
for aliases, and no auto-match for ambiguous candidates. Every fallback method may return a match
only when exactly one active candidate remains after its constraints. Alias matching must still
filter by normalized position and must filter by normalized team when the projection has a team.

- [ ] **Step 4: Run tests and verify pass**

Run:

```bash
.venv/bin/python -m pytest scripts/projections/tests/test_match_players.py -q
```

Expected: all tests pass.

## Task 4: CSV Generation and Validation

- [ ] **Step 1: Write failing CSV tests**

Create `scripts/projections/tests/test_csv_generation.py` covering master rows with matched and
unmatched projections, match report rows, unmatched report rows, explicit column order, and
`base_fantasy_points` naming.

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
.venv/bin/python -m pytest scripts/projections/tests/test_csv_generation.py -q
```

Expected: CSV helper imports fail or expected columns are missing.

- [ ] **Step 3: Implement CSV helpers and validation summary**

Implement stable column order for:

```text
raw_mike_clay_projections.csv:
projection_name,projection_team,projection_position,games,pass_att,pass_cmp,pass_yds,pass_td,
pass_int,pass_sacks,rush_att,rush_yds,rush_td,targets,receptions,rec_yds,rec_td,
base_fantasy_points,projection_rank,source_page

normalized_sleeper_players.csv:
sleeper_id,full_name,first_name,last_name,search_full_name,normalized_name,team,position,
fantasy_positions,age,years_exp,active,status

master_projections.csv:
sleeper_id,player_name,first_name,last_name,search_full_name,team,position,fantasy_positions,
age,years_exp,active,status,games,pass_att,pass_cmp,pass_yds,pass_td,pass_int,pass_sacks,
rush_att,rush_yds,rush_td,targets,receptions,rec_yds,rec_td,base_fantasy_points,
projection_rank,projection_source,projection_date,season,match_method,match_confidence

projection_match_report.csv:
projection_name,projection_team,projection_position,sleeper_id,sleeper_name,sleeper_team,
sleeper_position,match_method,match_confidence,notes

unmatched_players.csv:
projection_name,projection_team,projection_position,games,base_fantasy_points,projection_rank,
reason,candidate_sleeper_ids,candidate_names
```

Implement validation counts by position, matched/unmatched counts, duplicate projection keys,
duplicate Sleeper IDs, and suspicious zero-stat rows. Validation must return nonzero/raise for
zero extracted projections, zero extracted rows for any supported position, duplicate projection
keys, duplicate matched Sleeper IDs, or missing required known-player matches.

- [ ] **Step 4: Run tests and verify pass**

Run:

```bash
.venv/bin/python -m pytest scripts/projections/tests/test_csv_generation.py -q
```

Expected: all tests pass.

## Task 5: Mike Clay PDF Extraction

- [ ] **Step 1: Inspect real PDF extraction shape**

Copy local files into ignored paths:

```bash
mkdir -p data/raw data/generated
cp /home/colereschke/dev/projects/draftops/player_data/NFLDK2026_CS_ClayProjections2026.pdf data/raw/
cp /home/colereschke/dev/projects/draftops/player_data/sleeper_players.json data/raw/
```

Run a short `pdfplumber` inspection for pages 2-57 and identify stable row patterns.
Treat page numbers as human document page numbers. Convert to zero-based indexes when using
`pdfplumber.pages`, so document page 2 is `pages[1]`.

- [ ] **Step 2: Implement extractor**

Parse only rows whose first token position is `QB`, `RB`, `WR`, or `TE`. Skip total rows and
non-player rows. Preserve `source_page` and map Mike Clay `Pts` to `base_fantasy_points`.
The extractor must fail validation if it extracts fewer than these rough minimums from the real
PDF: `QB >= 40`, `RB >= 80`, `WR >= 120`, `TE >= 50`.

- [ ] **Step 3: Add a smoke test or fixture test**

Create deterministic parser tests with synthetic QB/RB/WR/TE lines matching the observed stat
order. Include at least one player with punctuation and one with a suffix. Keep full-PDF
verification as a local smoke run and validate known extracted names:

```text
Josh Allen
Lamar Jackson
Bijan Robinson
Ja'Marr Chase
Marvin Harrison Jr.
Trey McBride
Dalton Kincaid
```

## Task 6: CLI, README, and Full Verification

- [ ] **Step 1: Implement CLI wrapper**

`scripts/projections/generate_master_csv.py` should accept default paths and optional path flags,
create output directories, run all pipeline stages, write CSVs, and print validation. Validation
failures must cause a nonzero process exit.

- [ ] **Step 2: Add CLI integration test**

Add a test that runs the CLI pipeline with temp input/output paths and synthetic projection/Sleeper
data. It must prove path flags, directory creation, CSV writes, and validation work together.

- [ ] **Step 3: Document usage**

Write `scripts/projections/README.md` with setup, commands, inputs, outputs, and matching rules.
Include copy-paste commands for venv setup, tests, checks, and real ETL generation.

- [ ] **Step 4: Run Python checks**

Run:

```bash
.venv/bin/python -m pytest scripts/projections/tests -q
.venv/bin/python -m ruff format scripts/projections
.venv/bin/python -m ruff check scripts/projections
.venv/bin/python -m ruff format --check scripts/projections
.venv/bin/python -m mypy
```

Expected: all pass.

- [ ] **Step 5: Run real ETL smoke check**

Run:

```bash
.venv/bin/python scripts/projections/generate_master_csv.py
```

Expected: generated CSVs exist under `data/generated`, validation prints extraction and match
counts, and known players like Josh Allen, Lamar Jackson, Bijan Robinson, Ja'Marr Chase, Marvin
Harrison Jr., Trey McBride, and Dalton Kincaid match confidently.

- [ ] **Step 6: Run repo checks**

Run:

```bash
pnpm test
pnpm typecheck
pnpm lint
```

Expected: all pass.

## Self-Review

- Spec coverage: Covers Python tooling, ignored raw/generated files, active-only matching,
  QB/RB/WR/TE scope, `base_fantasy_points`, conservative matching, generated CSVs, validation,
  and README.
- Placeholder scan: No placeholders or unresolved decisions remain.
- Type consistency: The plan consistently uses `ProjectionRow`, `SleeperPlayer`, `MatchResult`,
  `MasterProjectionRow`, `base_fantasy_points`, and the agreed file paths.
