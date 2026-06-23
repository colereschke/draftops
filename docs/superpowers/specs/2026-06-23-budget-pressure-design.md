# Budget Pressure View — Design Spec

## Context

DraftOps auction tool for a 12-team Superflex Sleeper league. The budget pressure view shows all teams' remaining buying power in real time during live auction burst phases (up to 17 simultaneous nominations at draft start). Cole (`coreschke`) is the owner.

## Problem

During burst auction phases, multiple bids close in rapid succession. Cole needs to quickly see which teams are cash-rich (dangerous bidders) vs. cash-squeezed (can't compete) without manually tracking 11 opponents.

Buying power formula (from CLAUDE.md):

```
buyingPower = remaining - (ROSTER_SIZE - rosterCount)
```

Where `ROSTER_SIZE = 30`. A negative buying power means the team is mathematically forced to spend exactly $1 on each remaining roster spot.

## Decisions

- **Separate page** at `/budget` — keeps the value sheet clean, composable with future pages
- **DB-backed from day one** — reads from `AuctionResult` via Prisma; shows zeros until bids are logged (by the auction log feature built in parallel)
- **RSC + `router.refresh()`** — async Server Component fetches Prisma directly (no API route), a thin client component auto-refreshes every 20s to stay current during burst phases
- **Shared nav strip** in `layout.tsx` — minimal pill-style tool switcher, extensible for all future pages

## File Structure

```
src/app/budget/page.tsx              ← async RSC: Prisma query → TeamStats[] → renders view
src/components/BudgetPressure/
  BudgetPressureView.tsx             ← server component, receives TeamStats[], renders table
  BudgetRefresher.tsx                ← 'use client', router.refresh() on 20s interval + manual button
  index.ts
src/components/NavBar/
  NavBar.tsx                         ← server component shell
  NavLinks.tsx                       ← 'use client', usePathname for active link highlighting
  index.ts
```

## Data Layer

`page.tsx` queries:

```ts
db.team.findMany({ include: { results: true } });
```

Maps each team to `TeamStats` (type already defined in `src/types/index.ts`):

```ts
const spent = team.results.reduce((s, r) => s + r.price, 0);
const remaining = team.budget - spent;
const rosterCount = team.results.length;
const rosterRemaining = ROSTER_SIZE - rosterCount;
const buyingPower = remaining - rosterRemaining;
```

Sorted by `buyingPower` descending before passing to the view.

## UI

### Nav Strip (`layout.tsx`)

- Thin strip above all page content
- Left: "DraftOps" wordmark in Barlow Condensed
- Right: pill-style links — "Value Sheet" (`/`), "Budget Pressure" (`/budget`), future pages appended
- Active route: amber accent `#e8a030`; inactive: muted `#4a5168`
- Active state via `usePathname` in `NavLinks.tsx` (client component)

### Budget Pressure Page

**Header:**

- Dark surface matching value sheet (`--bg-surface`)
- Page title + league subtitle in Barlow Condensed
- Auto-refresh indicator: "Updated Xs ago" counting up, resets every 20s
- Manual "Refresh" button triggers `router.refresh()` immediately

**Table — 12 rows, sorted by buying power descending:**

| Column       | Notes                               |
| ------------ | ----------------------------------- |
| #            | Rank (1 = most buying power)        |
| Team         | `displayName` if set, else `handle` |
| Spent        | $ in mono font                      |
| Remaining    | $ in mono font                      |
| Roster       | `x / 30`                            |
| Buying Power | Large mono number + horizontal bar  |

**Buying power bar:** horizontal bar whose width is proportional to buying power relative to the highest value in the current dataset. Visually immediate — widest bar = most dangerous bidder in the room.

**Buying power color thresholds:**

- `> $150` → `#4caf6e` (green, comfortable)
- `$50–$150` → `#e8a030` (amber, tightening)
- `< $50` → `#e05050` (red, squeezed / negative)

**Cole's row (`coreschke`):**

- Left border in `#4f83e8` (QB blue) instead of default
- Slightly lighter row background for instant identification

## What This Does NOT Include

- No API route — Prisma called directly in RSC
- No roster breakdown per team (that's the roster tracker feature, built separately)
- No nomination helper logic (separate feature)
- No write operations — read-only view
