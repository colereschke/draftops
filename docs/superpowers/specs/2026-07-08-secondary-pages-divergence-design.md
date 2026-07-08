# Secondary Pages Divergence Design

## Purpose

Budget Pressure (`/budget`) and Team Rosters (`/teams`) currently lead with the
same four team-level money columns — Spent, Remaining, Roster, Buying Power — and
both sort by buying power using the same color scale. Their only real difference
surfaces after you click into a team. This spec diverges the two pages so each
answers a question the other does not, and wires them together through a shared
behavioral engine.

This is a **functional** divergence, not a visual one. It supersedes the
conceptual framing in the "Budget Pressure" and "Team Rosters" sections of
`2026-07-07-secondary-pages-redesign-design.md` (which was a graphite-token visual
pass and still assumed a "roster needs / who can hurt you" framing). The visual
system and token rules from that doc still apply; the page _content and job_
described here take precedence.

## Design Philosophy

**Draft for value, not for need.** In a startup auction you chase value wherever
it falls; you trade for need later. So neither page may imply an "ideal" roster a
team should be filling toward. Count-vs-target "needs" framing is explicitly
rejected — for both the roster page and for predicting rival bidding.

The divergence:

- **Team Rosters → Manager Dossier.** Reads _revealed behavior_: where each
  manager leans, whether they overpay or hunt bargains, per position. Answers
  "how does this manager buy, and can I predict them."
- **Budget Pressure → Live Threat board.** Reads _live money_: for the position
  currently on the block, who can actually strike — max-bid capacity weighted by
  demonstrated appetite for that position. Answers "who's a threat right now."

One page reads behavior; the other reads live money; the behavior data powers the
money page's predictions. Same domain, no shared costume.

## The Keystone: Shared Tendency Engine

A new pure function is the single source of truth both pages consume. All inputs
are already fetched by the existing server components.

**File:** `src/lib/tendencies.ts`
**Constants:** `src/lib/tendencies.constants.ts` (backend-only, TUNABLE — mirrors
the `valueAdjustment.constants.ts` pattern).

### Inputs

- Auction results per team: `{ player, position, price }[]` (from `AuctionResult`)
- Player values: `Player[]` (for the value baseline — `player.budget`)
- Teams: id / handle / displayName / budget / rosterSize context

The value baseline for a won player is that player's `budget` (target value), so
`delta = price - player.budget`, matching `computeTeamStats`. Players with no
value match (e.g. off-list) contribute to spend but not to delta/appetite (their
delta is null and excluded from averages), so a missing baseline never fabricates
an over/under signal.

### Positions considered

Behavioral signals are computed for `QB`, `RB`, `WR`, `TE` only. `PICK`/`PKG`
assets are counted toward spend/activity but excluded from per-position appetite
(no meaningful value baseline for appetite purposes).

### Per-manager output shape

```ts
interface PositionTendency {
  position: 'QB' | 'RB' | 'WR' | 'TE';
  buys: number;
  spend: number;
  valueSum: number; // sum of matched players' budget; null-baseline buys excluded
  deltaSum: number; // spend on matched buys - valueSum
  avgDelta: number | null; // deltaSum / matchedBuys; null when matchedBuys === 0
  overPct: number | null; // deltaSum / valueSum; null when valueSum === 0
  spendShare: number; // spend / manager totalSpend (0 when totalSpend 0)
  appetite: 'overpays' | 'neutral' | 'thrifty' | 'no-read';
}

interface ManagerTendency {
  teamId: number;
  handle: string;
  displayName: string | null;
  buys: number; // total, all positions incl. PICK/PKG
  totalSpend: number;
  totalValue: number; // sum of matched budgets across positions
  overallOverPct: number | null;
  topBuy: number; // max single price, 0 if none
  lean: 'QB' | 'RB' | 'WR' | 'TE' | 'balanced';
  aggression: 'aggressive' | 'neutral' | 'disciplined';
  positions: Record<'QB' | 'RB' | 'WR' | 'TE', PositionTendency>;
}
```

### Derived-label rules (all thresholds are tunable constants)

- **`appetite`** per position: `no-read` when `buys < MIN_BUYS_FOR_READ`.
  Otherwise from `overPct`: `> OVERPAY_PCT` → `overpays`; `< THRIFTY_PCT`
  (negative) → `thrifty`; else `neutral`. The `no-read` gate is the sample-size
  honesty — it lives here, once, so every consumer inherits it.
- **`lean`**: the position with the highest `spendShare` **if** that share
  exceeds `LEAN_SHARE_THRESHOLD`; otherwise `balanced`. Requires
  `totalSpend >= MIN_SPEND_FOR_LEAN` or it is `balanced` (avoids "WR-heavy" off a
  single buy).
- **`aggression`**: from `overallOverPct` — `> AGG_PCT` → `aggressive`;
  `< -AGG_PCT` → `disciplined`; else `neutral`. Requires
  `buys >= MIN_BUYS_FOR_AGGRESSION` or it is `neutral`.

### Cold start

With zero results, every manager is `balanced` / `neutral`, every position is
`no-read`. This is the honest early-draft state and both pages must render it
gracefully.

## Team Rosters → Manager Dossier Board

### Job

Scout rival buying behavior so you can predict and price against it.

### Layout

Replace the money-column table with a **responsive grid of dossier cards**, one
per team. The owner's card is visually distinguished (left rail /
`var(--primary)`) and pinned first; remaining cards follow, default-sorted by
`totalSpend` desc (most active rivals first).

Each card:

```
┌ rival_a ───────────────────┐
│ WR-heavy · overpays QB       │  lean + strongest habit (only when not no-read)
│ Aggressive   +7% vs value    │  aggression + overallOverPct
│ 6 buys · $610 · top $95      │  activity line
│ QB🔴  RB🟢  WR⚪  TE·         │  per-pos appetite chips
│ [▸ roster]                   │  expand toggle
└──────────────────────────────┘
```

- **Headline line**: `{lean-label} · {strongest-habit}`. Strongest habit = the
  position whose appetite is `overpays`/`thrifty` with the largest magnitude
  `overPct`; omitted entirely if all positions are `no-read`/`neutral`.
- **Appetite chips**: one per QB/RB/WR/TE. `overpays` → red
  (`var(--age-old)`), `thrifty` → green (`var(--age-young)`), `neutral` →
  neutral, `no-read` → a muted dot (`·`) so an empty read is visibly distinct
  from a neutral one. Chip carries `buys` in a title/tooltip.
- **No Spent / Remaining / Buying Power on the card face** — that vocabulary is
  now exclusively Budget Pressure's. Value-efficiency dollars (delta, over%) are
  fine here; they answer "did they buy well," not "can they still buy."

### Expanded drawer

Reuses `TeamRosterDetail`, upgraded to **group won players by position** with a
per-position subtotal row (spend and delta). PICK/PKG group uses the neutral
`POS_COLORS.PKG` treatment. Preserves the existing per-player position rail, price
and delta conventions.

### Controls

A small sort/filter control: sort cards by activity (`totalSpend`), aggression,
or lean. Kept minimal — this is a scan surface, not a data table.

### Component notes

- `RosterTracker.tsx` becomes the card-grid shell (replaces the metric-strip +
  table composition). Split into `DossierCard.tsx` (single card + appetite chips
  - activity) and keep `TeamRosterDetail.tsx` for the drawer.
- `RosterTable.tsx` (the money-column table) is removed; its expandable-drawer
  behavior migrates into the card.
- `TeamWithRoster` is extended (or paired) with the manager's `ManagerTendency`
  so the card renders from one object.

## Budget Pressure → Live Threat Board

### Job

For the position on the block right now, show who can actually strike.

### Position anchor (both / stacked)

- A position selector `[QB][RB][WR][TE]` is always visible.
- If any `NominatedPlayer` exists, the selector **auto-selects** that player's
  position and shows a chip (`Puka Nacua up`). If multiple are nominated, the
  most recently nominated drives the default; the chip notes additional live
  nominations.
- The user can manually override the selection to scout a position no one has
  nominated yet. Manual override sticks until changed (does not get stomped by
  the live nomination on the periodic refresh — see below).

### Threat model

For the selected position, per team:

- **`maxBid = max(0, buyingPower + 1)`**, and `0` when `rosterRemaining === 0`
  (no slot to fill → cannot bid). This is the most a team could spend on one
  player while still filling remaining slots at $1 each.
- **`appetiteMultiplier`** for the selected position, from the tendency engine:
  `overpays` → `> 1` (`APPETITE_OVERPAY_MULT`), `thrifty` → `< 1`
  (`APPETITE_THRIFTY_MULT`), `neutral` and `no-read` → `1.0`.
- **`threat = maxBid * appetiteMultiplier`**.

Because `no-read` and `neutral` both map to `1.0`, **early draft ranks purely by
max-bid** — honest before any behavioral data exists. As data accrues, a
moderate-money WR-addict correctly rises above a flush-but-WR-thrifty team.

### Layout

- Ranked table: `rank · team · max bid · appetite badge (this position) · threat
bar`. Owner row gets the left-rail treatment. Bar width scales to the max
  `threat` in the room.
- The appetite badge is the same vocabulary as the dossier chips, so the two
  pages read consistently.
- **Secondary market metrics kept**: `Room Liquidity` (sum of buying power) and
  `Low Power` (count under threshold) — market-level, no dossier overlap.
- **Dropped**: `Most Dangerous` and `Your Rank` — the ranked board itself now
  conveys both.

### Refresh

Keep the existing 20s auto-refresh (`BudgetRefresher`) for money data. The live
nomination position is refreshed with it, but a **manual position override is
preserved across refreshes** (refresh updates data, not the user's chosen
position). Implementation: track "is the selection user-overridden" in client
state; only apply the auto nomination position when not overridden.

### Component notes

- `BudgetPressureView.tsx` gains a client position-selector + threat ranking.
  Split into `ThreatBoard.tsx` (selector + ranked table) and keep the header /
  secondary metrics in the view shell.
- `buyingPowerColor` / max-bid helpers stay; add an appetite→multiplier map from
  the tendency constants.
- New data need: the page must fetch `NominatedPlayer` (position) in addition to
  results/players/teams. The `nomination-data` route already returns nominated
  players — reuse that source or fetch directly in the server component.

## Data Flow

Both pages remain server components:

1. Fetch `AuctionResult` + `Player` + teams (+ `NominatedPlayer` for Budget
   Pressure).
2. Call `computeTendencies(...)` → `ManagerTendency[]`.
3. `/teams`: pass `TeamWithRoster[]` + tendencies to the dossier grid client
   component.
4. `/budget`: pass `TeamStats[]` + tendencies + live nomination position to the
   threat board client component.

The tendency engine is computed once per page load (and per 20s refresh on
Budget Pressure) from already-fetched data — no new queries beyond
`NominatedPlayer`.

## Testing

**Unit (`src/lib/tendencies.test.ts`)** — the engine is pure and carries the
subtle logic, so it gets the coverage:

- delta math per position (matched vs null-baseline buys)
- `appetite` thresholds including the `no-read` sample gate
- `lean` threshold + `MIN_SPEND_FOR_LEAN` guard
- `aggression` thresholds + min-buys guard
- cold start (zero results → all balanced/neutral/no-read)
- PICK/PKG excluded from appetite but counted in activity

**Threat helper** — `maxBid` (incl. 0-slot and negative buying power clamps) and
`threat = maxBid * multiplier`, with `no-read`/`neutral` → ×1.0 ordering by
max-bid.

**Component** — dossier card renders lean/aggression/chips and hides the habit
line when all `no-read`; threat board auto-selects the live nomination position
and honors manual override across a simulated refresh. Select by `data-testid`;
add ids where missing. Typed fixtures from `src/types`.

## Acceptance Criteria

- Neither page shows count-vs-target "needs"; no "ideal roster" framing anywhere.
- Team Rosters face shows no Spent/Remaining/Buying Power; it shows behavioral
  reads (lean, aggression, per-position appetite) + activity.
- Budget Pressure threat board is position-anchored, auto-selects a live
  nomination, honors manual override, and ranks by `maxBid × appetite` with
  correct ×1.0 cold-start behavior.
- The tendency engine is the single source of the behavioral labels consumed by
  both pages; `no-read` sample-size gating lives only in the engine.
- Appetite vocabulary/colors are consistent across both pages.
- `pnpm tsc --noEmit`, `pnpm lint`, and `pnpm test` pass.
