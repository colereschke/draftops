# Value Adjustment Algorithm — Design Spec (#5b, Phase 1)

**Date:** 2026-07-06
**Roadmap item:** #5b — Configurable League Settings: Value Adjustment Algorithm
**Depends on:** #5a (settings model + per-draft `Player` table) — merged (PR #20)

## Summary

Starting from the base ETR values seeded 1:1 in #5a, compute adjusted `budget`/`ceiling`/`floor`
per player based on how a draft's league settings differ from the standard baseline. Three forces
combine into a per-player multiplier:

1. **Scoring multiplier** (per position) — richer scoring for a position raises its values.
2. **Lineup-scarcity multiplier** (per position) — more effective starting demand for a position
   raises its values; FLEX/SUPER_FLEX demand flows toward the scoring-favored position.
3. **Concentration tilt** (per rank) — fewer total starting slots in the league (teams × lineup size)
   concentrates value at the top of the pool; more slots flatten it.

This is **Phase 1** — position-level math with no per-player projections. It ships the
settings→value plumbing and the position-level algorithm. **Phase 2** (separate spec) layers
per-player Mike-Clay-projection dual-scoring on top, with the Phase 1 position-level coefficients
serving as the graceful fallback for unmatched players.

## Scope decisions (why Phase 1 is position-level)

The player pool is a single blended FantasyCalc/ETR **dynasty market value** per player — there are
no per-player box-score projections (receptions, rush attempts, pass yards, first downs). Converting
a scoring change into a _per-player_ value change requires volume, which we don't have. Two forces
(scoring, lineup) are therefore **position-uniform** in Phase 1; the third (concentration) is
rank-based and needs no projections.

Projections were evaluated and deliberately deferred to Phase 2:

- **Points aren't enough** — re-scoring under arbitrary settings needs box-score _components_, not
  fantasy points under one scoring system. Component projections are the hard part to source.
- **The base is dynasty value, not seasonal points** — replacing it with projected points would
  destroy the dynasty premium on young players and break the age-color system. Projections must
  _layer on top_ of the dynasty base (as per-player category exposure), not replace it.
- **Source constraint** — Mike Clay / ESPN projections (well-regarded, publicly available) arrive as
  **PDF**. Phase 2's hard rule: the app never parses a PDF; a CSV with a defined schema is prepared
  once per season and checked in. First downs are not projected by anyone and are volatile — Phase 2
  synthesizes them from historical position-level conversion rates baked in as constants.

Splitting keeps Phase 1 fast and feedback-ready (unblocks #8, gets the ETR Discord using custom
lineups/scoring/team-counts now) and isolates the riskiest projection work — consistent with how
every prior milestone (Postgres, multi-draft, #5a) shipped as an incremental arc.

## Out of scope (Phase 1)

- Mike Clay / any projection ingestion, player matching, per-player dual-scoring — **Phase 2**.
- First-down historical conversion rates — **Phase 2**.
- Value-over-replacement concentration (replaces §2c's median pivot) — **Phase 2**.
- Dynamic pick-package valuation (PICK/PKG stay at base value here) — **#8b**.
- A settings-edit UI. Phase 1 runs the adjustment once at draft creation. The algorithm is a pure
  function so a future edit flow can recompute idempotently.

---

## 1. Data model & plumbing

### Schema — three new columns on `Player`

```prisma
model Player {
  // ... existing fields ...
  budget      Int   // ADJUSTED — what the app displays and computes from
  ceiling     Int   // ADJUSTED
  floor       Int   // ADJUSTED
  baseBudget  Int   // untouched ETR base value
  baseCeiling Int   // untouched ETR base value
  baseFloor   Int   // untouched ETR base value
}
```

- `budget`/`ceiling`/`floor` remain the fields every existing consumer reads — they now hold the
  **adjusted** values, so no downstream query changes.
- `base*` holds the untouched ETR value. Recompute is always **base → adjusted**, never compounding.
- Storing base on the row (rather than re-reading `players.ts`) makes each draft self-contained:
  #7 (custom rankings) and Phase 2 (projections) both replace the source per-draft, so the base must
  live with the draft.
- **Backfill migration:** for existing drafts, set `base*` = current `budget`/`ceiling`/`floor`
  (they were seeded 1:1, so base == current today). No value change for existing drafts until they
  are recomputed.

### Pure adjustment function

```ts
// src/lib/valueAdjustment.ts
export function adjustPlayerValues(
  basePlayers: BasePlayer[], // name, pos, sfRank, baseBudget, baseCeiling, baseFloor
  settings: DraftSettings, // startingLineup, scoringSettings, teamCount
): AdjustedPlayer[];
```

- Deterministic, no I/O — unit-testable in isolation.
- `createDraft` calls it in-memory and inserts base + adjusted in the same `createMany`
  (`src/lib/actions.ts:141`). No second DB pass.
- Ceiling/floor for adjusted values are re-derived from the adjusted budget using the existing rules:
  `ceiling = round(budget × 1.15)`, `floor = max(5, round(budget × 0.87))`.

---

## 2. The three forces

All computed per player. Compute order: **scoring (2b) → lineup (2a) → concentration (2c)**, because
FLEX allocation in 2a consumes 2b's per-position scoring multiplier (scoring does not depend on
lineup, so there is no cycle).

Positions adjusted: **QB, RB, WR, TE**. **PICK and PKG are never adjusted** in Phase 1.

### 2b. Scoring multiplier (per position)

```
scoringMult[P] = clamp(1 + Σ_d coef[d] × (setting[d] − baseline[d]), SCORING_BAND)
```

over the scoring dimensions `d` that affect position `P`:

| Dimension (`ScoringSettings` field) | Affects                    | Notes                                   |
| ----------------------------------- | -------------------------- | --------------------------------------- |
| `pprRB`                             | RB                         | reception premium                       |
| `pprWR`                             | WR                         | reception premium                       |
| `pprTE`                             | TE                         | TE-premium driver                       |
| `rushAtt`                           | RB (primary), QB (smaller) | point-per-carry                         |
| `rushFD`                            | RB, QB                     | rushing first-down bonus                |
| `recFD` + `rbFDBonus`               | RB                         | receiving first-down bonus              |
| `recFD` + `wrFDBonus`               | WR                         |                                         |
| `recFD` + `teFDBonus`               | TE                         |                                         |
| `passTD`                            | QB                         | 6 vs 4                                  |
| `passYdsPerPoint`                   | QB                         | fewer yds/pt ⇒ more QB points (inverse) |
| `passInt`                           | QB                         | minor                                   |

- `baseline[d]` = `DEFAULT_SCORING_SETTINGS[d]` (already exported from `src/types/index.ts`).
- Each `coef[d]` is a **backend constant** in a `SCORING_COEF` table, set from domain intuition
  and tuned after the first real draft. Never user-facing.
- **TE premium is the dominant, high-magnitude case — calibrate it aggressively.** Target leagues
  routinely run TE reception scoring at **1.5×–2.0× the base rate** (`pprTE` of 1.5, 1.75, or 2.0
  against a 1.0 baseline — a delta up to **+1.0**). A 1.75×–2× premium is common, not an edge case.
  The `pprTE` coefficient must be steep enough that a 2× premium is a _large_ boost (see the worked
  scenario in §3), not a token bump. This is the single most important coefficient to get right, and
  it is why the TE scoring band (§3) is widened beyond the other positions'.
- `passYdsPerPoint` is inverse: fewer yards-per-point ⇒ higher QB scoring. Use the delta of
  `(1 / setting) − (1 / baseline)` (points-per-yard) so the direction is correct.

### 2a. Lineup-scarcity multiplier (per position)

Effective starting **demand** per position, then a scarcity ratio vs. the baseline lineup.

**Baseline lineup:** `QB, RB, RB, WR, WR, TE, FLEX, FLEX, FLEX, SUPER_FLEX` (`DEFAULT_STARTING_LINEUP`).
FLEX is RB/WR/TE-eligible; SUPER_FLEX is QB/RB/WR/TE-eligible.

```
demand[P] = dedicatedSlots[P]
          + Σ_flexSlots   ( allocWeight[P | RB,WR,TE] )
          + Σ_sfSlots     ( allocWeight[P | QB,RB,WR,TE] )

allocWeight[P | eligibleSet] = (startability[P] × scoringMult[P])
                             / Σ_{Q ∈ eligibleSet} (startability[Q] × scoringMult[Q])

scarcityMult[P] = clamp( (demand[P] / baselineDemand[P]) ^ elasticity[P], SCARCITY_BAND )
```

- `startability[P]` = a per-position baseline weight reflecting how deep the flex-worthy pool is at
  that position (so baseline FLEX skews RB/WR, not TE). Default: derived from the base value pool
  (summed `baseBudget` of players at `P` beyond the dedicated-starter count), captured as a per-position
  constant. Multiplying by `scoringMult[P]` makes FLEX flow toward the scoring-favored position —
  this is the fix for the "extra RB slots shouldn't inflate RB when scoring loves WR" case.
- The demand **ratio** already gives TE the largest swing (1→2 dedicated TE = 2.0× vs. adding one RB
  to a ~3-demand base = ~1.33×). `elasticity[P]` is a tunable exponent; `elasticity[TE] > 1` amplifies
  for TE's thin real-world supply, others ≈ 1.
- `baselineDemand[P]` is `demand[P]` computed against `DEFAULT_STARTING_LINEUP` with baseline scoring
  (all `scoringMult = 1`).

### 2c. Concentration tilt (per rank)

```
totalStarters   = teamCount × startingLineup.length
BASELINE_STARTERS = 12 × 10 = 120
k               = (BASELINE_STARTERS − totalStarters) / BASELINE_STARTERS   // >0 ⇒ shallower ⇒ top-heavy
rankPercentile  = idx / (N − 1)   // idx = ordinal by sfRank among adjustable (QB/RB/WR/TE) players; N = their count; spans [0,1], 0 = best
concentrationFactor = clamp( 1 + k × CONCENTRATION_C × (0.5 − rankPercentile), CONCENTRATION_BAND )
```

- Pivots around the median: shallow leagues boost elites (`rankPercentile → 0`) and discount depth.
- `CONCENTRATION_C` is a tunable sensitivity constant.
- The median pivot is a Phase-1 approximation; Phase 2 replaces it with a value-over-replacement
  pivot once projected points exist.

---

## 3. Combine, caps & edge cases

```
adjustedBudget  = round( baseBudget × scarcityMult[P] × scoringMult[P] × concentrationFactor )
adjustedBudget  = max(1, adjustedBudget)
adjustedCeiling = round( adjustedBudget × 1.15 )
adjustedFloor   = max( 5, round(adjustedBudget × 0.87) )
```

- **No blanket total cap.** #5b's purpose is that big settings differences yield big value changes
  (a 2-TE + steep-TE-premium league _should_ make elite TEs much pricier). Each force is individually
  clamped to a sane band so no single force explodes, but they compound. Bands are tunable constants:
  - `SCARCITY_BAND` ≈ `[0.70, 1.60]`
  - `SCORING_BAND` ≈ `[0.70, 1.50]` for QB/RB/WR; **`[0.70, 1.90]` for TE**
  - `CONCENTRATION_BAND` ≈ `[0.80, 1.25]`
- **TE scoring band is deliberately wider.** 1.75×–2× TE premiums are common in target leagues, and a
  position-uniform `scoringMult[TE]` capped at 1.50 would under-price elite TEs in those formats. The
  wider TE band lets a steep premium land. (3-TE-start leagues do not occur in the target audience, so
  the lineup force never needs to differentiate 2TE from 3TE — the 1.60 scarcity cap is a fine ceiling.)
- **Worked scenario — 2 TE starters + 2× TE premium (`pprTE = 2.0`):**
  - Lineup: 2 dedicated TE slots + FLEX pulled toward TE by the premium ⇒ demand ratio well above the
    cap ⇒ `scarcityMult[TE] = 1.60` (clamped).
  - Scoring: `+1.0` delta on `pprTE` with an aggressive coefficient lands near the top of the widened
    TE band ⇒ `scoringMult[TE] ≈ 1.7–1.9`.
  - Combined (before concentration): `1.60 × ~1.8 ≈ 2.9×` base for an elite TE. A $50 base TE ⇒ ~$145.
- **Known Phase-1 limitation (calls for Phase 2):** position-uniform scaling moves _every_ TE by the
  same factor. But a steep premium actually _widens_ the gap between an elite pass-catching TE and a
  low-volume one (the elite catches far more balls at the premium rate). Phase 1 therefore correctly
  moves TE values up as a group but **compresses the elite-vs-replacement TE spread** that the premium
  really creates. This is exactly what Phase 2's per-player dual-scoring fixes — premium-league
  accuracy is the strongest argument for Phase 2, and worth setting expectations on before then.
- **PICK / PKG:** `scarcityMult = scoringMult = concentrationFactor = 1` (unadjusted). They have no
  positional scoring, and dynamic pick valuation is #8b — leaving them at base avoids collision.
- **Identity check:** with `DEFAULT_STARTING_LINEUP`, `DEFAULT_SCORING_SETTINGS`, and `teamCount = 12`,
  every multiplier is exactly `1.0` and adjusted values equal base values. This must hold as a test.

---

## 4. Consumer rewiring (roadmap-mandated for #5b)

- `src/lib/computeTeamStats.ts` — take `rosterSize` from `draft.rosterSize` instead of the
  `ROSTER_SIZE` constant. Callers (`/draft/[draftId]/teams`, `/budget`) pass it through.
- `src/lib/nominationScoring.ts` — read `draft.targetRoster` (with `DEFAULT_TARGET_ROSTER` fallback)
  instead of the `TARGET_ROSTER` constant.
- Audit for any remaining hardcoded `12` / team-count assumptions; team count already derives from DB
  teams. `LEAGUE_TEAMS` is seed data and stays.
- `ROSTER_SIZE` / `TARGET_ROSTER` constants remain exported as the defaults the settings default to,
  but are no longer read directly by runtime calculations.

---

## 5. Tunable constants (single module, backend-only)

All calibration lives in one place (e.g. `src/lib/valueAdjustment.constants.ts`) so tuning after the
first real draft is a one-file change:

- `SCORING_COEF` — per-dimension sensitivity coefficients. `pprTE` is the highest-stakes entry.
- `POSITION_STARTABILITY` — per-position baseline flex startability weights.
- `POSITION_ELASTICITY` — per-position scarcity exponent (TE > 1).
- `CONCENTRATION_C`, `BASELINE_STARTERS`.
- `SCARCITY_BAND`, `CONCENTRATION_BAND`, and `SCORING_BAND` **keyed by position** (TE wider — see §3).

Initial values are seeded from domain intuition and sanity-checked against the identity case and a few
known scenarios (2-TE start + 2× TE premium ⇒ elite TE up ~2.5–3×; 10-team start-9 ⇒ elite QB/RB up,
depth down).

---

## 6. Testing

- **Identity:** default settings ⇒ adjusted == base for every player (per position and overall).
- **Scoring:** raising `pprTE` above baseline raises every TE's budget and nothing else's; QB passing
  changes move only QBs.
- **TE premium magnitude:** a 2× TE premium (`pprTE = 2.0`) drives `scoringMult[TE]` into the widened
  TE band (well above the 1.50 general cap), and combined with a 2-TE lineup lands an elite TE at
  ~2.5–3× base — the headline target scenario.
- **Lineup:** adding a second dedicated TE slot raises TE more than adding an RB raises RB; a
  WR-favored-scoring lineup with extra FLEX routes demand to WR, not RB.
- **Concentration:** a shallower league (fewer teams or fewer starters) raises the top of the pool and
  lowers the bottom; a deeper league does the reverse; the pivot player is ≈ unchanged.
- **Caps:** each force stays within its band under extreme settings (TE scoring band wider than the
  rest); adjusted budget ≥ 1, floor ≥ 5.
- **PKG/PICK:** unchanged from base under any settings.
- **Purity:** `adjustPlayerValues` is deterministic and side-effect-free.
- **Plumbing:** `createDraft` persists both base and adjusted; `computeTeamStats` honors a non-30
  `rosterSize`; nomination scoring honors a non-default `targetRoster`.

---

## 7. Implementation surface (for the plan)

- `prisma/schema.prisma` — add `baseBudget`/`baseCeiling`/`baseFloor`; migration + backfill.
- `src/lib/valueAdjustment.ts` — `adjustPlayerValues` + the three force functions.
- `src/lib/valueAdjustment.constants.ts` — tunable constants.
- `src/lib/actions.ts` — `createDraft` seeds base + adjusted via the pure function.
- `src/lib/computeTeamStats.ts` — `rosterSize` parameter.
- `src/lib/nominationScoring.ts` — `targetRoster` from draft.
- Consumers of the two above (teams/budget/nominate pages, nomination-data route) pass draft settings.
- `prisma/seed-players.ts` — set `base*` when seeding/backfilling.
- Tests per §6.

```

```
