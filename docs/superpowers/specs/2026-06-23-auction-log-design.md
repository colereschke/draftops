# Live Auction Log — Design Spec

**Date:** 2026-06-23  
**Feature:** Live auction log with bid logging, editing, and deletion  
**Branch:** `feature/auction-log`

---

## Overview

Add the ability to log completed auction bids during a live draft. Each logged bid is persisted to the SQLite DB via Prisma, updates the team's budget in real time, and marks the player as claimed in the value sheet.

---

## Architecture & Data Flow

`page.tsx` is a server component that fetches all claimed bids from the DB on each page load and passes them as props to `AuctionSheet`. Only the fields the client actually needs are serialized across the RSC boundary: `{ id, player, price, teamHandle, position }`.

```
page.tsx (server)
  └── fetchClaimedBids() → SELECT id, player, price, teamHandle, position FROM AuctionResult JOIN Team
  └── <AuctionSheet claimedBids={...} />

AuctionSheet (client)
  └── useMemo: build Map<playerName, ClaimedBid> from claimedBids (O(1) lookups)
  └── useMemo: merge players array with claim data
  └── useOptimistic: instant UI update on bid submit
  └── <BidModal /> (conditionally rendered)

actions.ts ('use server')
  └── logBid()    → INSERT AuctionResult + revalidatePath('/')
  └── updateBid() → UPDATE AuctionResult + revalidatePath('/')
  └── deleteBid() → DELETE AuctionResult + revalidatePath('/')
```

No Suspense boundary around the sheet — claimed bid state determines row layout (grayed rows, claimed column), so streaming would cause layout shift during a live auction. Awaiting in `page.tsx` is correct here.

---

## Value Sheet Changes

The `players` array and `claimedBids` prop are merged in a single `useMemo`. A `Map<string, ClaimedBid>` keyed by player name provides O(1) lookups (avoids O(n²) `.find()` calls over 270 players).

**Claimed player rows:**

- All cell text rendered in muted color (`#4a5168`) to visually gray out the row
- Row remains clickable to open edit modal

**New "Claimed" column (rightmost):**

- Only rendered once at least one bid has been logged (avoids empty column before draft starts)
- Content: `teamHandle · $price · ±$evDiff`
  - `evDiff = price - player.budget`
    - Positive (overpaid): shown red `#e05050` with ▲ prefix — e.g. `▲$7`
    - Negative (value): shown green `#4caf6e` with ▼ prefix — e.g. `▼$7`
    - Display the absolute value with the arrow; don't show a raw negative number
  - Example: `coreschke · $85 ▼$7` (paid $7 under target, green)

**Row click behavior:**

- Unclaimed row → opens `BidModal` in **add mode**, pre-filled with player data
- Claimed row → opens `BidModal` in **edit mode**, pre-filled with existing bid data

---

## BidModal Component

`src/components/BidModal/BidModal.tsx` — `'use client'`

Single component handles add and edit modes via an `existingBid` prop.

**Fields:**
| Field | Type | Behavior |
|-------|------|----------|
| Player | Text | Read-only, pre-filled from clicked row |
| Position | Badge | Read-only, pre-filled from clicked row |
| NFL Team | Text | Read-only, pre-filled from clicked row |
| Price | Number input | Auto-focused on open for fast entry |
| Won By | Dropdown | All 12 league teams from `LEAGUE_TEAMS` |

**Modes:**

- **Add**: Submit → `logBid()` server action → close modal
- **Edit**: Submit → `updateBid()` server action → close modal. Secondary "Remove" button → `deleteBid()` server action → close modal.

**UX:**

- Closes on backdrop click or Escape key
- Price input auto-focused on open
- Optimistic update applied immediately on submit; rolled back if server action throws
- Inline error message in modal if action fails (no toast library needed)

---

## Server Actions

`src/lib/actions.ts` — all `'use server'`

```ts
logBid({ player, position, nflTeam, price, sfRank, teamId }): Promise<void>
updateBid({ id, price, teamId }): Promise<void>
deleteBid({ id }): Promise<void>
```

- All three call `revalidatePath('/')` after the DB write to bust the Next.js cache
- `sfRank` is captured from the player data at log time and stored on `AuctionResult` (already in schema as optional) for future use by the nomination helper
- No auth guard needed (local single-user tool)
- Errors propagate naturally; `useOptimistic` rolls back on failure

---

## Files Touched

| File                                           | Change                                                                                              |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `src/app/page.tsx`                             | Convert to async server component; fetch claimed bids; pass to AuctionSheet                         |
| `src/components/AuctionSheet/AuctionSheet.tsx` | Accept `claimedBids` prop; merge with players via Map; add Claimed column; wire row clicks to modal |
| `src/components/BidModal/BidModal.tsx`         | New component                                                                                       |
| `src/components/BidModal/index.ts`             | New barrel export                                                                                   |
| `src/lib/actions.ts`                           | New: `logBid`, `updateBid`, `deleteBid` server actions                                              |
| `src/types/index.ts`                           | Add `ClaimedBid` type (serialized subset of `AuctionResultEntry`)                                   |

---

## Out of Scope

- Authentication / multi-user access control
- Audit log / bid history (beyond what Prisma stores via `createdAt`)
- Real-time sync across browser tabs (revalidation on submit is sufficient for single-user use)
- Mobile layout optimization
