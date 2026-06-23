# Team Roster Tracker — Design Spec

**Date:** 2026-06-23
**Feature:** `/teams` page — display all 12 teams' rosters, budgets, and pick package holdings during a live slow auction.

---

## Overview

A read-only page at `/teams` that shows all 12 league managers in a sortable budget leaderboard. Each row is expandable (accordion, multi-expand) to reveal that team's full roster. Designed for fast scanning during a live bid: glance at the leaderboard for financial picture, expand a team to check their positional needs.

Navigation between `/` (Value Sheet) and `/teams` is handled by a separate session — this feature does not touch `app/layout.tsx` or any nav component.

---

## Architecture

### Data flow

- `app/teams/page.tsx` — async Server Component. Calls `db.team.findMany({ include: { results: true } })`, computes `TeamStats` fields (`spent`, `remaining`, `rosterCount`, `buyingPower`, `pkgCount`) server-side, and passes the result to the client component as props.
- `src/components/RosterTracker/RosterTracker.tsx` — `'use client'`. Receives computed stats and results. Owns all accordion expand/collapse state. No data fetching.

No API route needed. App Router Server Component pattern: DB query happens at render time on the server.

### Computed fields (server-side)

```
spent        = SUM(results.price) for a team
remaining    = budget - spent
rosterCount  = COUNT(results) for a team
rosterRemaining = ROSTER_SIZE - rosterCount   (ROSTER_SIZE = 30)
buyingPower  = remaining - rosterRemaining    (classic auction math)
pkgCount     = COUNT(results WHERE position = 'PKG')
```

---

## Files

| Path                                             | Role                                                 |
| ------------------------------------------------ | ---------------------------------------------------- |
| `app/teams/page.tsx`                             | Async Server Component — DB query + stat computation |
| `src/components/RosterTracker/RosterTracker.tsx` | `'use client'` — accordion table UI                  |
| `src/components/RosterTracker/index.ts`          | Re-export                                            |

---

## UI: Budget Leaderboard Table

Full-width table. Default sort: buying power descending. All numeric columns are sortable by clicking the header.

### Columns

| Column       | Content                           | Notes                                                                                                       |
| ------------ | --------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Team         | Sleeper handle                    | `coreschke` row gets a subtle left accent highlight (e.g. `--pos-qb` blue tint on the row background)       |
| Roster       | `X / 30`                          | Mono font                                                                                                   |
| PKG          | Count of kicker/pick-package wins | Gold (`--pos-pkg: #f0c040`) badge showing `2×`; dim/empty when 0                                            |
| Spent        | `$XXX`                            | Mono font                                                                                                   |
| Remaining    | `$XXX`                            | Mono font                                                                                                   |
| Buying Power | `$XXX`                            | Mono font; colors red (`--age-old: #e05050`) when below $50, amber (`--age-aging: #e8a030`) when below $150 |
| (expand)     | Chevron icon                      | Right-aligned; rotates 90° when expanded                                                                    |

Clicking anywhere on a row toggles that team's accordion. Multiple rows can be open simultaneously.

---

## UI: Expanded Roster Panel

Drops inline below the row, pushing subsequent rows down. Styled as a dark inset panel (`--bg-base` background, subtle border).

Each player entry is a compact row with:

- **3px left border** in position accent color (matching value sheet signature element)
- **Position badge** (same badge style as value sheet)
- **Player name**
- **Price paid** — mono font, position accent color
- **Delta vs. target value** — `+$12` in green (`--age-young`) / `-$8` in red (`--age-old`) / `$0` in muted. Computed by looking up the player name in the `players` data array.
- **NFL team** — muted, small

PKG rows get the gold `--pos-pkg` accent automatically via the position color system. No special casing needed beyond what the position color map already provides.

**Empty state:** When a team has 0 results, the expanded panel shows a single muted line: "No players won yet."

---

## Design System Compliance

Follows existing conventions from `globals.css` and `AuctionSheet.tsx`:

- `--bg-base: #0a0d14` page background
- `--bg-surface: #141824` header / card surfaces
- `var(--font-barlow)` for labels and headers
- `var(--font-mono)` for all numbers and dollar values
- Position accent colors via `POS_COLORS` map (same as value sheet)
- 3px left border on player rows in position accent color
- Age color scale for buying power warning thresholds

---

## Empty DB State

All 12 teams are seeded at startup. The table always renders with all 12 rows. Teams with no bids show:

- Roster: `0 / 30`
- PKG: empty
- Spent: `$0`
- Remaining: `$1,000`
- Buying Power: `$971` (1000 − 29 remaining spots)

The page is immediately useful and reviewable with an empty database.

---

## Out of Scope

- Logging auction results (handled by separate "live auction log" feature)
- Navigation / tab bar (handled by separate session)
- Real-time updates / polling
- Sorting within the expanded roster panel
