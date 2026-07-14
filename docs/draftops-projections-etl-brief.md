# DraftOps Projection ETL + Valuation Engine Brief

## Purpose of This Document

This document is a handoff brief for implementing a projection ETL system inside DraftOps.

The immediate goal is to generate three CSV files from:

1. Mike Clay’s 2026 NFL Projection Guide PDF
2. Sleeper’s public NFL player database JSON

The longer-term goal is to turn projections into a first-class subsystem that powers league-specific fantasy values, VOR, auction values, and eventually live draft recommendations.

This should not be treated as a one-off CSV conversion. The implementation should be reproducible, testable, and designed so future projection sources can be added without changing the rest of the app.

---

# 1. Product Context

DraftOps is a single-operator auction draft tool.

A user imports or configures a Sleeper league before their auction draft. During the draft, the user logs completed winning bids for all teams. DraftOps tracks rosters, budgets, spending patterns, nomination opportunities, and team needs from the perspective of the single user operating the draft.

DraftOps does not run the auction itself and does not coordinate multiple managers. It is an observer and decision-support tool.

The product goal is bigger than a static auction calculator. DraftOps should become a real-time auction decision engine.

It should help answer questions like:

- What is this player worth in this exact league?
- Should I keep bidding at the current price?
- Who should I nominate next?
- Which teams are under pressure?
- Which positions are drying up?
- Which managers are overspending?
- Where is the remaining value in the player pool?
- How should future pick packages be valued as the auction unfolds?

The projection ETL work is foundational because reliable player projections allow DraftOps to generate league-specific values instead of relying only on static dynasty rankings or manually uploaded auction values.

---

# 2. Current Roadmap Context

The existing roadmap lives in:

```text
ROADMAP.md
```

Current status:

- Features 1–4 are already built.
- 5a is finished.
- 5c is finished.
- 5b is in progress.
- 6, the UI redesign, is being worked on in parallel.
- The app already has configurable league settings and Sleeper league import.
- The app is currently working toward configurable league value adjustment.
- The next important layer is projections + VOR.

Relevant roadmap areas:

## 5a. Configurable League Settings — Model + Player Table

This introduced the per-draft `Player` model and league settings on the `Draft` model.

Important implication: player values are no longer static imports from a file. They can be scoped to a draft and adjusted based on that draft’s settings.

## 5b. Configurable League Settings — Value Adjustment Algorithm

This is the current algorithmic focus.

The existing plan starts with a base model that can function without projections. That fallback model is still important. DraftOps should work even when projections are unavailable.

However, projections should become an optional enhancement layer that produces better values when projection data exists.

## 5c. Sleeper League Import

Sleeper league import is complete or largely complete. The app can import league size, roster settings, scoring settings, and team info from Sleeper.

This matters because the projection engine can use those imported settings to calculate league-specific fantasy points and VOR.

## 7. Custom Rankings Upload

This originally focused on allowing users to replace the default ETR seed with their own rankings CSV.

This should eventually coexist with projections. Rankings and projections are related but not the same:

- Rankings/value uploads provide baseline market or dynasty value.
- Projections provide season-long expected production.
- VOR converts projections into league-specific replacement-adjusted value.
- Auction values can combine both market value and projected value.

## 9. Sleeper Roster Sync

Sleeper player IDs are needed as stable cross-references.

The current ETL should enrich projection rows with Sleeper IDs now, so later roster sync and projection-aware features have a stable identity layer.

---

# 3. Strategic Product Framing

The long-term identity of DraftOps should be:

> A real-time auction decision engine.

Not merely:

- an auction tracker
- a static auction calculator
- a dynasty rankings sheet
- a bid logger

The core value is that DraftOps understands:

- the league settings
- the scoring rules
- the roster format
- the player pool
- the remaining auction budget
- each team’s spending
- each team’s roster needs
- the projected value of remaining players
- the state of the market as the auction unfolds

The projection ETL work should support that direction.

---

# 4. Why Projections Matter

Most auction tools stop at:

```text
Projected Points
    ↓
Auction Dollars
```

DraftOps should eventually do something better:

```text
Projected Stats
    ↓
League Scoring
    ↓
Fantasy Points
    ↓
Replacement Level
    ↓
Value Over Replacement
    ↓
Auction Dollars
    ↓
Live Draft Recommendations
```

Auction dollars should not reward raw fantasy points. They should reward points above what can be replaced cheaply or freely in that exact league format.

For example:

- In a 1QB league, QB replacement level may be QB12–QB16.
- In a Superflex league, QB replacement level may be QB24–QB30.
- In a league starting 3 WRs and multiple flexes, WR replacement level is much deeper than WR36.
- In a TE premium league, elite TE production can become disproportionately valuable.

This is exactly where DraftOps can stand out because it already knows league size, scoring, and roster settings.

---

# 5. Valuation Engine Architecture

DraftOps should eventually have two valuation paths.

## Engine A: Fallback Valuation Model

This model works without projections.

Inputs:

- Base ETR or custom rankings values
- League size
- Roster size
- Starting lineup
- Target roster construction
- Scoring settings
- Budget

Outputs:

- Adjusted player budget
- Ceiling
- Floor
- Possibly position-specific scarcity adjustments

This is the current 5b direction.

This model is important because:

- projections may be missing
- users may upload custom rankings without projections
- dynasty auction values may depend on long-term value, not just one-year projection
- the app should remain usable even without a projection source

## Engine B: Projection-Aware VOR Model

This model uses player projections when available.

Inputs:

- Normalized player projections
- Sleeper player IDs
- Draft league settings
- Draft scoring settings
- Draft roster settings
- Budget
- Team count

Outputs:

- Projected fantasy points
- Position-specific replacement levels
- Value over replacement
- Scarcity-adjusted values
- Auction dollar values
- Tier breaks
- Potentially confidence/risk indicators

When projections exist, Engine B should enrich or override the fallback model depending on the product decision.

A reasonable initial approach:

- Store fallback values.
- Store projection-based values separately.
- Allow the app to choose one as the active value source.
- Later support blending the two.

Possible future fields:

```text
base_value
fallback_adjusted_value
projected_points
replacement_points
vor
projection_value
active_value
value_source
```

---

# 6. Projection Engine as a First-Class Subsystem

Projections should not be scattered across feature code.

Create a dedicated projection subsystem with clear boundaries.

Conceptual flow:

```text
Projection Source
    ↓
Raw Import
    ↓
Normalized Stats
    ↓
Sleeper ID Matching
    ↓
League Scoring
    ↓
Fantasy Points
    ↓
Replacement Level
    ↓
VOR
    ↓
Auction Values
    ↓
DraftOps Player Table
```

The projection subsystem should be responsible for:

- importing projection files
- normalizing stat categories
- matching players to Sleeper IDs
- validating output
- calculating fantasy points from scoring settings
- calculating replacement levels
- calculating VOR
- exporting or writing results

Other parts of the app should consume its output, not know how projections were parsed.

---

# 7. Immediate ETL Goal

For the current implementation, generate three CSV files:

1. `master_projections.csv`
2. `projection_match_report.csv`
3. `unmatched_players.csv`

Inputs:

```text
data/raw/NFLDK2026_CS_ClayProjections2026.pdf
data/raw/sleeper_players.json
```

Recommended outputs:

```text
data/generated/master_projections.csv
data/generated/projection_match_report.csv
data/generated/unmatched_players.csv
```

---

# 8. Input: Mike Clay Projection PDF

File:

```text
NFLDK2026_CS_ClayProjections2026.pdf
```

Document:

```text
Mike Clay's 2026 NFL Projection Guide
Updated: 6/22/2026
```

Known structure:

- 82 total pages
- Page 1: guide/glossary
- Pages 2–33: team projections
- Pages 34–57: QB, RB, WR, TE and IDP positional projections
- Pages 58–60: category leader projections
- Page 61: projected standings, playoff teams, draft order
- Page 62: projected strength of schedule
- Page 63: unit grades
- Pages 64–73: positional unit ranks
- Page 74: coaching staffs
- Pages 75–82: projected starters with player ratings

The extraction should focus on offensive fantasy-relevant projections first:

- QB
- RB
- WR
- TE
- K if practical
- DST only if practical and useful

The team pages include offensive player projections with columns that resemble:

```text
Pos
Player
Gm
Passing Att
Passing Comp
Passing Yds
Passing TD
INT
Sk
Rushing Att
Rushing Yds
Rushing TD
Tgt
Rec
Rec Yd
Rec TD
Pts
Rk
```

The PDF also contains defensive/IDP, returners, kickers, punters, coaching staff, offensive line, and weekly score projections. These should not pollute the offensive player extraction.

Be careful with repeated header names like `Att`, `Yds`, and `TD`, which appear in passing, rushing, receiving, returns, kicking, and defense sections. The parser must assign them based on table position/context.

---

# 9. Input: Sleeper Player JSON

File:

```text
sleeper_players.json
```

Source:

```text
https://api.sleeper.app/v1/players/nfl
```

Format:

- JSON object keyed by Sleeper player ID
- Each value contains player metadata

Useful fields:

```text
player_id
full_name
first_name
last_name
search_full_name
team
position
fantasy_positions
age
years_exp
active
status
number
height
weight
college
birth_date
espn_id
yahoo_id
rotowire_id
sportradar_id
fantasy_data_id
gsis_id
```

Sleeper should be treated as the canonical player identity source.

The final projection output should include `sleeper_id` whenever a confident match exists.

---

# 10. Output: master_projections.csv

This is the main output for app use.

One row per projected player.

Recommended columns:

```csv
sleeper_id,
player_name,
first_name,
last_name,
search_full_name,
team,
position,
fantasy_positions,
age,
years_exp,
active,
status,
games,
pass_att,
pass_cmp,
pass_yds,
pass_td,
pass_int,
pass_sacks,
rush_att,
rush_yds,
rush_td,
targets,
receptions,
rec_yds,
rec_td,
fantasy_points,
projection_rank,
projection_source,
projection_date,
season,
match_method,
match_confidence
```

Default metadata:

```text
projection_source = mike_clay
projection_date = 2026-06-22
season = 2026
```

Notes:

- Use numeric columns for stats.
- Do not include `%` signs or commas in numeric values.
- Prefer empty/null for truly missing data.
- Use `0` where the projection explicitly contains zero.
- Use consistent team abbreviations.
- Use consistent positions: `QB`, `RB`, `WR`, `TE`, `K`, `DST` if included.
- Preserve Sleeper fields that are useful for later app features.

---

# 11. Output: projection_match_report.csv

This is the audit trail.

Recommended columns:

```csv
projection_name,
projection_team,
projection_position,
sleeper_id,
sleeper_name,
sleeper_team,
sleeper_position,
match_method,
match_confidence,
notes
```

This file should include every successfully matched projected player.

Purpose:

- Debug bad matches.
- Confirm ambiguous matches.
- Document whether a player was matched exactly, by normalized name, by alias, or by fuzzy logic.
- Avoid silent data quality issues.

Possible `match_method` values:

```text
exact_name_team_position
exact_name_team
exact_name_position
normalized_name_team_position
normalized_name_team
suffix_normalized
alias
fuzzy
manual
unmatched
```

Confidence:

```text
1.00 = exact or near-certain
0.95–0.99 = normalized/alias match
0.85–0.94 = likely but should be reviewed
<0.85 = do not auto-match
```

---

# 12. Output: unmatched_players.csv

This file should contain any projected player that cannot be confidently matched to Sleeper.

Recommended columns:

```csv
projection_name,
projection_team,
projection_position,
games,
fantasy_points,
projection_rank,
reason,
candidate_sleeper_ids,
candidate_names
```

Reasons might include:

```text
no_name_match
multiple_candidates
team_mismatch
position_mismatch
low_fuzzy_confidence
missing_from_sleeper
pdf_parse_error
```

Do not force uncertain matches into `master_projections.csv`.

If a player cannot be matched confidently, either:

1. include the projection row with blank `sleeper_id` and `match_confidence < threshold`, or
2. exclude from master and include in unmatched

Preferred initial approach:

- Include all parsed projections in master.
- Leave `sleeper_id` blank when unmatched.
- Also write them to `unmatched_players.csv`.

That makes the data complete while still surfacing identity gaps.

---

# 13. Matching Strategy

Use Sleeper as canonical identity.

Match hierarchy:

1. Exact normalized name + team + position
2. Exact normalized name + team
3. Exact normalized name + position
4. Suffix-normalized name + team + position
5. Punctuation/apostrophe-normalized name + team + position
6. Known alias mapping
7. Conservative fuzzy matching
8. Manual review list

## Name Normalization

Normalize names by:

- lowercase
- trim whitespace
- collapse repeated whitespace
- remove periods
- remove apostrophes
- remove hyphens
- remove commas
- normalize smart quotes
- remove suffixes:

  - Jr
  - Jr.
  - Sr
  - Sr.
  - II
  - III
  - IV
  - V

- optionally remove spaces for `search_full_name` style comparison

Examples:

```text
Marvin Harrison Jr. -> marvin harrison
Ja'Marr Chase -> jamarr chase
Amon-Ra St. Brown -> amonra st brown
C.J. Stroud -> cj stroud
Brian Thomas Jr. -> brian thomas
```

## Position Normalization

Sleeper positions may include more specific defensive or football positions. For offensive fantasy:

```text
QB -> QB
RB -> RB
WR -> WR
TE -> TE
K -> K
DEF/DST -> DST
```

For this initial projection task, focus on offensive positions and kickers.

## Team Normalization

Be aware of abbreviation differences:

```text
JAC vs JAX
BAL vs BLT
CLE vs CLV
HOU vs HST
ARI vs ARZ
```

Mike Clay’s PDF appears to use some nonstandard or old-school abbreviations such as:

```text
BLT
CLV
HST
```

Normalize these to the Sleeper/NFL convention used in the app.

Suggested mapping:

```text
ARZ -> ARI
BLT -> BAL
CLV -> CLE
HST -> HOU
JAC -> JAX
LA -> LAR if needed
WSH -> WAS if needed
```

Check the actual PDF output before finalizing.

## Fuzzy Matching

Use fuzzy matching only when candidate sets are small.

Recommended rules:

- Filter candidates by position first.
- Prefer same team strongly.
- Do not fuzzy match across different positions unless there is a known reason.
- Do not accept fuzzy matches below a conservative threshold.
- If two candidates are close, leave unmatched.

---

# 14. Parser Design Considerations

The PDF is large and visually dense. Do not rely only on naive text extraction if it produces unstable rows.

Potential extraction approaches:

- `pdfplumber`
- `camelot`
- `tabula`
- PyMuPDF text blocks
- OCR only as a last resort

Recommended approach:

1. Try structured table extraction on pages with offensive projections.
2. Fall back to text line parsing if tables do not extract cleanly.
3. Use positional context to separate offensive projection tables from defense, returns, kicking, weekly projections, and metadata.
4. Validate extracted rows against expected position values.

The team pages appear to have consistent offensive rows like:

```text
QB Josh Allen 17 509 340 3945 26 12 36 116 579 12 0 0 0 0 369 1
RB James Cook 17 0 0 0 0 0 0 300 1400 11 46 36 302 2 279 7
WR DJ Moore 17 0 0 0 0 0 0 7 36 0 107 67 946 7 210 26
TE Dalton Kincaid 17 0 0 0 0 0 0 0 0 0 82 59 698 4 156 17
```

The parser should detect:

```text
QB
RB
WR
TE
```

at the start of a row and then parse the stat sequence.

Avoid rows like:

```text
QB Total
RB Total
WR Total
TE Total
Total
KR
PR
DI
ED
LB
CB
S
KICKER
PUNTER
```

unless intentionally supporting K/DST later.

Initial goal: extract individual offensive skill players only.

---

# 15. Suggested Implementation Structure

Suggested repo structure:

```text
scripts/projections/
  extract_mike_clay.py
  normalize_sleeper.py
  match_players.py
  validate_outputs.py
  generate_master_csv.py
  README.md
```

Alternative TypeScript structure if the repo prefers TS:

```text
scripts/projections/
  extractMikeClay.ts
  normalizeSleeper.ts
  matchPlayers.ts
  validateOutputs.ts
  generateMasterCsv.ts
  README.md
```

Suggested input/output folders:

```text
data/
  raw/
    NFLDK2026_CS_ClayProjections2026.pdf
    sleeper_players.json
  generated/
    raw_mike_clay_projections.csv
    normalized_sleeper_players.csv
    master_projections.csv
    projection_match_report.csv
    unmatched_players.csv
```

Intermediate files are useful for debugging.

---

# 16. Suggested Pipeline

## Step 1: Extract Mike Clay projections

Input:

```text
data/raw/NFLDK2026_CS_ClayProjections2026.pdf
```

Output:

```text
data/generated/raw_mike_clay_projections.csv
```

Columns:

```csv
projection_name,
projection_team,
projection_position,
games,
pass_att,
pass_cmp,
pass_yds,
pass_td,
pass_int,
pass_sacks,
rush_att,
rush_yds,
rush_td,
targets,
receptions,
rec_yds,
rec_td,
fantasy_points,
projection_rank,
source_page
```

## Step 2: Normalize Sleeper players

Input:

```text
data/raw/sleeper_players.json
```

Output:

```text
data/generated/normalized_sleeper_players.csv
```

Columns:

```csv
sleeper_id,
full_name,
first_name,
last_name,
search_full_name,
normalized_name,
team,
position,
fantasy_positions,
age,
years_exp,
active,
status
```

## Step 3: Match projections to Sleeper

Inputs:

```text
raw_mike_clay_projections.csv
normalized_sleeper_players.csv
```

Outputs:

```text
projection_match_report.csv
unmatched_players.csv
```

## Step 4: Generate master CSV

Inputs:

```text
raw_mike_clay_projections.csv
normalized_sleeper_players.csv
projection_match_report.csv
```

Output:

```text
master_projections.csv
```

## Step 5: Validate

Checks:

- no duplicate projection rows by player/team/position
- no duplicate Sleeper IDs unless intentional
- all numeric stat columns parse as numbers
- all projected players have a `projection_source`
- all projected players have `season`
- count players by position
- count matched/unmatched by position
- identify suspicious fantasy point outliers
- identify suspicious zero-stat players
- verify major known players matched correctly

---

# 17. Validation Targets

The validation step should print a summary like:

```text
Mike Clay projections extracted:
QB: 64
RB: 110
WR: 180
TE: 95
K: 32

Matched to Sleeper:
QB: 63 / 64
RB: 108 / 110
WR: 176 / 180
TE: 93 / 95
K: 31 / 32

Unmatched:
8 total

Duplicate Sleeper IDs:
0

Output written:
data/generated/master_projections.csv
data/generated/projection_match_report.csv
data/generated/unmatched_players.csv
```

The exact counts will depend on parsing scope.

Known sanity-check players from the PDF:

```text
Josh Allen, BUF, QB
Lamar Jackson, BAL, QB
Joe Burrow, CIN, QB
Bijan Robinson, ATL, RB
James Cook, BUF, RB
Derrick Henry, BAL, RB
Ja'Marr Chase, CIN, WR
Drake London, ATL, WR
Marvin Harrison Jr., ARI, WR
Trey McBride, ARI, TE
Dalton Kincaid, BUF, TE
Colston Loveland, CHI, TE
```

These should match Sleeper confidently.

---

# 18. Relationship to League-Specific Fantasy Points

The immediate CSV can preserve Mike Clay’s `Pts` column as `fantasy_points`.

However, for DraftOps, the more important future task is recalculating fantasy points from raw projected stats using each draft’s scoring settings.

The projection engine should eventually calculate fantasy points dynamically from:

```text
pass_yds
pass_td
pass_int
rush_att
rush_yds
rush_td
targets
receptions
rec_yds
rec_td
fumbles if available
bonuses if available
```

and Draft settings:

```text
scoringSettings
startingLineup
teamCount
rosterSize
budget
targetRoster
```

The Mike Clay `Pts` column can be used for sanity checks, but it may not match a user’s league scoring.

Future generated fields:

```text
projected_points_default
projected_points_league
replacement_points
vor
auction_value
```

---

# 19. VOR Model Direction

Value Over Replacement should be based on league format.

Conceptual algorithm:

1. Calculate projected fantasy points for every player under the draft’s scoring settings.
2. Determine required starters by position using:

   - team count
   - starting lineup
   - flex slots
   - superflex slots
   - roster size
   - target roster construction

3. Estimate replacement level for each position.
4. For each player:

   - `vor = projected_points - replacement_points_for_position`

5. Clamp negative VOR to zero for auction dollar allocation.
6. Allocate auction dollars across positive VOR players.
7. Apply budget constraints and roster construction rules.

Special handling needed:

- Superflex dramatically changes QB replacement level.
- Flex slots affect RB/WR/TE replacement levels.
- TE premium changes TE projected points and replacement level.
- Deep benches increase replacement depth.
- Dynasty values may require blending projection VOR with long-term market values.

Initial VOR can be simple and improved later.

---

# 20. Auction Value Allocation Direction

A basic projection-based auction model:

```text
total_league_budget = team_count * budget
reserved_endgame_budget = total_roster_spots * min_bid
auction_budget_available_for_value = total_league_budget - reserved_endgame_budget
```

Then:

```text
player_value = player_vor / total_positive_vor * auction_budget_available_for_value
```

This gives raw projection auction values.

Potential refinements:

- position scarcity multipliers
- top-heavy value curve
- risk adjustments
- ceiling/floor adjustments
- dynasty market value blending
- inflation based on draft state

This should not be overcomplicated in V1.

---

# 21. Live Draft Connection

Eventually, projections and VOR should feed the live draft engine.

DraftOps already tracks:

- available players
- rostered players
- remaining budgets
- team rosters
- team needs
- completed bids
- nominations
- watchlist
- spending patterns

The live engine should eventually update:

- remaining player values
- positional scarcity
- budget pressure
- nomination scores
- recommended max bids
- remaining value by tier
- team-specific need pressure

Example future behavior:

```text
Current bid: $37
Projection value: $43
Market inflation: +8%
Your roster need: High
Recommended max: $46
```

Nomination advice could eventually say:

```text
Nominate Player X because four teams still need TE,
those teams have above-average remaining budget,
and you do not want to buy him at inflated price.
```

This is out of scope for the immediate CSV generation, but the ETL should be designed so it can support this direction.

---

# 22. Roadmap Edits to Consider Later

After the first ETL works, consider editing `ROADMAP.md` to add a dedicated projection milestone.

Possible new milestone:

## 5d. Projection ETL + Sleeper Identity Mapping

Blocked by:

- 5a, because the Player model exists there
- optionally 5c, because Sleeper import establishes Sleeper as a core integration

Deliverables:

- local script to parse projection source
- Sleeper player normalization
- projection-to-Sleeper matching
- `sleeperId` added to Player model if not already present
- `master_projections.csv`
- match report
- unmatched report

Possible new milestone:

## 5e. Projection-Aware VOR Engine

Blocked by:

- 5b
- 5d

Deliverables:

- fantasy point calculator from raw projected stats and draft scoring settings
- replacement-level calculation
- VOR calculation
- projection-based auction value generation
- per-draft projected values stored on Player or related Projection table

Possible new milestone:

## 5f. Projection Source Abstraction

Blocked by:

- 5d or 5e

Deliverables:

- source interface for Mike Clay, FantasyPros, custom CSV, etc.
- source metadata
- validation rules
- import history
- ability to swap or compare projection sources

These edits should be made after the first implementation proves the right data model.

---

# 23. Suggested Database Direction

For the immediate task, CSV outputs are enough.

Longer term, consider separating identity, projections, and per-draft values.

Possible models:

## Player

Canonical per-player identity.

```text
id
sleeperId
fullName
firstName
lastName
team
position
age
yearsExp
active
```

## ProjectionSource

```text
id
name
season
projectionDate
createdAt
```

## PlayerProjection

```text
id
playerId
sourceId
season
games
passAtt
passCmp
passYds
passTd
passInt
rushAtt
rushYds
rushTd
targets
receptions
recYds
recTd
projectedPointsDefault
```

## DraftPlayerValue

Per-draft calculated values.

```text
id
draftId
playerId
projectionId
projectedPointsLeague
replacementPoints
vor
auctionValue
fallbackValue
activeValue
valueSource
```

This may be overkill for V1, but the ETL should not make future migration harder.

---

# 24. Implementation Guardrails

Do:

- build reproducible scripts
- keep raw files separate from generated files
- write intermediate CSVs
- generate validation summaries
- use Sleeper IDs as canonical identities
- preserve match confidence
- surface unmatched players
- keep matching logic conservative
- document known aliases/manual mappings

Do not:

- manually edit the final master CSV
- silently force fuzzy matches
- hardcode one PDF page layout too tightly
- mix defensive/return/kicker rows into offensive projections accidentally
- overwrite prior generated outputs without warning if versioning is easy
- bury parsing errors
- treat Mike Clay `Pts` as universal league-specific fantasy points

---

# 25. Suggested First Codex Task

Ask Codex:

```text
Read ROADMAP.md and docs/draftops-projections-etl-brief.md.

Then inspect the repo structure and propose the smallest clean implementation plan for a local projection ETL script.

The script should read:

- data/raw/NFLDK2026_CS_ClayProjections2026.pdf
- data/raw/sleeper_players.json

and generate:

- data/generated/master_projections.csv
- data/generated/projection_match_report.csv
- data/generated/unmatched_players.csv

Before writing implementation code, identify:
1. Whether this should be Python or TypeScript in this repo.
2. What dependencies are needed for PDF parsing.
3. Where the scripts should live.
4. What intermediate files should be generated.
5. How validation should be run.
```

After that plan is approved, ask Codex to implement the pipeline incrementally.

Recommended implementation order:

1. Sleeper JSON normalization
2. Mike Clay PDF extraction for a few sample pages
3. Full offensive projection extraction
4. Matching
5. Master CSV generation
6. Validation summary
7. README usage instructions

---

# 26. Suggested Local Commands

Potential local workflow:

```bash
mkdir -p data/raw data/generated docs
```

Place files:

```text
data/raw/NFLDK2026_CS_ClayProjections2026.pdf
data/raw/sleeper_players.json
docs/draftops-projections-etl-brief.md
```

Run script eventually:

```bash
python scripts/projections/generate_master_csv.py
```

or:

```bash
pnpm projections:generate
```

Expected outputs:

```text
data/generated/master_projections.csv
data/generated/projection_match_report.csv
data/generated/unmatched_players.csv
```

---

# 27. Final Product Principle

The main principle:

> Sleeper is the identity layer. Projections are a value input. DraftOps is the decision engine.

Keep those responsibilities separate.

Sleeper answers:

```text
Who is this player?
```

Projections answer:

```text
What is this player expected to produce?
```

League settings answer:

```text
How much does that production matter in this league?
```

Draft state answers:

```text
How valuable is this player right now, given what has happened in the auction?
```

DraftOps should combine all four.
