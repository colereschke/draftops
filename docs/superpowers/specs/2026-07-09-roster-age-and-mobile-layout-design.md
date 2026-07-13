# Roster age + mobile layout pass

Date: 2026-07-09

## Context

Two unrelated requests bundled into one pass since they're all small, contained UI/data changes:

1. Add average team age to the Team Rosters page.
2. Three separate mobile-layout problems: the nav bar wraps to ~3 rows and eats a third of the screen, the value sheet's filter controls lay out awkwardly on narrow widths, and the Budget Pressure threat table requires horizontal scrolling that hides the team name column while viewing the threat bar.
3. (Added mid-design) The Team Rosters page's desktop grid (`sm:grid-cols-2 xl:grid-cols-3`) is also unwanted — the user prefers the single-column stacked layout it used to have, on every screen size, not just mobile.

Breakpoint convention: `md` (768px) is used as the mobile/desktop split for the nav and threat board, consistent with the app's existing use of `sm`/`xl` for grid density elsewhere.

## 1. Average team age (Team Rosters)

**Data layer** — `src/types/index.ts`, `src/lib/computeTeamStats.ts`

- Add `avgAge: number | null` to `TeamStats`.
- Computed inside `computeTeamStats`: for each team, resolve each roster entry to its `Player` by name (same lookup already used for `delta`), collect the `age` of entries that resolve to a non-null age, and average them. PICK/PKG entries never resolve to a `Player` by name, so they're naturally excluded — no explicit position filtering needed.
- `null` when no entries have a resolvable, non-null age (empty roster, or a roster of only picks/packages).
- Because `TeamStats` is built in one place and consumed everywhere (budget page, teams page, nomination scoring), this is additive and doesn't touch other call sites.

**Display** — `src/components/RosterTracker/DossierCard.tsx`

- New stat line "Avg age: 26.4" (one decimal place) in the collapsed card, alongside the existing buys/spend/top-buy line.
- Color-coded using the existing age scale already defined in `globals.css` and used on the value sheet legend: `--age-young` (≤24), `--age-prime` (25-27, neutral/no color), `--age-aging` (28-30), `--age-old` (31+).
- When `avgAge` is `null`, render "Avg age: —" with no color.

## 2. Mobile nav

**Files** — `src/components/NavBar/NavBar.tsx`, `src/components/NavBar/NavLinks.tsx`

- Below `md`: the top bar collapses to just the "DraftOps" logo and a hamburger icon button (lucide `Menu`), replacing today's always-wrapping flex row.
- Tapping the hamburger opens a `DropdownMenu` (reusing the pattern already used for the user menu) containing, top to bottom:
  1. The 4 nav links (Value Sheet, Team Rosters, Budget Pressure, Nominate) — active link highlighted same as today.
  2. Separator.
  3. Draft picker: current draft name plus the "switch draft" list (folded into the menu rather than shown as a separate pill trigger).
  4. Feedback link.
  5. Sign out.
- At `md` and above, the layout is visually unchanged from today (logo, inline nav links, draft picker pill, Feedback link, user dropdown, all in one row).
- Two render paths gated by a `md:hidden` / `hidden md:flex` split, not a JS media-query check — avoids hydration mismatch.

## 3. Value sheet filters (mobile)

**File** — `src/components/AuctionSheet/FilterControls.tsx`

- No collapsing, no new components — reflow only, via responsive Tailwind classes.
- Below `md`: position filter chips get their own full-width row (still horizontally scrollable if they overflow even at full width); search input goes full-width on its own row below; strategy toggle group + Show notes + Available only + result count wrap onto their own row(s) beneath that; the legend row reflows with the same wrapping behavior it has today, just within the narrower column.
- At `md` and above: unchanged from today's single wrapped row.

## 4. Budget Pressure threat board (mobile)

**File** — `src/components/BudgetPressure/ThreatBoard.tsx`

- Below `md`: render a stacked card list instead of the `<Table>` — one card per team showing rank, team name (with the existing owner-highlight treatment), max bid, appetite, and the threat bar, all within the card's own width. No horizontal scroll.
- At `md` and above: the current `<Table>` is unchanged.
- Both views consume the same `ranked` array from the existing `useMemo` — only the JSX render branch differs, so sorting/threat-score logic isn't duplicated.

## 5. Team Rosters layout (all screen sizes)

**File** — `src/components/RosterTracker/RosterTracker.tsx`

- Replace the current `grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3` card grid with a single-column stack at every screen width — one `DossierCard` per row, no side-by-side cards regardless of viewport.
- The column is capped at a readable max-width (e.g. `max-w-2xl`) and centered, so cards don't stretch edge-to-edge into unreadably wide rows on large desktop monitors.
- This reverts the page to the single-column presentation it had before the grid layout was introduced, per user preference.

## Testing

- `computeTeamStats`: unit test `avgAge` for a team with all-known ages, a team with some null ages, a team with only PICK/PKG entries (→ `null`), and an empty roster (→ `null`).
- `DossierCard`: renders "Avg age: X.X" with correct color banding at each threshold, and "Avg age: —" when null.
- `NavLinks`/`NavBar`: hamburger menu opens/closes, contains all expected items, active link highlighted; desktop layout unaffected at `md`+.
- `FilterControls`: existing tests continue to pass; no new interactive behavior to test (layout-only change), but verify no controls are visually clipped or removed at narrow widths if a viewport-based test is feasible.
- `ThreatBoard`: card list renders correct data/order below `md`; table renders unchanged at `md`+; both share sort order.
- `RosterTracker`: single-column layout at all tested breakpoints.
