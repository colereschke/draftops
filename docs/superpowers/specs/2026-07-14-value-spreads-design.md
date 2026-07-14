# Value Spreads — Design Spec

**Date:** 2026-07-14
**Status:** Approved, ready for implementation plan
**Roadmap:** Successor to the removed "strategy value lens" (#33, `f2f2aa9`/`4bc6cf5`)

## Problem

The original **Lens** feature let the user pick a strategy (rebuild / balanced / contender) and
dynamically shifted each player's displayed auction value toward its projection value, weighted by
strategy and age (`src/lib/strategyValue.ts`, since removed). It was pulled because it **mutated the
price** — the value number is the tool's anchor and the shared reference for every bid, and sliding
it around based on a strategy toggle corrupted that anchor.

We still want the underlying signal — _where does production-based value disagree with the dynasty
market's price?_ — but delivered as an **advisory overlay on a fixed value**, never as a mutation of
the value itself.

### Why not a raw-dollar delta

An early idea was to surface `projectionAuctionValue − dynastyValue` in dollars. This fails
structurally: the VOR→dollar allocator (`src/lib/projectionVor.ts`) only distributes real dollars to
**above-replacement** players and zeroes the rest to \$1, while dynasty value spreads dollars across
the entire ~267-player pool. So projection-dollars sit systematically below dynasty-dollars for most
of the board, and a raw-dollar delta would mostly re-measure that structural bias rather than any
genuine per-player signal.

The fix is to compare **ranks**, not dollars. Rank/percentile is scale-invariant: it isolates the
one thing we want — _does the market rank this player differently than his production does?_ — and is
immune to the dollar-scale compression near replacement.

## The metric: Spread

For each **position** (QB / RB / WR / TE) independently:

1. Build the **common set** — players at that position that have BOTH a dynasty value and an
   above-replacement projection (`vor > 0` / non-null `projectionAuctionValue`).
2. Rank the common set two ways, descending (1 = best):
   - `dynRank` — by dynasty value (`baseBudget`, falling back to `budget`)
   - `projRank` — by projected points / `projectionAuctionValue` (identical ordering, since
     projection-\$ is monotonic in VOR within a position)
3. Normalize each rank to a percentile within the common set of size `N`:
   `pct = (N − rank) / (N − 1) × 100` (single-element sets → both percentiles 0, spread 0).
4. **`spread = pctProj − pctDyn`**, rounded to an integer.
   - `spread > 0` → projection ranks him **higher** than the market → **underpriced**
   - `spread < 0` → market ranks him **higher** than production justifies → **overpriced**

Position-relative because pool sizes differ wildly (≈40 startable WR vs ≈12 TE); a fixed
cross-position gap would be meaningless. Restricting both ranks to the same common set keeps the two
percentiles on a shared footing.

The Spread number is shown for **every** common-set player, regardless of age. Age only gates the
_tag_, not the number.

## The tags: age-aware 2×2

A discrete archetype badge fires only when a player (a) has a Spread, (b) falls in the **young** or
**old** per-position age band, and (c) clears the gate `|spread| ≥ THRESHOLD` (default 15 percentile
points, tunable):

|             | underpriced (`spread > 0`) | overpriced (`spread < 0`) |
| ----------- | -------------------------- | ------------------------- |
| **OLDER**   | `WIN-NOW`                  | `FADE`                    |
| **YOUNGER** | `BARGAIN`                  | `FUTURE`                  |

Rationale for the four quadrants:

- **WIN-NOW** — older + market underrates production. The dynasty market discounts age harder than
  current production warrants; a contender exploits it.
- **BARGAIN** — younger + underpriced. Produces now _and_ cheap; good for anyone, not a strategy
  play — but worth flagging because the market hasn't caught up.
- **FUTURE** — younger + overpriced. Market pays an upside premium not yet in production; a rebuild
  asset a contender should let go.
- **FADE** — older + overpriced. Old _and_ the market overpays relative to production; avoid.

**Prime-age (25–27 band) and gate-failing players show the Spread number but no tag.**

### No-read (number renders as "—", no tag)

- Below replacement (`vor <= 0` / null `projectionAuctionValue`)
- No projection data for the player
- No dynasty value

Same honesty principle as the tendency engine's `no-read` gate.

## Age bands: shared, per-position

The current `src/lib/ageColor.ts` uses **global** age bands (≤24 young / 25–27 prime / 28–30 aging /
31+ old). This is a latent honesty bug — a 28-year-old RB and a 28-year-old QB render identically
despite being at very different career stages. We fix it in the same stroke as building the tag
logic, since we need per-position age bands anyway.

**`src/lib/ageBands.ts`** — single source of truth: `ageBand(age, pos?) → 'young' | 'prime' |
'aging' | 'old'`.

- With a position → per-position 4-band cutoffs from `ageBands.constants.ts`.
- Without a position (team-average age in `DossierFace.tsx:129`) → global fallback bands (the
  current values). A roster's average age is not position-specific, so the global fallback is
  correct there.

**Per-position cutoffs** (`ageBands.constants.ts`, tunable). Format = three ascending boundaries
`[youngMax, primeMax, agingMax]`; `old = agingMax + 1` and up:

| Pos | young ≤ | prime ≤ | aging ≤ | old ≥ |
| --- | ------- | ------- | ------- | ----- |
| QB  | 25      | 29      | 31      | 32    |
| RB  | 23      | 25      | 27      | 28    |
| WR  | 24      | 27      | 29      | 30    |
| TE  | 24      | 27      | 29      | 30    |

**Tag age mapping:** `YOUNGER = young` band; `OLDER = old` band. The `prime` and `aging` bands
produce **no age lean** → no tag (Spread number still shown). Tags only fire at the clear young/old
extremes; the amber "aging" middle stays untagged. This matches the conservative OLDER thresholds
above (QB ≥32, RB ≥28, WR/TE ≥30).

**Retrofit:** `ageColor` is rewritten to consume `ageBand(age, pos?)` and map band → existing CSS
token (`--age-young` / `--age-prime` / `--age-aging` / `--age-old`). `PlayerTable.tsx:216` passes
`p.pos`; `DossierFace.tsx:129` passes no position (global fallback). The player-row age colors on `/`
will **visibly shift** for some players (e.g. a 28-yo RB moves from aging toward old) — this is a
deliberate, correct change, not silent.

## Rendering

The verbose 2×2 label does not live on every dense sheet row. The signal splits across surfaces by
density.

### Value sheet (`/`) — compact & scannable

- **New sortable "Spread" column** in `PlayerTable.tsx`: signed integer with a direction color
  (green = underpriced `spread > 0` / red = overpriced `spread < 0`), monospace tabular-nums.
  No-read → muted "—".
- **Archetype filter chips** in `FilterControls.tsx`: `Win-now | Bargain | Future | Fade | All`.
  Pure **view filter** — isolates rows by archetype, never touches values. `All` = default.
- **Sort by Spread** added to the sort options (descending surfaces WIN-NOW/BARGAIN at the top).
- Sort/filter state lives in `AuctionSheet.tsx` alongside existing filter state; the Spread values
  themselves are precomputed server-side (below), so no client re-ranking.

### Bid modal — rich, at the decision point

Extend the **existing "Price context" panel** (`BidModal.tsx:89`, already shows Dynasty / Projection
/ Active). Add the Spread and, when a tag fires, the full archetype label plus a one-line
plain-English reason:

```
Price context
Dynasty #24 · Proj #12 · Spread +12
[ WIN-NOW ]  Projection ranks him well above the
market; older → a win-now buy the market discounts.
```

The full 2×2 label only appears here — the moment the user is weighing a bid — not while scanning 267
rows.

## Architecture & data flow

**Computation is server-side and static per draft.** Spreads depend only on the pool's dynasty
values, projection values, and ages — none of which change as bids are logged (won players remain in
the ranking population). So `/` (`src/app/page.tsx`, already a server component) computes spreads once
and passes them down; the client only handles sort/filter. No `useEffect`, no client re-ranking.

**New / changed files:**

| File                                             | Role                                                                                                                                              |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/ageBands.ts`                            | **new** — shared `ageBand(age, pos?)`; single source of truth                                                                                     |
| `src/lib/ageBands.constants.ts`                  | **new** — per-position 4-band cutoffs (table above), tunable                                                                                      |
| `src/lib/ageColor.ts`                            | **retrofit** — consume `ageBand`; position-optional signature                                                                                     |
| `src/lib/valueSpread.ts`                         | **new** — `computeSpreads(players)` → per-player `{ spread, tag, dynRank, projRank }`; position-relative percentile ranks, 2×2 tag, gate, no-read |
| `src/lib/valueSpread.constants.ts`               | **new** — gate threshold (15), backend-only, tunable                                                                                              |
| `src/types/index.ts`                             | `StrategyTag` union + `spread?` shape on the derived player                                                                                       |
| `src/components/AuctionSheet/PlayerTable.tsx`    | Spread column (signed, direction-colored); pass `p.pos` to `ageColor`                                                                             |
| `src/components/AuctionSheet/FilterControls.tsx` | archetype filter chips + Spread sort option                                                                                                       |
| `src/components/AuctionSheet/AuctionSheet.tsx`   | filter/sort state wiring                                                                                                                          |
| `src/components/BidModal/BidModal.tsx`           | Spread + full 2×2 label in Price context panel                                                                                                    |
| `src/components/RosterTracker/DossierFace.tsx`   | no change to call site beyond `ageColor` staying position-optional                                                                                |
| `src/app/page.tsx`                               | call `computeSpreads`, pass results down                                                                                                          |

**Naming:** column/metric = **"Spread"**; feature = **"Value Spreads"**. The four tags
(WIN-NOW / BARGAIN / FUTURE / FADE) stand on their own.

## Graceful degradation

If a draft has no projections applied, `projectionAuctionValue` is null for every player → every
player no-reads → Spread column shows "—", filter chips disable (or `All`-only), zero clutter. The
feature lies dormant until projections exist; no error state, no empty scaffolding.

## Mobile

The Spread column and archetype filter chips are draft-time **data controls**, so per the project's
reflow rule they **reflow, never collapse** behind a menu.

## Calibration constants (backend-only, tunable)

- `valueSpread.constants.ts`: `SPREAD_GATE = 15` (percentile points to fire a tag).
- `ageBands.constants.ts`: per-position `[youngMax, primeMax, agingMax]` cutoffs + global fallback.

Same pattern as `tendencies.constants.ts` / `valueAdjustment.constants.ts` — not imported by client
components.

## Testing

- **`computeSpreads`** unit tests: each 2×2 quadrant fires the correct tag; gate boundary
  (14 → none, 15 → tag); all no-read cases (below replacement / no projection / no dynasty value);
  prime-age → number but no tag; position-relative ranking (a WR and a TE with the same rank gap in
  differently-sized pools normalize correctly); single-element common set → spread 0.
- **`ageBands`** unit tests: per-position boundaries (a 28-yo RB is `old`, a 28-yo QB is `prime`);
  global fallback when no position; null age.
- **Component tests** (select by `data-testid`): Spread column renders signed value + no-read "—";
  archetype chips filter rows; Spread sort; bid modal shows the full label when a tag fires and only
  the number when it doesn't.

## Out of scope / future

- Renaming or reworking the existing dynasty/projection value pipeline — Spread reads existing
  outputs only.
- Any mutation of auction values — explicitly rejected; that was the original Lens failure.
- Per-position gate thresholds (start with one global gate; revisit after a live draft).
- Surfacing Spread on `/nominate`, `/teams`, or `/budget` — v1 is the value sheet + bid modal only.
