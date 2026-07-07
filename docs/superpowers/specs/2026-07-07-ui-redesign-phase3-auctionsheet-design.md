# UI Redesign — Phase 3: AuctionSheet (roadmap #6)

## Context

Phases 1 (NavBar, PR #26) and 2 (BidModal, PR #26) established the token system, shadcn/ui + Base UI setup, and the border-not-shadow / one-accent-color rules. Phase 3 applies that foundation to `AuctionSheet` — the main value-sheet page (`/`), the highest-traffic surface in the app.

Phasing recap:

1. Foundation (done)
2. BidModal → shadcn Dialog (done)
3. **AuctionSheet (this spec)**
4. `NominationHelper`, `RosterTracker`, `BudgetPressure`

`AuctionSheet.tsx` is currently 898 lines, 100% inline hex-coded `style={{}}`, one function handling budget-tracker header, filter controls, legend, and a hand-rolled sortable table. This is a much larger surface than BidModal — this spec both re-skins it with shadcn primitives/tokens and splits it into focused subcomponents per CLAUDE.md's ~300-line guidance.

This phase also adds one new feature: an "Available Only" filter to hide already-claimed players, requested alongside the redesign since the component is already being rewritten.

## Goals

- Split `AuctionSheet.tsx` into an orchestrator (state, optimistic updates, server-action handlers) plus three subcomponents: `AuctionHeader`, `FilterControls`, `PlayerTable`
- Replace native `<table>` with shadcn `Table` family, native filter `<button>` pills with shadcn `ToggleGroup`, the Show Notes `<button>` with shadcn `Toggle`, the search `<input>` with shadcn `Input`
- Replace hand-rolled unicode sort arrows (↑↓↕) with `lucide-react` icons (`ArrowUp`/`ArrowDown`/`ArrowUpDown`)
- Extend `globals.css`'s `@theme inline` with two new Tailwind utility tokens (`text-secondary`, `border-subtle`) to avoid pervasive inline-style exceptions in a component this size
- Apply `font-variant-numeric: tabular-nums` to all numeric table columns (deferred from Phase 1 for lack of numeric content at the time)
- Add a new "Available Only" filter toggle that hides players with a claimed bid, and suppress the `Claimed` table column while it's active
- Preserve all existing behavior: filtering, search, sorting, notes toggle, bid logging/editing/deleting via `BidModal`, nomination, optimistic updates, claimed-bid diff display

## Non-goals

- `NominationHelper`, `RosterTracker`, `BudgetPressure` — Phase 4
- `BidModal` itself — already done in Phase 2, `AuctionSheet` only consumes it (unchanged props contract)
- Any new shadcn primitives beyond `Table`, `Toggle`, `ToggleGroup`, `Input` (already have `Button`, `Dialog`, `Select`, `Label` from Phases 1–2)
- Virtualization or pagination of the player list — out of scope, current player counts (~270) don't need it
- A generic "success/danger" token pair for the Budget/Spent/Remaining tracker — see Design decisions

## Design decisions

**Component split:**

```
AuctionSheet.tsx     — state (posFilter, search, sortBy/sortDir, showNotes, availableOnly,
                        modalPlayer, modalError, extraNominated), useOptimistic bids,
                        useTransition handlers (submit/delete/nominate), composes children
├─ AuctionHeader.tsx   — eyebrow/title, Budget/Spent/Remaining tracker, market-weight-by-position bar
├─ FilterControls.tsx  — position ToggleGroup, search Input, Show Notes Toggle,
│                        Available Only Toggle, legend, result count
└─ PlayerTable.tsx     — shadcn Table, sortable headers, row rendering (badges, claimed-diff column)
```

Props for each (exact signatures, binding — engineer implementing the plan uses these verbatim):

```typescript
// AuctionHeader.tsx
interface AuctionHeaderProps {
  ownerBudget: number;
  mySpent: number;
  remaining: number;
  posStats: Record<'QB' | 'RB' | 'WR' | 'TE', { count: number; total: number }>;
  grandTotal: number;
  totalPlayerCount: number; // players.length excluding PICK/PKG, for the subtitle line
}

// FilterControls.tsx
interface FilterControlsProps {
  posFilter: 'ALL' | Position;
  onPosFilterChange: (pos: 'ALL' | Position) => void;
  search: string;
  onSearchChange: (value: string) => void;
  showNotes: boolean;
  onShowNotesChange: (value: boolean) => void;
  availableOnly: boolean;
  onAvailableOnlyChange: (value: boolean) => void;
  resultCount: number;
}

// PlayerTable.tsx
interface PlayerTableProps {
  players: Player[]; // already filtered + sorted
  showNotes: boolean;
  hasClaims: boolean; // gates the Claimed column; caller computes as optimisticBids.length > 0 && !availableOnly
  claimMap: Map<string, ClaimedBid>;
  nominatedSet: Set<string>;
  sortBy: SortKey;
  sortDir: 'asc' | 'desc';
  onSort: (col: SortKey) => void;
  onRowClick: (player: Player) => void;
}
```

`posStats`/`grandTotal`/market-weight bar reflect the **full unfiltered player pool** (as today) — market composition is a standing reference stat, not a view of the current filter.

**Available Only filter:** `AuctionSheet`'s `filtered` memo gains a third predicate alongside position and search: when `availableOnly` is true, exclude any player present in `claimMap`. `hasClaims` passed to `PlayerTable` becomes `optimisticBids.length > 0 && !availableOnly`, so the `Claimed` column disappears while the filter is active (every visible row would be unclaimed) and reappears when toggled off. Default: off.

**Table primitive:** Adopt shadcn's `Table`/`TableHeader`/`TableBody`/`TableRow`/`TableHead`/`TableCell`. It's a thin styling wrapper (no shadow to strip — verified via `--dry-run --diff`) with no independent interaction logic; all sortable-header click handling and row rendering (position badges, claimed-diff, rookie/PKG/LIVE tags) stays custom, same as today, just using the styled wrapper elements instead of bare `<table>`/`<tr>`/`<td>`.

**Position filter — ToggleGroup:** Base UI's `ToggleGroup` binds `value`/`onValueChange` to an **array** of pressed values (`readonly Value[]`), even with `multiple` defaulting to `false` (single-select just means "pressing one unpresses the others" — it does not prevent the array from going empty if the user clicks the currently-active item again). Binding:

```tsx
<ToggleGroup
  value={[posFilter]}
  onValueChange={(vals) => onPosFilterChange((vals[0] as 'ALL' | Position) ?? 'ALL')}
>
  {POSITIONS.map((pos) => {
    const active = pos === posFilter;
    const c = pos === 'ALL' ? null : POS_COLORS[pos];
    return (
      <ToggleGroupItem
        key={pos}
        value={pos}
        style={
          active
            ? {
                borderColor: c?.accent ?? POS_COLORS.PICK.accent,
                background: c?.bg ?? POS_COLORS.PICK.bg,
                color: c?.accent ?? POS_COLORS.PICK.accent,
              }
            : undefined
        }
      >
        {pos}
      </ToggleGroupItem>
    );
  })}
</ToggleGroup>
```

Active-state position coloring uses the same inline-override pattern as Phase 2's Nom button — a one-off `style` per item computed from `POS_COLORS` when that item is the active filter, not a new cva variant (position colors are informational, not a reusable brand concept). `ALL`'s active state reuses `POS_COLORS.PICK`'s teal, matching today's fallback.

**Show Notes / Available Only — Toggle:** Both are simple booleans, mapped directly to shadcn `Toggle`'s `pressed`/`onPressedChange`. No array wrinkle (that's ToggleGroup-only).

**Token extension (`globals.css`):** Add two entries to the existing `@theme inline` block:

```css
--color-text-secondary: var(--text-secondary);
--color-border-subtle: var(--border-subtle);
```

This generates real Tailwind utilities (`text-secondary`, `border-subtle`) alongside the existing `text-muted-foreground`/`border-border`. Justification: BidModal needed exactly one inline exception for `--text-secondary`; AuctionSheet uses both `--text-secondary` and `--border-subtle` dozens of times across the header, controls, legend, and table. Sanctioned by Phase 1's own rule ("extend/refine this layer, don't replace it").

**Colors staying literal (not promoted to any token):**

- Rookie badge (amber `#e8a030`/`#3a2800`) — coincidentally matches `--pos-wr`/`--age-aging` but represents an unrelated concept (rookie status); reusing either token's name would mislead a future reader
- PKG badge → becomes `var(--pos-pkg)` (exact semantic match — PKG rows already use this token elsewhere)
- LIVE badge → becomes `var(--pos-pick)` (exact semantic match — matches the nominated-row left-border color already using this token)
- Budget/Spent/Remaining tracker (blue/amber/green/red) — financial status, not position/age; no "success/danger" token pair exists in the system and this spec doesn't introduce one (Non-goals). Values stay as literal hex identical to today.

**Sort icons:** Replace unicode ↑/↓/↕ with `lucide-react`'s `ArrowUp`/`ArrowDown`/`ArrowUpDown` at `h-3.5 w-3.5`, colored the same way as today (muted when inactive, `--pos-wr` amber when active column).

**`tabular-nums`:** Apply via `font-variant-numeric: tabular-nums` (already available as a utility from Tailwind, `tabular-nums` class) to every numeric table cell: SF Rank, Age, Floor, Target, Ceiling, and the Claimed price/diff cells.

**Shadow/ring cleanup:** Per Phase 1/2 precedent — verified via `--dry-run --diff`: `table.tsx`, `toggle.tsx`, `toggle-group.tsx` ship with no `shadow-*` classes. Nothing to strip this phase.

## Testing

`src/__tests__/AuctionSheet.claimed.test.tsx` gets rewritten with `userEvent` in place of `fireEvent` for consistency with Phase 1/2. `ToggleGroup`/`Toggle` are Base UI components with the same async open/press-state commit pattern established for `DropdownMenu`/`Select`/`Dialog` — tests must `await waitFor(...)` on `data-pressed`/`aria-pressed` before asserting, not assert synchronously after `userEvent.click()`.

New test cases:

- Available Only toggle hides claimed players from the table
- Available Only toggle hides the `Claimed` column header
- Toggling Available Only back off restores both
- Position ToggleGroup: clicking the active pill again falls back to `ALL` (the array-can-go-empty edge case), rather than leaving the table showing zero players

Subcomponent-level tests are added only where a subcomponent carries logic: `FilterControls` (toggle/input wiring dispatches the right callback), `PlayerTable` (clicking a sortable header calls `onSort` with the right column, clicking a row calls `onRowClick` with the right player). `AuctionHeader` is pure presentation (formats props into markup, no internal logic) and doesn't need a dedicated unit test — the existing `AuctionSheet.claimed.test.tsx` integration coverage (which renders the full tree) already exercises it.

No new jsdom polyfills expected — `Table` has no interactive JS, and `Toggle`/`ToggleGroup` are plain buttons (no popover/portal), so the existing `PointerEvent`/pointer-capture/`ResizeObserver` polyfills in `jest.setup.ts` should be sufficient; confirmed or expanded at implementation time if a test reveals otherwise.

`pnpm tsc --noEmit` and `pnpm lint` must pass (existing pre-commit gate). Manual verification: position filter pills (click through each, click active pill twice to confirm ALL fallback), search, Show Notes toggle, Available Only toggle (claimed rows disappear, column disappears, toggling off restores both), column sort (all 8 sortable columns, both directions), row click opens BidModal in add/edit mode, tabular-nums alignment on the numeric columns, overall visual review against Phase 1/2's established look.

## Rollout

Ships as one PR (same branch as Phases 1–2, PR #26, or a new PR if that one has since merged): `npx shadcn@latest add table toggle toggle-group` + `globals.css` token extension + `AuctionSheet.tsx` split into 4 files + `AuctionSheet.claimed.test.tsx` rewrite. No feature flag — internal component swap plus one additive filter, no external API changes.
