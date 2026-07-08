# UI Redesign Phase 3: AuctionSheet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `AuctionSheet.tsx` into 4 focused files, replace native table/button/input elements with shadcn `Table`/`ToggleGroup`/`Toggle`/`Input`, extend the design-token system with two new Tailwind utilities, and add an "Available Only" filter that hides claimed players.

**Architecture:** `AuctionSheet.tsx` stays the orchestrator (state, optimistic bid updates, server-action handlers) and renders three new presentational/interactive children: `AuctionHeader` (budget tracker + market-weight bar), `FilterControls` (position filter, search, notes/available toggles, legend), `PlayerTable` (sortable shadcn `Table`). All styling moves from inline `style={{}}` objects to Tailwind classes bound to the existing CSS-variable token system, with position/age/badge colors staying inline per established precedent (Phases 1–2).

**Tech Stack:** Next.js 16, React 19, TypeScript 5 strict, Tailwind CSS 4, shadcn/ui on Base UI (`@base-ui/react`), Jest + React Testing Library + `@testing-library/user-event`, `lucide-react`.

## Global Constraints

- `pnpm tsc --noEmit` and `pnpm lint` must pass before any commit (pre-commit gate)
- Single quotes, trailing commas, 2-space indent, 100-char line width (Prettier) — reformat any code block that exceeds this before committing
- No `any` — use `unknown` with a type guard if a type is genuinely unknown
- Functional components only, explicit `interface` for every component's props (not inline literals)
- Test interactive elements via `userEvent`, not `fireEvent`; Base UI components commit open/pressed state asynchronously — every assertion on that state must be wrapped in `await waitFor(...)`
- Elevation via 1px borders, never `shadow-*` utility classes — strip any `shadow-*` shipped by `shadcn add` before committing (this phase: verified via `--dry-run --diff` that `table.tsx`/`toggle.tsx`/`toggle-group.tsx` ship with none — nothing to strip, but re-verify after running the real `add` command in case the installed version differs)
- Position colors (`POS_COLORS`), age colors (`ageColor`/`--age-*`), and any color that is a coincidental hex match to an existing token but represents an unrelated concept (Rookie badge, Budget/Spent/Remaining tracker, claimed-price over/under diff) stay as inline `style`, never promoted to a Tailwind class
- The two new `@theme inline` tokens this phase adds are exactly `--color-secondary-fg` (aliasing the existing `--text-secondary`, renamed to avoid colliding with the pre-existing `--color-secondary` semantic token — see Task 1 Step 3 note) and `--color-border-subtle` (aliasing the existing `--border-subtle`) — do not add further tokens beyond these two without checking with the human partner first (this was explicitly scoped in the spec's Non-goals)

---

## File Structure

```
src/app/globals.css                       — Modify: add 2 lines to @theme inline block
src/components/AuctionSheet/
├── AuctionSheet.tsx                       — Modify: strip to orchestrator, ~200 lines
├── AuctionHeader.tsx                      — Create: eyebrow/title/budget tracker/market bar
├── FilterControls.tsx                     — Create: position filter, search, toggles, legend
├── PlayerTable.tsx                        — Create: sortable table + rows
└── index.ts                               — unchanged (`export { default } from './AuctionSheet'`)
src/components/ui/table.tsx                — Create: shadcn add
src/components/ui/toggle.tsx               — Create: shadcn add
src/components/ui/toggle-group.tsx         — Create: shadcn add
src/__tests__/AuctionSheet.claimed.test.tsx — Modify: userEvent rewrite + new test cases
src/__tests__/FilterControls.test.tsx      — Create
src/__tests__/PlayerTable.test.tsx         — Create
src/__tests__/AuctionHeader.test.tsx       — Create
```

---

### Task 1: Install shadcn primitives and extend design tokens

**Files:**

- Create: `src/components/ui/table.tsx`
- Create: `src/components/ui/toggle.tsx`
- Create: `src/components/ui/toggle-group.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**

- Produces: `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell`, `TableCaption`, `TableFooter` from `@/components/ui/table`
- Produces: `Toggle`, `toggleVariants` from `@/components/ui/toggle`
- Produces: `ToggleGroup`, `ToggleGroupItem` from `@/components/ui/toggle-group`
- Produces: Tailwind utility classes `text-secondary-fg` and `border-border-subtle`, usable in any later task

- [ ] **Step 1: Run the shadcn CLI to add the three primitives**

```bash
npx shadcn@latest add table toggle toggle-group
```

Expected: creates `src/components/ui/table.tsx`, `src/components/ui/toggle.tsx`, `src/components/ui/toggle-group.tsx`. It may also touch `src/components/ui/button.tsx` as a registry dependency — if so, diff it against git and confirm the change is formatting-only (no semantic change), same as happened in Phase 2 Task 1.

- [ ] **Step 2: Verify no `shadow-*` classes were shipped**

```bash
grep -n "shadow-" src/components/ui/table.tsx src/components/ui/toggle.tsx src/components/ui/toggle-group.tsx
```

Expected: no output. If any `shadow-*` class appears, remove it from the className string (same treatment as `select.tsx` in Phase 2 — elevation is borders-only in this design system).

- [ ] **Step 3: Extend `globals.css`'s `@theme inline` block**

In `src/app/globals.css`, find the `@theme inline` block (it currently ends with the `--spacing-xl: 32px;` line before the closing `}`). Add these two lines immediately after `--spacing-xl: 32px;`:

```css
--color-secondary-fg: var(--text-secondary);
--color-border-subtle: var(--border-subtle);
```

**Naming note — do not rename these tokens.** Tailwind v4 generates a utility by stripping `--color-` off the variable name (`--color-border: var(--border)` → `border-border`, confirmed elsewhere in this same file). Two consequences that must hold or later tasks silently render wrong colors:

- The alias is named `--color-secondary-fg`, not `--color-text-secondary`, because `--color-secondary` already exists in this file (shadcn's semantic `secondary` = `--bg-elevated`, a background token, not the muted-text color this phase needs). Naming it `--color-text-secondary` would generate `text-text-secondary` — an unrelated, unused class — while a naive read of "add a text-secondary token" could tempt using the pre-existing (wrong) `text-secondary` utility, which resolves to near-black `#1a1f2e` text on the `#0a0d14` page (effectively invisible). The correct generated class from `--color-secondary-fg` is `text-secondary-fg`. Use exactly that class name in Tasks 2–5, never `text-secondary`.
- `--color-border-subtle` has no existing collision, but still generates the double-word class `border-border-subtle` (not `border-subtle`). Use exactly `border-border-subtle` in Tasks 2–5.

- [ ] **Step 4: Verify the new utilities compile**

Create a throwaway check — run the dev server and confirm no Tailwind warnings, or simply run the build:

```bash
pnpm tsc --noEmit
```

Expected: no errors (this step only touches CSS, so `tsc` passing just confirms nothing else broke). The real verification of `text-secondary-fg`/`border-border-subtle` classes happens visually in Task 2 when they're first used.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/table.tsx src/components/ui/toggle.tsx src/components/ui/toggle-group.tsx src/app/globals.css
git commit -m "feat: add shadcn Table/Toggle/ToggleGroup, extend design tokens"
```

If `button.tsx` was also touched in Step 1 and confirmed formatting-only, include it in this commit too.

---

### Task 2: Extract `AuctionHeader.tsx`

**Files:**

- Create: `src/components/AuctionSheet/AuctionHeader.tsx`
- Test: `src/__tests__/AuctionHeader.test.tsx`

**Interfaces:**

- Consumes: `POS_COLORS` from `@/lib/posColors`, `Position` from `@/types`
- Produces:

```typescript
interface AuctionHeaderProps {
  ownerBudget: number;
  mySpent: number;
  remaining: number;
  posStats: Record<'QB' | 'RB' | 'WR' | 'TE', { count: number; total: number }>;
  grandTotal: number;
  totalPlayerCount: number;
}
```

exported as `export default function AuctionHeader(props: AuctionHeaderProps)`.

- [ ] **Step 1: Write the failing test**

```typescript
// src/__tests__/AuctionHeader.test.tsx
import React from 'react';
import { render, screen } from '@testing-library/react';
import AuctionHeader from '@/components/AuctionSheet/AuctionHeader';

const POS_STATS = {
  QB: { count: 2, total: 200 },
  RB: { count: 2, total: 300 },
  WR: { count: 2, total: 400 },
  TE: { count: 1, total: 100 },
};

describe('AuctionHeader', () => {
  it('renders budget, spent, and remaining dollar values', () => {
    render(
      <AuctionHeader
        ownerBudget={1000}
        mySpent={250}
        remaining={750}
        posStats={POS_STATS}
        grandTotal={1000}
        totalPlayerCount={267}
      />,
    );

    expect(screen.getByText('$1000')).toBeInTheDocument();
    expect(screen.getByText('$250')).toBeInTheDocument();
    expect(screen.getByText('$750')).toBeInTheDocument();
  });

  it('renders the total player count in the subtitle', () => {
    render(
      <AuctionHeader
        ownerBudget={1000}
        mySpent={0}
        remaining={1000}
        posStats={POS_STATS}
        grandTotal={1000}
        totalPlayerCount={267}
      />,
    );

    expect(screen.getByText(/267 players/)).toBeInTheDocument();
  });

  it('renders a market-weight segment for each of QB/RB/WR/TE', () => {
    render(
      <AuctionHeader
        ownerBudget={1000}
        mySpent={0}
        remaining={1000}
        posStats={POS_STATS}
        grandTotal={1000}
        totalPlayerCount={267}
      />,
    );

    expect(screen.getByText(/20% · \$200/)).toBeInTheDocument(); // QB: 200/1000
    expect(screen.getByText(/40% · \$400/)).toBeInTheDocument(); // WR: 400/1000
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test AuctionHeader
```

Expected: FAIL — `Cannot find module '@/components/AuctionSheet/AuctionHeader'`.

- [ ] **Step 3: Write `AuctionHeader.tsx`**

```tsx
// src/components/AuctionSheet/AuctionHeader.tsx
import type { Position } from '@/types';
import { POS_COLORS } from '@/lib/posColors';

interface AuctionHeaderProps {
  ownerBudget: number;
  mySpent: number;
  remaining: number;
  posStats: Record<'QB' | 'RB' | 'WR' | 'TE', { count: number; total: number }>;
  grandTotal: number;
  totalPlayerCount: number;
}

const MARKET_POSITIONS: Position[] = ['QB', 'RB', 'WR', 'TE'];

export default function AuctionHeader({
  ownerBudget,
  mySpent,
  remaining,
  posStats,
  grandTotal,
  totalPlayerCount,
}: AuctionHeaderProps) {
  return (
    <div className="border-b border-border bg-card px-5 pt-[18px] pb-3.5">
      <div className="font-label mb-1 text-[10px] tracking-[3px] text-muted-foreground uppercase">
        12-Team · Superflex · TE Premium · $1,000 Budget · 30-Man Rosters
      </div>
      <h1 className="font-label m-0 mb-0.5 text-xl font-bold tracking-tight text-white">
        Startup Auction Value Sheet
      </h1>
      <div className="text-[11px] text-muted-foreground">
        2QB rankings scaled 5× · TE PPR+1 / 1st Down+0.25 applied · {totalPlayerCount} players +
        pick assets
      </div>

      {/* Budget tracker */}
      <div className="mt-3.5 flex flex-wrap items-center gap-2.5">
        <div className="flex items-center gap-4 rounded-lg bg-muted px-3.5 py-2">
          <div className="text-center">
            <div className="font-label text-[10px] tracking-wide text-muted-foreground uppercase">
              Budget
            </div>
            <div
              className="font-mono text-lg font-bold tabular-nums"
              style={{ color: 'var(--pos-qb)' }}
            >
              ${ownerBudget}
            </div>
          </div>
          <div className="text-center">
            <div className="font-label text-[10px] tracking-wide text-muted-foreground uppercase">
              Spent
            </div>
            <div
              className="font-mono text-lg font-bold tabular-nums"
              style={{ color: 'var(--pos-wr)' }}
            >
              ${mySpent}
            </div>
          </div>
          <div className="text-center">
            <div className="font-label text-[10px] tracking-wide text-muted-foreground uppercase">
              Remaining
            </div>
            <div
              className="font-mono text-lg font-bold tabular-nums"
              style={{ color: remaining < 100 ? 'var(--age-old)' : 'var(--age-young)' }}
            >
              ${remaining}
            </div>
          </div>
        </div>
        <div className="max-w-[200px] text-[11px] text-muted-foreground">
          ↑ Track your spend to know who can still hurt you in the room
        </div>
      </div>

      {/* Market weight by position */}
      <div className="mt-3 rounded-lg bg-muted px-3 py-2">
        <div className="font-label mb-[5px] text-[10px] tracking-wide text-muted-foreground uppercase">
          Market weight by position
        </div>
        <div className="flex h-1.5 gap-px overflow-hidden rounded-[3px]">
          {MARKET_POSITIONS.map((pos) => {
            const pct = ((posStats[pos].total / grandTotal) * 100).toFixed(1);
            return (
              <div
                key={pos}
                style={{ width: `${pct}%`, background: POS_COLORS[pos].accent, opacity: 0.8 }}
              />
            );
          })}
        </div>
        <div className="mt-[5px] flex gap-3.5">
          {MARKET_POSITIONS.map((pos) => {
            const pct = ((posStats[pos].total / grandTotal) * 100).toFixed(0);
            return (
              <div key={pos} className="flex items-center gap-1 text-[10px]">
                <div
                  className="h-[7px] w-[7px] rounded-sm"
                  style={{ background: POS_COLORS[pos].accent }}
                />
                <span className="text-secondary-fg">{pos}</span>
                <span className="font-mono text-muted-foreground tabular-nums">
                  {pct}% · ${posStats[pos].total}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test AuctionHeader
```

Expected: PASS (3/3).

- [ ] **Step 5: Commit**

```bash
git add src/components/AuctionSheet/AuctionHeader.tsx src/__tests__/AuctionHeader.test.tsx
git commit -m "feat: extract AuctionHeader from AuctionSheet"
```

---

### Task 3: Extract `FilterControls.tsx`

**Files:**

- Create: `src/components/AuctionSheet/FilterControls.tsx`
- Test: `src/__tests__/FilterControls.test.tsx`

**Interfaces:**

- Consumes: `Toggle` from `@/components/ui/toggle`, `ToggleGroup`/`ToggleGroupItem` from `@/components/ui/toggle-group`, `Input` from `@/components/ui/input`, `POS_COLORS` from `@/lib/posColors`, `Position` from `@/types`
- Produces:

```typescript
export type PositionFilter = 'ALL' | Position;

interface FilterControlsProps {
  posFilter: PositionFilter;
  onPosFilterChange: (pos: PositionFilter) => void;
  search: string;
  onSearchChange: (value: string) => void;
  showNotes: boolean;
  onShowNotesChange: (value: boolean) => void;
  availableOnly: boolean;
  onAvailableOnlyChange: (value: boolean) => void;
  resultCount: number;
}
```

exported as `export default function FilterControls(props: FilterControlsProps)`. `PositionFilter` is a named export — Task 5 imports it for `AuctionSheet`'s `posFilter` state type.

- [ ] **Step 1: Write the failing test**

```typescript
// src/__tests__/FilterControls.test.tsx
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FilterControls from '@/components/AuctionSheet/FilterControls';

function renderControls(overrides: Partial<React.ComponentProps<typeof FilterControls>> = {}) {
  const onPosFilterChange = jest.fn();
  const onSearchChange = jest.fn();
  const onShowNotesChange = jest.fn();
  const onAvailableOnlyChange = jest.fn();
  render(
    <FilterControls
      posFilter="ALL"
      onPosFilterChange={onPosFilterChange}
      search=""
      onSearchChange={onSearchChange}
      showNotes={false}
      onShowNotesChange={onShowNotesChange}
      availableOnly={false}
      onAvailableOnlyChange={onAvailableOnlyChange}
      resultCount={267}
      {...overrides}
    />,
  );
  return { onPosFilterChange, onSearchChange, onShowNotesChange, onAvailableOnlyChange };
}

describe('FilterControls', () => {
  it('calls onPosFilterChange with the clicked position', async () => {
    const user = userEvent.setup();
    const { onPosFilterChange } = renderControls();

    await user.click(screen.getByRole('button', { name: 'QB' }));

    await waitFor(() => expect(onPosFilterChange).toHaveBeenCalledWith('QB'));
  });

  it('falls back to ALL when the active pill is clicked again', async () => {
    const user = userEvent.setup();
    const { onPosFilterChange } = renderControls({ posFilter: 'QB' });

    await user.click(screen.getByRole('button', { name: 'QB' }));

    await waitFor(() => expect(onPosFilterChange).toHaveBeenCalledWith('ALL'));
  });

  it('calls onSearchChange as the user types', async () => {
    const user = userEvent.setup();
    const { onSearchChange } = renderControls();

    await user.type(screen.getByPlaceholderText('Search player or team...'), 'a');

    expect(onSearchChange).toHaveBeenCalledWith('a');
  });

  it('calls onShowNotesChange when Show Notes is toggled', async () => {
    const user = userEvent.setup();
    const { onShowNotesChange } = renderControls();

    await user.click(screen.getByRole('button', { name: /show notes/i }));

    await waitFor(() => expect(onShowNotesChange).toHaveBeenCalledWith(true, expect.anything()));
  });

  it('calls onAvailableOnlyChange when Available Only is toggled', async () => {
    const user = userEvent.setup();
    const { onAvailableOnlyChange } = renderControls();

    await user.click(screen.getByRole('button', { name: /available only/i }));

    await waitFor(() => expect(onAvailableOnlyChange).toHaveBeenCalledWith(true, expect.anything()));
  });

  it('renders the result count', () => {
    renderControls({ resultCount: 42 });

    expect(screen.getByText('42 players shown')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test FilterControls
```

Expected: FAIL — `Cannot find module '@/components/AuctionSheet/FilterControls'`.

- [ ] **Step 3: Write `FilterControls.tsx`**

```tsx
// src/components/AuctionSheet/FilterControls.tsx
'use client';

import type { Position } from '@/types';
import { POS_COLORS } from '@/lib/posColors';
import { Toggle } from '@/components/ui/toggle';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Input } from '@/components/ui/input';

export type PositionFilter = 'ALL' | Position;

const POSITIONS: PositionFilter[] = ['ALL', 'QB', 'RB', 'WR', 'TE', 'PICK', 'PKG'];

interface FilterControlsProps {
  posFilter: PositionFilter;
  onPosFilterChange: (pos: PositionFilter) => void;
  search: string;
  onSearchChange: (value: string) => void;
  showNotes: boolean;
  onShowNotesChange: (value: boolean) => void;
  availableOnly: boolean;
  onAvailableOnlyChange: (value: boolean) => void;
  resultCount: number;
}

export default function FilterControls({
  posFilter,
  onPosFilterChange,
  search,
  onSearchChange,
  showNotes,
  onShowNotesChange,
  availableOnly,
  onAvailableOnlyChange,
  resultCount,
}: FilterControlsProps) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-2.5 border-b border-border-subtle bg-[#0d1018] px-5 py-3">
        <ToggleGroup
          value={[posFilter]}
          onValueChange={(vals) =>
            onPosFilterChange((vals[0] as PositionFilter | undefined) ?? 'ALL')
          }
          className="flex-wrap gap-[3px]"
        >
          {POSITIONS.map((pos) => {
            const active = pos === posFilter;
            const c = pos === 'ALL' ? null : POS_COLORS[pos];
            return (
              <ToggleGroupItem
                key={pos}
                value={pos}
                className="font-label rounded-[5px] border border-border px-2.5 py-1 text-[11px] font-semibold tracking-wide text-muted-foreground"
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

        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search player or team..."
          className="w-[180px]"
        />

        <Toggle
          pressed={showNotes}
          onPressedChange={onShowNotesChange}
          variant="outline"
          className="text-[11px]"
        >
          {showNotes ? 'Hide Notes' : 'Show Notes'}
        </Toggle>

        <Toggle
          pressed={availableOnly}
          onPressedChange={onAvailableOnlyChange}
          variant="outline"
          className="text-[11px]"
        >
          Available Only
        </Toggle>

        <div className="ml-auto text-[11px] text-muted-foreground">{resultCount} players shown</div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-[18px] border-b border-border-subtle bg-[#080a10] px-5 py-1.5 text-[10px] text-muted-foreground">
        <span>
          🔻 <b className="text-secondary-fg">Floor</b> = steal territory
        </span>
        <span>
          💰 <b className="text-secondary-fg">Target</b> = calibrated bid
        </span>
        <span>
          🔺 <b className="text-secondary-fg">Ceiling</b> = hard stop
        </span>
        <span className="border-l border-border-subtle pl-[18px]">
          Age: <span style={{ color: 'var(--age-young)' }}>≤24</span>{' '}
          <span style={{ color: 'var(--age-prime)' }}>25–27</span>{' '}
          <span style={{ color: 'var(--age-aging)' }}>28–30</span>{' '}
          <span style={{ color: 'var(--age-old)' }}>31+</span>
        </span>
        <span>
          <b style={{ color: 'var(--pos-wr)', fontSize: 9 }}>R</b> = Rookie ·{' '}
          <b style={{ color: 'var(--pos-pkg)', fontSize: 9 }}>PKG</b> = 2027 1st+2nd+3rd via kicker
          bid
        </span>
      </div>
    </>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test FilterControls
```

Expected: PASS (6/6). If the ToggleGroup click tests fail because the button's accessible name resolves differently than `'QB'` (e.g. Base UI adds extra text), inspect with `screen.debug()` and adjust the `name` matcher — do not change the component's visible text to fit the test.

- [ ] **Step 5: Commit**

```bash
git add src/components/AuctionSheet/FilterControls.tsx src/__tests__/FilterControls.test.tsx
git commit -m "feat: extract FilterControls with new Available Only toggle"
```

---

### Task 4: Extract `PlayerTable.tsx`

**Files:**

- Create: `src/components/AuctionSheet/PlayerTable.tsx`
- Test: `src/__tests__/PlayerTable.test.tsx`

**Interfaces:**

- Consumes: `Table`/`TableHeader`/`TableBody`/`TableRow`/`TableHead`/`TableCell` from `@/components/ui/table`, `POS_COLORS` from `@/lib/posColors`, `Player`/`ClaimedBid` from `@/types`, `ArrowUp`/`ArrowDown`/`ArrowUpDown` from `lucide-react`
- Produces:

```typescript
export type SortKey = keyof Player;

interface PlayerTableProps {
  players: Player[];
  showNotes: boolean;
  hasClaims: boolean;
  claimMap: Map<string, ClaimedBid>;
  nominatedSet: Set<string>;
  sortBy: SortKey;
  sortDir: 'asc' | 'desc';
  onSort: (col: SortKey) => void;
  onRowClick: (player: Player) => void;
}
```

exported as `export default function PlayerTable(props: PlayerTableProps)`. `SortKey` is a named export — Task 5 imports it for `AuctionSheet`'s `sortBy` state type.

- [ ] **Step 1: Write the failing test**

```typescript
// src/__tests__/PlayerTable.test.tsx
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PlayerTable from '@/components/AuctionSheet/PlayerTable';
import type { Player, ClaimedBid } from '@/types';

const PLAYERS: Player[] = [
  {
    player: 'Josh Allen',
    team: 'BUF',
    pos: 'QB',
    age: 28,
    sfRank: 1,
    budget: 120,
    ceiling: 138,
    floor: 104,
    notes: 'Elite dual-threat',
  },
  {
    player: 'Justin Jefferson',
    team: 'MIN',
    pos: 'WR',
    age: 25,
    sfRank: 5,
    budget: 95,
    ceiling: 109,
    floor: 83,
    notes: '',
  },
];

function renderTable(overrides: Partial<React.ComponentProps<typeof PlayerTable>> = {}) {
  const onSort = jest.fn();
  const onRowClick = jest.fn();
  render(
    <PlayerTable
      players={PLAYERS}
      showNotes={false}
      hasClaims={false}
      claimMap={new Map<string, ClaimedBid>()}
      nominatedSet={new Set<string>()}
      sortBy="sfRank"
      sortDir="asc"
      onSort={onSort}
      onRowClick={onRowClick}
      {...overrides}
    />,
  );
  return { onSort, onRowClick };
}

describe('PlayerTable', () => {
  it('renders a row per player', () => {
    renderTable();

    expect(screen.getByText('Josh Allen')).toBeInTheDocument();
    expect(screen.getByText('Justin Jefferson')).toBeInTheDocument();
  });

  it('calls onSort with the clicked column key', async () => {
    const user = userEvent.setup();
    const { onSort } = renderTable();

    await user.click(screen.getByText('Player'));

    expect(onSort).toHaveBeenCalledWith('player');
  });

  it('calls onRowClick with the clicked player', async () => {
    const user = userEvent.setup();
    const { onRowClick } = renderTable();

    await user.click(screen.getByText('Josh Allen'));

    expect(onRowClick).toHaveBeenCalledWith(PLAYERS[0]);
  });

  it('shows the Notes column only when showNotes is true', () => {
    const { rerender } = render(
      <PlayerTable
        players={PLAYERS}
        showNotes={false}
        hasClaims={false}
        claimMap={new Map()}
        nominatedSet={new Set()}
        sortBy="sfRank"
        sortDir="asc"
        onSort={jest.fn()}
        onRowClick={jest.fn()}
      />,
    );
    expect(screen.queryByText('Elite dual-threat')).not.toBeInTheDocument();

    rerender(
      <PlayerTable
        players={PLAYERS}
        showNotes
        hasClaims={false}
        claimMap={new Map()}
        nominatedSet={new Set()}
        sortBy="sfRank"
        sortDir="asc"
        onSort={jest.fn()}
        onRowClick={jest.fn()}
      />,
    );
    expect(screen.getByText('Elite dual-threat')).toBeInTheDocument();
  });

  it('shows the Claimed column only when hasClaims is true', () => {
    const { rerender } = render(
      <PlayerTable
        players={PLAYERS}
        showNotes={false}
        hasClaims={false}
        claimMap={new Map()}
        nominatedSet={new Set()}
        sortBy="sfRank"
        sortDir="asc"
        onSort={jest.fn()}
        onRowClick={jest.fn()}
      />,
    );
    expect(screen.queryByText('Claimed')).not.toBeInTheDocument();

    rerender(
      <PlayerTable
        players={PLAYERS}
        showNotes={false}
        hasClaims
        claimMap={new Map()}
        nominatedSet={new Set()}
        sortBy="sfRank"
        sortDir="asc"
        onSort={jest.fn()}
        onRowClick={jest.fn()}
      />,
    );
    expect(screen.getByText('Claimed')).toBeInTheDocument();
  });

  it('shows a LIVE badge for players in nominatedSet', () => {
    renderTable({ nominatedSet: new Set(['Josh Allen']) });

    expect(screen.getByText('LIVE')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test PlayerTable
```

Expected: FAIL — `Cannot find module '@/components/AuctionSheet/PlayerTable'`.

- [ ] **Step 3: Write `PlayerTable.tsx`**

```tsx
// src/components/AuctionSheet/PlayerTable.tsx
'use client';

import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import type { Player, ClaimedBid } from '@/types';
import { POS_COLORS } from '@/lib/posColors';
import { cn } from '@/lib/utils';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';

export type SortKey = keyof Player;

interface PlayerTableProps {
  players: Player[];
  showNotes: boolean;
  hasClaims: boolean;
  claimMap: Map<string, ClaimedBid>;
  nominatedSet: Set<string>;
  sortBy: SortKey;
  sortDir: 'asc' | 'desc';
  onSort: (col: SortKey) => void;
  onRowClick: (player: Player) => void;
}

const SORT_COLUMNS: Array<{ key: SortKey; label: string }> = [
  { key: 'sfRank', label: 'SF Rank' },
  { key: 'player', label: 'Player' },
  { key: 'pos', label: 'Pos' },
  { key: 'team', label: 'Team' },
  { key: 'age', label: 'Age' },
  { key: 'floor', label: '🔻 Floor' },
  { key: 'budget', label: '💰 Target' },
  { key: 'ceiling', label: '🔺 Ceiling' },
];

function ageColor(age: number | null): string {
  if (age === null) return 'var(--text-muted)';
  if (age <= 24) return 'var(--age-young)';
  if (age <= 27) return 'var(--age-prime)';
  if (age <= 30) return 'var(--age-aging)';
  return 'var(--age-old)';
}

interface SortIconProps {
  col: SortKey;
  sortBy: SortKey;
  sortDir: 'asc' | 'desc';
}

function SortIcon({ col, sortBy, sortDir }: SortIconProps) {
  if (sortBy !== col) return <ArrowUpDown className="ml-1 inline size-3.5 text-muted-foreground" />;
  return sortDir === 'asc' ? (
    <ArrowUp className="ml-1 inline size-3.5" style={{ color: 'var(--pos-wr)' }} />
  ) : (
    <ArrowDown className="ml-1 inline size-3.5" style={{ color: 'var(--pos-wr)' }} />
  );
}

export default function PlayerTable({
  players,
  showNotes,
  hasClaims,
  claimMap,
  nominatedSet,
  sortBy,
  sortDir,
  onSort,
  onRowClick,
}: PlayerTableProps) {
  return (
    <div className="overflow-x-auto px-5 pb-10">
      <Table className="mt-1.5">
        <TableHeader>
          <TableRow className="border-border hover:bg-transparent">
            {SORT_COLUMNS.map((col) => (
              <TableHead
                key={col.key}
                onClick={() => onSort(col.key)}
                className="font-label cursor-pointer border-none py-2 text-[10px] font-semibold tracking-wide whitespace-nowrap uppercase select-none"
                style={{
                  textAlign: col.key === 'player' ? 'left' : 'center',
                  color: sortBy === col.key ? 'var(--pos-wr)' : undefined,
                }}
              >
                {col.label}
                <SortIcon col={col.key} sortBy={sortBy} sortDir={sortDir} />
              </TableHead>
            ))}
            {showNotes && (
              <TableHead className="font-label border-none py-2 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                Notes
              </TableHead>
            )}
            {hasClaims && (
              <TableHead className="font-label border-none py-2 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                Claimed
              </TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {players.map((p, i) => {
            const c = POS_COLORS[p.pos];
            const isRookie = p.notes.toLowerCase().includes('rookie');
            const isPkg = p.pos === 'PKG';
            const isNominated = nominatedSet.has(p.player);
            const claim = claimMap.get(p.player);
            return (
              <TableRow
                key={p.player + i}
                onClick={() => onRowClick(p)}
                className={cn(
                  'cursor-pointer border-b-[#141824] hover:bg-card',
                  isNominated ? 'bg-[#0d1f1f]' : i % 2 !== 0 ? 'bg-[#0a0c10]' : undefined,
                )}
                style={{
                  borderLeft: `3px solid ${isNominated ? 'var(--pos-pick)' : c.accent}`,
                  opacity: claim ? 0.5 : 1,
                }}
              >
                <TableCell className="text-center font-mono text-[11px] text-muted-foreground tabular-nums">
                  {p.sfRank}
                </TableCell>
                <TableCell className="text-left">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="text-[13px]"
                      style={{
                        fontWeight: isPkg ? 700 : 600,
                        color: isPkg ? 'var(--pos-pkg)' : 'var(--text-primary)',
                      }}
                    >
                      {p.player}
                    </span>
                    {isRookie && (
                      <span
                        className="rounded-[3px] px-1 py-px text-[8px] font-bold tracking-wide uppercase"
                        style={{ background: '#3a2800', color: 'var(--pos-wr)' }}
                      >
                        R
                      </span>
                    )}
                    {isPkg && (
                      <span
                        className="rounded-[3px] px-1 py-px text-[8px] font-bold tracking-wide uppercase"
                        style={{ background: '#3a2a00', color: 'var(--pos-pkg)' }}
                      >
                        PKG
                      </span>
                    )}
                    {isNominated && (
                      <span
                        className="rounded-[3px] px-1 py-px text-[8px] font-bold tracking-wide uppercase"
                        style={{ background: '#0d2a2a', color: 'var(--pos-pick)' }}
                      >
                        LIVE
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-center">
                  <span
                    className="font-label inline-block rounded text-[9px] font-bold tracking-wide"
                    style={{ background: c.badge, color: c.badgeText, padding: '2px 6px' }}
                  >
                    {p.pos}
                  </span>
                </TableCell>
                <TableCell className="text-center text-[11px] text-secondary-fg">
                  {p.team}
                </TableCell>
                <TableCell
                  className="text-center font-mono text-[11px] tabular-nums"
                  style={{ color: ageColor(p.age) }}
                >
                  {p.age !== null ? p.age.toFixed(1) : '—'}
                </TableCell>
                <TableCell className="text-center font-mono text-xs text-secondary-fg tabular-nums">
                  ${p.floor}
                </TableCell>
                <TableCell
                  className="text-center font-mono text-sm font-bold tabular-nums"
                  style={{ color: c.accent }}
                >
                  ${p.budget}
                </TableCell>
                <TableCell
                  className="text-center font-mono text-xs tabular-nums"
                  style={{ color: 'var(--age-old)' }}
                >
                  ${p.ceiling}
                </TableCell>
                {showNotes && (
                  <TableCell className="max-w-[220px] text-[10px] text-muted-foreground">
                    {p.notes || '—'}
                  </TableCell>
                )}
                {hasClaims &&
                  (claim ? (
                    <TableCell className="text-left whitespace-nowrap">
                      <span className="text-[11px] text-secondary-fg">{claim.teamHandle}</span>
                      <span className="ml-1 font-mono text-[11px] text-secondary-fg tabular-nums">
                        ${claim.price}
                      </span>
                      <span
                        className="ml-1 font-mono text-[10px] tabular-nums"
                        style={{
                          color:
                            claim.price - p.budget > 0
                              ? 'var(--age-old)'
                              : claim.price - p.budget < 0
                                ? 'var(--age-young)'
                                : 'var(--text-muted)',
                        }}
                      >
                        {claim.price - p.budget > 0
                          ? `▲$${claim.price - p.budget}`
                          : claim.price - p.budget < 0
                            ? `▼$${Math.abs(claim.price - p.budget)}`
                            : '='}
                      </span>
                    </TableCell>
                  ) : (
                    <TableCell />
                  ))}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test PlayerTable
```

Expected: PASS (6/6).

- [ ] **Step 5: Commit**

```bash
git add src/components/AuctionSheet/PlayerTable.tsx src/__tests__/PlayerTable.test.tsx
git commit -m "feat: extract PlayerTable with shadcn Table and tabular-nums"
```

---

### Task 5: Rewire `AuctionSheet.tsx` orchestrator, wire Available Only end-to-end, rewrite integration tests

**Files:**

- Modify: `src/components/AuctionSheet/AuctionSheet.tsx`
- Modify: `src/__tests__/AuctionSheet.claimed.test.tsx`

**Interfaces:**

- Consumes: `AuctionHeader` (Task 2), `FilterControls`/`PositionFilter` (Task 3), `PlayerTable`/`SortKey` (Task 4), existing `BidModal`
- Produces: no new exports — `AuctionSheet`'s own props (`AuctionSheetProps`) are unchanged from today

- [ ] **Step 1: Write/extend the failing tests in `AuctionSheet.claimed.test.tsx`**

Replace the full file contents:

```typescript
// src/__tests__/AuctionSheet.claimed.test.tsx
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AuctionSheet from '@/components/AuctionSheet/AuctionSheet';
import type { Player, ClaimedBid, LeagueTeam } from '@/types';

const MOCK_PLAYERS: Player[] = [
  {
    player: 'Josh Allen',
    team: 'BUF',
    pos: 'QB',
    age: 28,
    sfRank: 1,
    budget: 120,
    ceiling: 138,
    floor: 104,
    notes: '',
  },
  {
    player: 'Justin Jefferson',
    team: 'MIN',
    pos: 'WR',
    age: 25,
    sfRank: 5,
    budget: 95,
    ceiling: 109,
    floor: 83,
    notes: '',
  },
];

jest.mock('@/lib/actions', () => ({
  logBid: jest.fn().mockResolvedValue(undefined),
  updateBid: jest.fn().mockResolvedValue(undefined),
  deleteBid: jest.fn().mockResolvedValue(undefined),
}));

const mockTeams: LeagueTeam[] = [
  { id: 1, handle: 'coreschke', displayName: 'Cole' },
  { id: 2, handle: 'chappy72', displayName: null },
];

const mockClaim: ClaimedBid = {
  id: 1,
  player: 'Josh Allen',
  position: 'QB',
  price: 110,
  teamId: 1,
  teamHandle: 'coreschke',
};

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true } as Response);
});

afterEach(() => {
  jest.restoreAllMocks();
});

function renderSheet(overrides: Partial<React.ComponentProps<typeof AuctionSheet>> = {}) {
  return render(
    <AuctionSheet
      players={MOCK_PLAYERS}
      claimedBids={[]}
      teams={mockTeams}
      nominatedPlayers={[]}
      draftId={1}
      ownerHandle="coreschke"
      ownerBudget={1000}
      {...overrides}
    />,
  );
}

describe('AuctionSheet with claimed bids', () => {
  it('renders without claimed bids and does not show a Claimed column', () => {
    renderSheet();

    expect(screen.queryByText('Claimed')).not.toBeInTheDocument();
  });

  it('shows a Claimed column header when at least one bid exists', () => {
    renderSheet({ claimedBids: [mockClaim] });

    expect(screen.getByText('Claimed')).toBeInTheDocument();
  });

  it('shows team handle and price in the claimed column for a claimed player', () => {
    renderSheet({ claimedBids: [mockClaim] });

    expect(screen.getByText(/coreschke/)).toBeInTheDocument();
    expect(screen.getAllByText(/\$110/).length).toBeGreaterThan(0);
  });

  it('shows EV diff with ▼ and green color when bought under target', async () => {
    // mockClaim.price = 110, player.budget = 120, diff = -10 → ▼$10
    renderSheet({ claimedBids: [mockClaim] });

    expect(screen.getByText(/▼\$10/)).toBeInTheDocument();
  });

  it('shows EV diff with ▲ and red when overpaid', () => {
    const overClaim: ClaimedBid = { ...mockClaim, price: 130 };
    renderSheet({ claimedBids: [overClaim] });

    // price 130, budget 120, diff = +10 → ▲$10
    expect(screen.getByText(/▲\$10/)).toBeInTheDocument();
  });

  it('opens the modal when a claimed player row is clicked', async () => {
    const user = userEvent.setup();
    renderSheet({ claimedBids: [mockClaim] });

    await user.click(screen.getAllByText('Josh Allen')[0]);

    expect(screen.getByRole('button', { name: /update bid/i })).toBeInTheDocument();
  });

  it('opens the modal when an unclaimed player row is clicked', async () => {
    const user = userEvent.setup();
    renderSheet();

    await user.click(screen.getByText('Justin Jefferson'));

    expect(screen.getByRole('button', { name: /log bid/i })).toBeInTheDocument();
  });

  it('shows LIVE badge for a player in the nominatedPlayers prop', () => {
    renderSheet({ nominatedPlayers: ['Josh Allen'] });

    expect(screen.getByText('LIVE')).toBeInTheDocument();
  });

  it('shows Nom button in modal for an unnominated player', async () => {
    const user = userEvent.setup();
    renderSheet();

    await user.click(screen.getByText('Josh Allen'));

    expect(screen.getByRole('button', { name: /^nom$/i })).toBeInTheDocument();
  });

  it('shows In Auction in modal for an already-nominated player', async () => {
    const user = userEvent.setup();
    renderSheet({ nominatedPlayers: ['Josh Allen'] });

    await user.click(screen.getAllByText('Josh Allen')[0]);

    expect(screen.getByText(/in auction/i)).toBeInTheDocument();
  });

  it('closes modal, shows LIVE badge, and calls /api/draft/1/nominated after clicking Nom', async () => {
    const user = userEvent.setup();
    renderSheet();

    await user.click(screen.getByText('Josh Allen'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^nom$/i }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByText('LIVE')).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/draft/1/nominated',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ playerName: 'Josh Allen' }),
      }),
    );
  });

  it('hides claimed players from the table when Available Only is toggled on', async () => {
    const user = userEvent.setup();
    renderSheet({ claimedBids: [mockClaim] });

    expect(screen.getByText('Josh Allen')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /available only/i }));

    await waitFor(() => expect(screen.queryByText('Josh Allen')).not.toBeInTheDocument());
    expect(screen.getByText('Justin Jefferson')).toBeInTheDocument();
  });

  it('hides the Claimed column while Available Only is active, and restores it when toggled off', async () => {
    const user = userEvent.setup();
    renderSheet({ claimedBids: [mockClaim] });

    expect(screen.getByText('Claimed')).toBeInTheDocument();

    const toggle = screen.getByRole('button', { name: /available only/i });
    await user.click(toggle);
    await waitFor(() => expect(screen.queryByText('Claimed')).not.toBeInTheDocument());

    await user.click(toggle);
    await waitFor(() => expect(screen.getByText('Claimed')).toBeInTheDocument());
  });

  it('falls back to showing all players when the active position pill is clicked again', async () => {
    const user = userEvent.setup();
    renderSheet();

    const qbPill = screen.getByRole('button', { name: 'QB' });
    await user.click(qbPill);
    await waitFor(() => expect(screen.queryByText('Justin Jefferson')).not.toBeInTheDocument());

    await user.click(qbPill);
    await waitFor(() => expect(screen.getByText('Justin Jefferson')).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run the full test suite for this file to confirm it fails against the current (pre-rewire) `AuctionSheet.tsx`**

```bash
pnpm test AuctionSheet.claimed
```

Expected: some tests FAIL — the "Available Only" toggle and its two new tests don't exist yet in the current implementation (no such button rendered), and the position-pill-fallback test may behave differently against the old hand-rolled buttons.

- [ ] **Step 3: Rewrite `AuctionSheet.tsx`**

Replace the full file contents:

```tsx
// src/components/AuctionSheet/AuctionSheet.tsx
'use client';

import { useState, useMemo, useOptimistic, useTransition } from 'react';
import type { Player, Position, ClaimedBid, LeagueTeam } from '@/types';
import { logBid, updateBid, deleteBid } from '@/lib/actions';
import BidModal from '@/components/BidModal';
import AuctionHeader from './AuctionHeader';
import FilterControls, { type PositionFilter } from './FilterControls';
import PlayerTable, { type SortKey } from './PlayerTable';

type OptimisticAction =
  | { type: 'add'; bid: ClaimedBid }
  | { type: 'update'; bid: ClaimedBid }
  | { type: 'delete'; id: number };

interface AuctionSheetProps {
  players: Player[];
  claimedBids: ClaimedBid[];
  teams: LeagueTeam[];
  nominatedPlayers: string[];
  draftId: number;
  ownerHandle: string | null;
  ownerBudget: number;
}

export default function AuctionSheet({
  players,
  claimedBids,
  teams,
  nominatedPlayers,
  draftId,
  ownerHandle,
  ownerBudget,
}: AuctionSheetProps) {
  const [posFilter, setPosFilter] = useState<PositionFilter>('ALL');
  const [search, setSearch] = useState<string>('');
  const [sortBy, setSortBy] = useState<SortKey>('sfRank');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [showNotes, setShowNotes] = useState<boolean>(false);
  const [availableOnly, setAvailableOnly] = useState<boolean>(false);
  const [modalPlayer, setModalPlayer] = useState<Player | null>(null);
  const [modalError, setModalError] = useState<string>('');
  const [, startTransition] = useTransition();
  const [extraNominated, setExtraNominated] = useState<string[]>([]);

  const [optimisticBids, dispatchOptimistic] = useOptimistic<ClaimedBid[], OptimisticAction>(
    claimedBids,
    (state, action) => {
      if (action.type === 'add') return [...state, action.bid];
      if (action.type === 'update')
        return state.map((b) => (b.id === action.bid.id ? action.bid : b));
      if (action.type === 'delete') return state.filter((b) => b.id !== action.id);
      return state;
    },
  );

  const claimMap = useMemo(
    () => new Map(optimisticBids.map((b) => [b.player, b])),
    [optimisticBids],
  );

  const nominatedSet = useMemo(
    () => new Set([...nominatedPlayers, ...extraNominated]),
    [nominatedPlayers, extraNominated],
  );

  const mySpent = useMemo(() => {
    const myTeam = ownerHandle ? teams.find((t) => t.handle === ownerHandle) : null;
    if (!myTeam) return 0;
    return optimisticBids.filter((b) => b.teamId === myTeam.id).reduce((s, b) => s + b.price, 0);
  }, [teams, optimisticBids, ownerHandle]);

  const hasClaims = optimisticBids.length > 0 && !availableOnly;

  function handleModalSubmit({ price, teamId }: { price: number; teamId: number }) {
    if (!modalPlayer) return;
    const existingBid = claimMap.get(modalPlayer.player);
    const team = teams.find((t) => t.id === teamId);
    if (!team) return;
    setModalError('');

    if (existingBid) {
      const updated: ClaimedBid = { ...existingBid, price, teamId, teamHandle: team.handle };
      startTransition(async () => {
        dispatchOptimistic({ type: 'update', bid: updated });
        try {
          await updateBid({ id: existingBid.id, price, teamId, draftId });
          setModalPlayer(null);
        } catch (e) {
          if (e instanceof Error && e.message === 'Unauthorized') {
            window.location.href = '/sign-in';
          } else if (
            e instanceof Error &&
            (e.message === 'No draft found' || e.message === 'Team not found in draft')
          ) {
            setModalError('Draft not configured. Please check your setup.');
          } else {
            setModalError('Failed to save bid. Please try again.');
          }
        }
      });
    } else {
      const tempBid: ClaimedBid = {
        id: -Date.now(),
        player: modalPlayer.player,
        position: modalPlayer.pos,
        price,
        teamId,
        teamHandle: team.handle,
      };
      startTransition(async () => {
        dispatchOptimistic({ type: 'add', bid: tempBid });
        try {
          await logBid({
            player: modalPlayer.player,
            position: modalPlayer.pos,
            nflTeam: modalPlayer.team,
            price,
            sfRank: modalPlayer.sfRank,
            teamId,
            draftId,
          });
          setModalPlayer(null);
        } catch (e) {
          if (e instanceof Error && e.message === 'Unauthorized') {
            window.location.href = '/sign-in';
          } else if (
            e instanceof Error &&
            (e.message === 'No draft found' || e.message === 'Team not found in draft')
          ) {
            setModalError('Draft not configured. Please check your setup.');
          } else {
            setModalError('Failed to log bid. Please try again.');
          }
        }
      });
    }
  }

  function handleModalDelete() {
    if (!modalPlayer) return;
    const existingBid = claimMap.get(modalPlayer.player);
    if (!existingBid) return;
    setModalError('');
    startTransition(async () => {
      dispatchOptimistic({ type: 'delete', id: existingBid.id });
      try {
        await deleteBid({ id: existingBid.id, draftId });
        setModalPlayer(null);
      } catch (e) {
        if (e instanceof Error && e.message === 'Unauthorized') {
          window.location.href = '/sign-in';
        } else if (
          e instanceof Error &&
          (e.message === 'No draft found' || e.message === 'Team not found in draft')
        ) {
          setModalError('Draft not configured. Please check your setup.');
        } else {
          setModalError('Failed to remove bid. Please try again.');
        }
      }
    });
  }

  function handleNominate(playerName: string) {
    setExtraNominated((prev) => [...prev, playerName]);
    void fetch(`/api/draft/${draftId}/nominated`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerName }),
    }).then((res) => {
      if (res.status === 401) {
        window.location.href = '/sign-in';
        return;
      }
      if (!res.ok) {
        setExtraNominated((prev) => prev.filter((n) => n !== playerName));
      }
    });
  }

  const remaining = ownerBudget - mySpent;

  const filtered = useMemo<Player[]>(() => {
    let data = [...players];
    if (posFilter !== 'ALL') data = data.filter((p) => p.pos === posFilter);
    if (availableOnly) data = data.filter((p) => !claimMap.has(p.player));
    if (search) {
      const q = search.toLowerCase();
      data = data.filter(
        (p) => p.player.toLowerCase().includes(q) || p.team.toLowerCase().includes(q),
      );
    }
    data.sort((a, b) => {
      let aV: string | number | null = a[sortBy] as string | number | null;
      let bV: string | number | null = b[sortBy] as string | number | null;
      if (aV === null || aV === undefined) aV = 9999;
      if (bV === null || bV === undefined) bV = 9999;
      if (typeof aV === 'string') aV = aV.toLowerCase();
      if (typeof bV === 'string') bV = bV.toLowerCase();
      if (aV < bV) return sortDir === 'asc' ? -1 : 1;
      if (aV > bV) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return data;
  }, [posFilter, search, availableOnly, claimMap, sortBy, sortDir, players]);

  const handleSort = (col: SortKey) => {
    if (sortBy === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(col);
      setSortDir(col === 'sfRank' || col === 'player' ? 'asc' : 'desc');
    }
  };

  const posStats = useMemo(() => {
    const stats = {} as Record<'QB' | 'RB' | 'WR' | 'TE', { count: number; total: number }>;
    (['QB', 'RB', 'WR', 'TE'] as const).forEach((pos) => {
      const pp = players.filter((p) => p.pos === pos);
      stats[pos] = { count: pp.length, total: pp.reduce((s, p) => s + p.budget, 0) };
    });
    return stats;
  }, [players]);

  const grandTotal = Object.values(posStats).reduce((s, v) => s + v.total, 0);
  const totalPlayerCount = players.filter(
    (p) => !(['PKG', 'PICK'] as Position[]).includes(p.pos),
  ).length;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AuctionHeader
        ownerBudget={ownerBudget}
        mySpent={mySpent}
        remaining={remaining}
        posStats={posStats}
        grandTotal={grandTotal}
        totalPlayerCount={totalPlayerCount}
      />
      <FilterControls
        posFilter={posFilter}
        onPosFilterChange={setPosFilter}
        search={search}
        onSearchChange={setSearch}
        showNotes={showNotes}
        onShowNotesChange={setShowNotes}
        availableOnly={availableOnly}
        onAvailableOnlyChange={setAvailableOnly}
        resultCount={filtered.length}
      />
      <PlayerTable
        players={filtered}
        showNotes={showNotes}
        hasClaims={hasClaims}
        claimMap={claimMap}
        nominatedSet={nominatedSet}
        sortBy={sortBy}
        sortDir={sortDir}
        onSort={handleSort}
        onRowClick={setModalPlayer}
      />

      <div className="flex flex-wrap gap-4 border-t border-border-subtle px-5 py-2.5 text-[10px] text-muted-foreground/40">
        <span>
          Source: 2QB auction values (FantasyCalc CSV) scaled 5× to $1,000 budget · TE premium ~18%
          applied
        </span>
        <span className="ml-auto">
          PKG target for 2027 kicker = $109 (1st+2nd+3rd bundled w/ SF speculative premium)
        </span>
      </div>
      {modalPlayer && (
        <BidModal
          player={modalPlayer}
          teams={teams}
          existingBid={claimMap.get(modalPlayer.player)}
          onClose={() => setModalPlayer(null)}
          onSubmit={handleModalSubmit}
          onDelete={claimMap.has(modalPlayer.player) ? handleModalDelete : undefined}
          serverError={modalError}
          isNominated={nominatedSet.has(modalPlayer.player)}
          onNominate={() => handleNominate(modalPlayer.player)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the full test suite**

```bash
pnpm test AuctionSheet.claimed FilterControls PlayerTable AuctionHeader
```

Expected: PASS on all four files. If the "falls back to ALL" or "Available Only" tests fail because of how `screen.getByRole('button', { name: ... })` resolves against `ToggleGroupItem`/`Toggle` (Base UI may render `role="button"` with `aria-pressed` rather than a plain button — confirm via `screen.debug()` if a query fails), adjust the query to match the actual rendered role/name rather than changing component behavior.

- [ ] **Step 5: Run the full project test suite to check for regressions elsewhere**

```bash
pnpm test
```

Expected: all tests pass, including `AuctionSheet.claimed.test.tsx`'s and any tests in `NominationHelper`/other components that might import `AuctionSheet` types.

- [ ] **Step 6: Commit**

```bash
git add src/components/AuctionSheet/AuctionSheet.tsx src/__tests__/AuctionSheet.claimed.test.tsx
git commit -m "feat: rewire AuctionSheet orchestrator, add Available Only filter"
```

---

### Task 6: Full verification pass

**Files:** none (verification only)

**Interfaces:** none

- [ ] **Step 1: Typecheck**

```bash
pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 2: Lint**

```bash
pnpm lint
```

Expected: no errors or warnings.

- [ ] **Step 3: Full test suite**

```bash
pnpm test
```

Expected: all tests pass (baseline was 203/203 as of end of Phase 2; this phase adds `AuctionHeader.test.tsx` (3 tests), `FilterControls.test.tsx` (6 tests), `PlayerTable.test.tsx` (6 tests), and 3 new cases in `AuctionSheet.claimed.test.tsx` — expect roughly 221+ passing).

- [ ] **Step 4: Production build**

```bash
pnpm build
```

Expected: build succeeds with no errors.

- [ ] **Step 5: Manual QA checklist (record results, do not skip)**

Run `pnpm dev`, sign in, and on `/`:

- [ ] Position filter pills: click through QB/RB/WR/TE/PICK/PKG, confirm table filters correctly; click the already-active pill again and confirm it falls back to showing all players (ALL)
- [ ] Search box filters by player name and team
- [ ] Show Notes toggle reveals/hides the Notes column
- [ ] Available Only toggle: hides claimed players from the table; the Claimed column disappears while active; toggling off restores both
- [ ] Column sort: click all 8 sortable headers, confirm ascending/descending toggle and the arrow icon updates
- [ ] Row click opens `BidModal` in add mode (unclaimed player) and edit mode (claimed player, pre-filled price, Remove button present)
- [ ] tabular-nums: numeric columns (SF Rank, Age, Floor, Target, Ceiling, Claimed price/diff, Budget/Spent/Remaining) are digit-aligned
- [ ] Overall visual review: header, controls bar, legend, and table match the Phase 1/2 dark/border-based aesthetic (no stray shadows, consistent spacing)

- [ ] **Step 6: Report**

Write results to `.superpowers/sdd/task-6-report.md` (or equivalent) noting: tsc/lint/test/build results, and which manual QA items were verified vs. still need Cole's own browser pass (no OAuth/browser-automation access in this environment).

---

## Self-Review Notes (completed during plan authoring)

- **Spec coverage:** every Goals bullet maps to a task — component split (Tasks 2–5), primitive swaps (Tasks 1, 3, 4), token extension (Task 1), tabular-nums (Tasks 2, 4), Available Only + Claimed-column suppression (Tasks 3, 5), behavior preservation (Task 5 keeps all handlers verbatim). Non-goals (no new primitives beyond the four named, no virtualization, no success/danger tokens) are respected — no task introduces any of them.
- **Placeholder scan:** no TBD/TODO; every step has complete code or an exact command.
- **Type consistency:** `PositionFilter` defined once in `FilterControls.tsx`, imported by `AuctionSheet.tsx`. `SortKey` defined once in `PlayerTable.tsx`, imported by `AuctionSheet.tsx`. `AuctionHeaderProps`/`FilterControlsProps`/`PlayerTableProps` field names match exactly what `AuctionSheet.tsx`'s Task 5 rewrite passes as props (`posStats`, `grandTotal`, `totalPlayerCount`, `resultCount`, `hasClaims`, `claimMap`, `nominatedSet`, `sortBy`/`sortDir`/`onSort`, `onRowClick`) — cross-checked field-by-field against each component's interface.
