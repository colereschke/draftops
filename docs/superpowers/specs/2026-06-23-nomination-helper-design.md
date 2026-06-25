# Nomination Helper — Design Spec

**Date:** 2026-06-23  
**Feature:** Nomination Helper  
**Status:** Approved for implementation

---

## Overview

A live-data nomination helper that answers the question: _which player should I nominate next to burn rival budgets?_ It combines three signals — position scarcity, rival buying power, and player ceiling — into a ranked list of nomination targets. Cole can mark players he still wants (watchlist), which are excluded from suggestions.

---

## Data Model

New Prisma model added to `schema.prisma`:

```prisma
model PlayerWatchlist {
  id         Int      @id @default(autoincrement())
  playerName String   @unique  // matches Player.player from src/data/players.ts
  createdAt  DateTime @default(now())
}
```

Migration: `pnpm prisma migrate dev --name add-player-watchlist`

No team FK needed — this is Cole's personal list (single user, single league).

---

## Scoring Algorithm

### Constants

`TARGET_ROSTER` lives in `src/lib/teams.ts` alongside `ROSTER_SIZE`:

```ts
export const TARGET_ROSTER: Partial<Record<Position, number>> = {
  QB: 4,
  RB: 9,
  WR: 11,
  TE: 3,
};
```

These are tunable without touching scoring logic. PICK/PKG positions are excluded from position-need scoring.

### Formula

For each available player `P` (not in any `AuctionResult`, not on watchlist):

```
needRatio(team, pos) = max(0, TARGET[pos] - team.countAt[pos]) / TARGET[pos]

rivalDemand(P) = Σ buyingPower(team) × needRatio(team, P.pos)
                  for each non-Cole team

nominationScore(P) = rivalDemand(P) × P.ceiling
```

- `needRatio` is 0–1: 1.0 = team has none at that position, 0 = at or over target
- `buyingPower` = `remaining - (ROSTER_SIZE - rosterCount)` — classic auction math, already in `TeamStats`
- `ceiling` from `src/data/players.ts` — max price the market might pay
- Teams with `buyingPower ≤ 0` contribute 0 demand

The score captures: _expensive players that many cash-rich teams still need score highest._

### Per-player rival breakdown

Alongside `nominationScore`, compute each rival team's individual contribution:

```
rivalContribution(team, P) = buyingPower(team) × needRatio(team, P.pos)
```

Expressed as a percentage of `rivalDemand(P)` for display. Surfaced inline on each row as a mini bar showing which teams drive the demand.

---

## Architecture

### Scoring utility

`src/lib/nominationScoring.ts` — pure function, no side effects, unit-testable:

```ts
export function computeNominationScores(
  players: Player[],
  teamStats: TeamStats[],
  auctionResults: AuctionResultEntry[],
  watchlist: string[], // player names
  myHandle: string, // 'coreschke' — excluded from rival demand
): ScoredPlayer[];
```

Returns players sorted descending by `nominationScore`, already filtered (won + watchlisted removed).

### API route

`src/app/api/nomination-data/route.ts` — single GET endpoint returning:

```ts
{
  teamStats: TeamStats[],
  auctionResults: AuctionResultEntry[],
  watchlist: string[],   // player names from PlayerWatchlist
}
```

Watchlist CRUD via separate endpoints:

- `POST /api/watchlist` — add player by name
- `DELETE /api/watchlist` — remove player by name

### Component

`src/components/NominationHelper/NominationHelper.tsx` (`'use client'`)

Fetches from `/api/nomination-data` on mount and polls every 30 seconds (appropriate for a slow auction where bids land infrequently). Renders two zones:

---

## UI Layout

### Zone 1 — Watchlist sidebar (left, ~240px)

- Search-to-add input at top: type a player name, select from filtered dropdown, adds to DB watchlist
- List of watched players: name, position badge, target value (`$budget`), remove button
- Empty state: "No players marked — add players you still want to win"

### Zone 2 — Nomination targets (main/center)

Ranked list of available players by `nominationScore` descending. Each row:

| Column           | Content                                                                                                                                                               |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rank             | #1, #2…                                                                                                                                                               |
| Player           | Name + position badge + rookie tag if applicable                                                                                                                      |
| Target / Ceiling | `$budget` / `$ceiling`                                                                                                                                                |
| Score            | `nominationScore` (displayed as a styled number)                                                                                                                      |
| Rival demand bar | Mini horizontal bar segmented by team handle labels, showing each rival's % contribution to the score (no per-team colors defined in design system — use handle text) |
| Action           | "Watch" button — adds to watchlist, removes from list immediately                                                                                                     |

Position filter buttons (same as value sheet) let Cole narrow to a specific position. Default: ALL.

---

## Integration

The `NominationHelper` component plugs into whatever tab navigation the other feature branches establish. It has no opinion on the nav structure — it exports a single default component, and `page.tsx` (or the emerging layout) switches to it like any other tab.

If `teamStats` is empty (auction log not yet populated), the component shows a friendly message: "No auction data yet — start logging bids to see nomination suggestions."

---

## What This Feature Does NOT Do

- No duplicate of the budget pressure view — rival financial health lives there
- No "auto-nominate" or external Sleeper API integration
- No opinion on Cole's bidding strategy on the nominated player (value sheet covers that)
- No support for multi-user watchlists (single owner assumption)
