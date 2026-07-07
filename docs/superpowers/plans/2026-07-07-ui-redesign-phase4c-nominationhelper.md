# UI Redesign Phase 4c: NominationHelper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `src/components/NominationHelper/NominationHelper.tsx` (824 lines, fully inline-styled) using shadcn primitives and the project's design-token system, split into four focused files.

**Architecture:** `NominationHelper.tsx` becomes a thin orchestrator (data fetch/polling, CRUD handlers, loading/error states) that renders two zone components: `WatchlistSidebar.tsx` (In Auction list + search-to-add + watchlist entries, using a new trimmed shadcn `Command` primitive) and `NominationTable.tsx` (position filter + shadcn `Table` of ranked nomination targets), with `RivalDemandBar.tsx` extracted as the per-row rival-contribution mini bar-chart.

**Tech Stack:** Next.js 16 App Router, TypeScript 5 strict, Tailwind CSS v4, shadcn/ui on Base UI (`@base-ui/react`), `cmdk` (new dependency, for the `Command` primitive), `lucide-react`.

## Global Constraints

- Verified token-class mappings (from `src/app/globals.css`): `text-foreground`=`--text-primary`=`#e8eaf0`, `text-secondary-fg`=`--text-secondary`=`#8892a4`, `text-muted-foreground`=`--text-muted`=`#4a5168`, `border-border`=`--border-default`=`#2a3048`, `border-border-subtle`=`--border-subtle`=`#1e2434`, `bg-card`=`--bg-surface`=`#141824`, `bg-background`=`--bg-base`=`#0a0d14`, `text-border`=`--border-default`=`#2a3048` (used as a text color where the original literal matched this token exactly).
- `tabular-nums` applies to every numeric cell (ranks, dollar amounts, percentages, scores) — established convention from Phases 3-4b.
- Exact-hex-match colors get promoted to the matching CSS variable instead of staying literal (established in Phase 4b): `'#40b0b0'` → `var(--pos-pick)`, `'#4f83e8'` → `var(--pos-qb)`, `'#e8a030'` → `var(--pos-wr)`. Colors with no matching token (e.g. `'#2a3a3a'`, `'#0d2020'`, `'#1a1f2e'`, `'#0a0c10'`) stay as literal Tailwind arbitrary values — do not invent new tokens for them.
- `NominationHelper`'s public props (`{ draftId: number; players: Player[] }`) must not change — it is consumed by `src/app/draft/[draftId]/nominate/page.tsx:34` as `<NominationHelper draftId={draftId} players={players} />`.
- There is no existing component test file for `NominationHelper.tsx` (only `src/__tests__/nominationScoring.test.ts` for the pure scoring logic, and `src/__tests__/api/nomination-data.test.ts` for the API route — neither is touched by this plan). Do not add a new test file as part of this reskin — this matches the Phase 4a (`BudgetPressureView`) precedent of shipping a page-level rebuild without inventing new test coverage that wasn't there before.
- `cmdk` is a new npm dependency (first one introduced by this redesign) — required for the `Command` primitive.
- The vanilla shadcn `command.tsx` output for this project's style is not usable as-is: it imports `@/app/(create)/components/icon-placeholder` (a template-only path that doesn't exist here) and pulls in `input-group` → `textarea`, neither of which this app has or needs. Task 1 below is a hand-written, trimmed version — `Command`, `CommandInput`, `CommandList`, `CommandEmpty`, `CommandItem` only — self-styled, using `lucide-react`'s `SearchIcon` directly. Do not run `npx shadcn add command`.
- Intentional behavior simplification in `WatchlistSidebar`: the original tracked a separate `showDropdown` boolean (open/close) independent of the search text, so an outside click closed the dropdown but preserved the typed query for when the input was refocused. The rebuild collapses this into one signal — the dropdown is open exactly when the search text is non-empty — and an outside click closes it by clearing the text. This means refocusing after an outside click starts from an empty query instead of resuming the prior one. This is deliberate, not an oversight — do not flag it as a bug in review.
- The original `scored` `useMemo` in `NominationHelper.tsx` had `[data]` as its dependency array despite reading `players` inside — a pre-existing exhaustive-deps bug (harmless in practice since `players` is stable after mount, but incorrect). This rewrite fixes it to `[data, players]`. This is an intentional, in-scope correctness fix — do not flag it as unexplained drift.
- Intentional pattern reuse in `NominationTable`'s position filter: the original `NominationHelper.tsx` gave every active position button the same flat `#1a1f2e` background. Task 4 instead reuses the exact active-state styling already shipped in `src/components/AuctionSheet/FilterControls.tsx:53-62` (Phase 3) — `background: c?.bg ?? POS_COLORS.PICK.bg`, i.e. position-tinted, not uniform — since both components render the identical `ToggleGroup`-based position filter and should look identical. This also means clicking the already-active filter button deselects it back to `'ALL'` (cmdk/Base UI `ToggleGroup` allows deselecting a single-select item) — matching how the position filter already behaves on the shipped `/` value sheet page today. Both are deliberate alignments to the established, shipped pattern — not oversights.
- Root wrapper pattern established in Phases 1-4b: replace inline `background`/`color`/`fontFamily` on the root div with `min-h-screen bg-background text-foreground` (no redundant `fontFamily` — the body font is already set globally in `layout.tsx`).

---

### Task 1: Trimmed `Command` primitive + `cmdk` dependency

**Files:**

- Create: `src/components/ui/command.tsx`
- Modify: `package.json` (add `cmdk` dependency via `pnpm add`)

**Interfaces:**

- Produces: `Command`, `CommandInput`, `CommandList`, `CommandEmpty`, `CommandItem` — all exported from `@/components/ui/command`. `CommandInput` accepts cmdk's native `value`/`onValueChange` props for controlled search text. `CommandItem` accepts cmdk's native `value`/`onSelect` props.

- [ ] **Step 1: Add the `cmdk` dependency**

Run: `pnpm add cmdk`

Expected: `package.json` gains a `cmdk` entry under `dependencies`; `pnpm-lock.yaml` updates.

- [ ] **Step 2: Create the trimmed Command primitive**

Create `src/components/ui/command.tsx`:

```tsx
'use client';

import * as React from 'react';
import { Command as CommandPrimitive } from 'cmdk';
import { SearchIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

function Command({ className, ...props }: React.ComponentProps<typeof CommandPrimitive>) {
  return (
    <CommandPrimitive
      data-slot="command"
      className={cn(
        'flex flex-col overflow-hidden rounded-lg bg-popover text-popover-foreground',
        className,
      )}
      {...props}
    />
  );
}

function CommandInput({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Input>) {
  return (
    <div
      data-slot="command-input-wrapper"
      className="flex items-center gap-2 border-b border-border px-2.5"
    >
      <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
      <CommandPrimitive.Input
        data-slot="command-input"
        className={cn(
          'h-8 w-full bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        {...props}
      />
    </div>
  );
}

function CommandList({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.List>) {
  return (
    <CommandPrimitive.List
      data-slot="command-list"
      className={cn('max-h-[220px] scroll-py-1 overflow-x-hidden overflow-y-auto', className)}
      {...props}
    />
  );
}

function CommandEmpty({ ...props }: React.ComponentProps<typeof CommandPrimitive.Empty>) {
  return (
    <CommandPrimitive.Empty
      data-slot="command-empty"
      className="py-4 text-center text-xs text-muted-foreground"
      {...props}
    />
  );
}

function CommandItem({ className, ...props }: React.ComponentProps<typeof CommandPrimitive.Item>) {
  return (
    <CommandPrimitive.Item
      data-slot="command-item"
      className={cn(
        'relative flex cursor-pointer items-center gap-2 rounded-sm px-2.5 py-1.5 text-sm outline-none select-none data-[selected=true]:bg-muted data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

export { Command, CommandInput, CommandList, CommandEmpty, CommandItem };
```

- [ ] **Step 3: Verify it compiles**

Run: `pnpm tsc --noEmit`
Expected: No errors related to `src/components/ui/command.tsx`. (The file isn't imported anywhere yet, so this just confirms the file itself type-checks.)

- [ ] **Step 4: Verify lint passes**

Run: `pnpm lint`
Expected: No errors or warnings for `src/components/ui/command.tsx`.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml src/components/ui/command.tsx
git commit -m "feat: add trimmed shadcn Command primitive for Phase 4c"
```

---

### Task 2: `RivalDemandBar` component

**Files:**

- Create: `src/components/NominationHelper/RivalDemandBar.tsx`

**Interfaces:**

- Consumes: `RivalContribution` type from `@/lib/nominationScoring` (`{ handle: string; contribution: number; pct: number }`).
- Produces: default export `RivalDemandBar({ rivalContributions: RivalContribution[] })` — renders the top 4 contributions as a mini bar-chart, or an em-dash if none.

- [ ] **Step 1: Create the component**

Create `src/components/NominationHelper/RivalDemandBar.tsx`:

```tsx
import type { RivalContribution } from '@/lib/nominationScoring';

interface RivalDemandBarProps {
  rivalContributions: RivalContribution[];
}

export default function RivalDemandBar({ rivalContributions }: RivalDemandBarProps) {
  const topRivals = rivalContributions.slice(0, 4);

  if (topRivals.length === 0) {
    return <span className="text-[10px] text-border">—</span>;
  }

  return (
    <div className="flex flex-col gap-[3px]">
      {topRivals.map((r) => (
        <div key={r.handle} className="flex items-center gap-1.5">
          <div className="w-[70px] overflow-hidden text-right font-mono text-[9px] text-nowrap text-ellipsis text-secondary-fg">
            {r.handle}
          </div>
          <div className="h-1 flex-1 overflow-hidden rounded-[2px] bg-[#1a1f2e]">
            <div
              className="h-full rounded-[2px]"
              style={{ width: `${r.pct}%`, background: 'var(--pos-qb)' }}
            />
          </div>
          <div className="w-7 font-mono text-[9px] text-muted-foreground tabular-nums">
            {Math.round(r.pct)}%
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm tsc --noEmit`
Expected: No errors related to `RivalDemandBar.tsx`.

- [ ] **Step 3: Verify lint passes**

Run: `pnpm lint`
Expected: No errors or warnings for `RivalDemandBar.tsx`.

- [ ] **Step 4: Commit**

```bash
git add src/components/NominationHelper/RivalDemandBar.tsx
git commit -m "feat: add RivalDemandBar component for Phase 4c"
```

---

### Task 3: `WatchlistSidebar` component

**Files:**

- Create: `src/components/NominationHelper/WatchlistSidebar.tsx`

**Interfaces:**

- Consumes: `Player` type from `@/types`; `POS_COLORS` from `@/lib/posColors`; `Command`/`CommandInput`/`CommandList`/`CommandItem` from `@/components/ui/command` (Task 1).
- Produces: default export `WatchlistSidebar` with props:

  ```ts
  interface WatchlistSidebarProps {
    players: Player[];
    nominated: string[];
    watchlist: string[];
    wonNames: Set<string>;
    onAddToWatchlist: (playerName: string) => void;
    onRemoveFromWatchlist: (playerName: string) => void;
    onUnNominate: (playerName: string) => void;
  }
  ```

  Owns its own `search` UI state internally — the parent does not need to know about it.

- [ ] **Step 1: Create the component**

Create `src/components/NominationHelper/WatchlistSidebar.tsx`:

```tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { Player } from '@/types';
import { POS_COLORS } from '@/lib/posColors';
import { Command, CommandInput, CommandList, CommandItem } from '@/components/ui/command';

interface WatchlistSidebarProps {
  players: Player[];
  nominated: string[];
  watchlist: string[];
  wonNames: Set<string>;
  onAddToWatchlist: (playerName: string) => void;
  onRemoveFromWatchlist: (playerName: string) => void;
  onUnNominate: (playerName: string) => void;
}

export default function WatchlistSidebar({
  players,
  nominated,
  watchlist,
  wonNames,
  onAddToWatchlist,
  onRemoveFromWatchlist,
  onUnNominate,
}: WatchlistSidebarProps) {
  const [search, setSearch] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const watchlistSet = useMemo(() => new Set(watchlist), [watchlist]);
  const nominatedSet = useMemo(() => new Set(nominated), [nominated]);

  const searchResults = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.toLowerCase();
    return players
      .filter(
        (p) =>
          !wonNames.has(p.player) && !watchlistSet.has(p.player) && !nominatedSet.has(p.player),
      )
      .filter((p) => p.player.toLowerCase().includes(q) || p.team.toLowerCase().includes(q))
      .slice(0, 8);
  }, [search, players, wonNames, watchlistSet, nominatedSet]);

  return (
    <div className="flex w-60 min-w-60 flex-col gap-3 border-r border-border-subtle bg-card px-3 py-4">
      {/* In Auction */}
      <div>
        <div
          className="font-label mb-1.5 text-[10px] tracking-[2px] uppercase"
          style={{ color: 'var(--pos-pick)' }}
        >
          In Auction
        </div>
        <div className="flex flex-col gap-1.5">
          {nominated.length === 0 ? (
            <div className="text-[11px] leading-relaxed text-[#2a3a3a]">
              No players currently nominated
            </div>
          ) : (
            nominated.map((name) => {
              const p = players.find((pl) => pl.player === name);
              return (
                <div
                  key={name}
                  className="flex items-center gap-1.5 rounded-[5px] bg-[#0d2020] px-2 py-1.5"
                  style={{ borderLeft: '3px solid var(--pos-pick)' }}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-semibold text-foreground">{name}</div>
                    {p && (
                      <div className="font-mono text-[10px] text-muted-foreground">
                        {p.pos} · ${p.budget}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => onUnNominate(name)}
                    title="Remove from in auction"
                    className="shrink-0 text-[#2a5a5a] transition-colors hover:text-[var(--pos-pick)]"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="mt-1 border-t border-border-subtle" />

      <div className="font-label text-[10px] tracking-[2px] text-muted-foreground uppercase">
        My Watchlist
      </div>

      {/* Search-to-add */}
      <div ref={wrapperRef} className="relative">
        <Command shouldFilter={false} className="rounded-[5px] border border-border bg-[#1a1f2e]">
          <CommandInput
            value={search}
            onValueChange={setSearch}
            placeholder="Add player I want..."
          />
          {search.trim() !== '' && searchResults.length > 0 && (
            <CommandList className="absolute top-full right-0 left-0 z-10 mt-1 rounded-[5px] border border-border bg-[#1a1f2e]">
              {searchResults.map((p) => (
                <CommandItem
                  key={p.player}
                  value={p.player}
                  onSelect={() => {
                    onAddToWatchlist(p.player);
                    setSearch('');
                  }}
                >
                  <span className="font-semibold text-foreground">{p.player}</span>
                  <span className="ml-1.5 font-mono text-[10px] text-muted-foreground">
                    {p.pos} · ${p.budget}
                  </span>
                </CommandItem>
              ))}
            </CommandList>
          )}
        </Command>
      </div>

      {/* Watchlist entries */}
      <div className="flex flex-col gap-1.5 overflow-y-auto">
        {watchlist.length === 0 ? (
          <div className="text-[11px] leading-relaxed text-muted-foreground">
            No players marked — add players you still want to win
          </div>
        ) : (
          watchlist.map((name) => {
            const p = players.find((pl) => pl.player === name);
            const accent = p ? POS_COLORS[p.pos].accent : '#4a5168';
            return (
              <div
                key={name}
                className="flex items-center gap-1.5 rounded-[5px] bg-[#1a1f2e] px-2 py-1.5"
                style={{ borderLeft: `3px solid ${accent}` }}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-semibold text-foreground">{name}</div>
                  {p && (
                    <div className="font-mono text-[10px] text-muted-foreground">
                      {p.pos} · ${p.budget}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => onRemoveFromWatchlist(name)}
                  title="Remove from watchlist"
                  className="shrink-0 text-muted-foreground transition-colors hover:text-destructive"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm tsc --noEmit`
Expected: No errors related to `WatchlistSidebar.tsx`. (Not yet wired into `NominationHelper.tsx` — that's fine, it's an unused-but-valid module until Task 5.)

- [ ] **Step 3: Verify lint passes**

Run: `pnpm lint`
Expected: No errors or warnings for `WatchlistSidebar.tsx`.

- [ ] **Step 4: Commit**

```bash
git add src/components/NominationHelper/WatchlistSidebar.tsx
git commit -m "feat: add WatchlistSidebar component for Phase 4c"
```

---

### Task 4: `NominationTable` component

**Files:**

- Create: `src/components/NominationHelper/NominationTable.tsx`

**Interfaces:**

- Consumes: `ScoredPlayer` type from `@/lib/nominationScoring`; `Position` type from `@/types`; `POS_COLORS` from `@/lib/posColors`; `cn` from `@/lib/utils`; shadcn `Button`, `ToggleGroup`/`ToggleGroupItem`, `Table`/`TableHeader`/`TableBody`/`TableRow`/`TableHead`/`TableCell`; `RivalDemandBar` from Task 2 (`./RivalDemandBar`).
- Produces: default export `NominationTable` with props:

  ```ts
  interface NominationTableProps {
    scored: ScoredPlayer[];
    posFilter: 'ALL' | Position;
    onPosFilterChange: (pos: 'ALL' | Position) => void;
    hasAuctionData: boolean;
    onWatch: (playerName: string) => void;
    onNominate: (playerName: string) => void;
  }
  ```

  Owns the position-filter-driven row filtering internally (parent only owns the `posFilter` state itself, for the controlled `ToggleGroup`).

- [ ] **Step 1: Create the component**

Create `src/components/NominationHelper/NominationTable.tsx`:

```tsx
'use client';

import { useMemo } from 'react';
import type { Position } from '@/types';
import type { ScoredPlayer } from '@/lib/nominationScoring';
import { POS_COLORS } from '@/lib/posColors';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import RivalDemandBar from './RivalDemandBar';

const POSITIONS: Array<'ALL' | Position> = ['ALL', 'QB', 'RB', 'WR', 'TE', 'PICK', 'PKG'];

const COLUMNS = ['#', 'Player', 'Target / Ceil', 'Score', 'Rival Demand', '', ''] as const;

interface NominationTableProps {
  scored: ScoredPlayer[];
  posFilter: 'ALL' | Position;
  onPosFilterChange: (pos: 'ALL' | Position) => void;
  hasAuctionData: boolean;
  onWatch: (playerName: string) => void;
  onNominate: (playerName: string) => void;
}

export default function NominationTable({
  scored,
  posFilter,
  onPosFilterChange,
  hasAuctionData,
  onWatch,
  onNominate,
}: NominationTableProps) {
  const filtered = useMemo(
    () => (posFilter === 'ALL' ? scored : scored.filter((s) => s.player.pos === posFilter)),
    [scored, posFilter],
  );

  if (!hasAuctionData) {
    return (
      <div className="flex h-[300px] items-center justify-center text-[13px] text-muted-foreground">
        No auction data yet — start logging bids to see nomination suggestions.
      </div>
    );
  }

  return (
    <>
      <div className="mb-3.5 flex flex-wrap items-center gap-[3px]">
        <ToggleGroup
          value={[posFilter]}
          onValueChange={(vals) =>
            onPosFilterChange((vals[0] as ('ALL' | Position) | undefined) ?? 'ALL')
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
                        borderColor: c?.accent ?? 'var(--pos-pick)',
                        background: c?.bg ?? POS_COLORS.PICK.bg,
                        color: c?.accent ?? 'var(--pos-pick)',
                      }
                    : undefined
                }
              >
                {pos}
              </ToggleGroupItem>
            );
          })}
        </ToggleGroup>
        <div className="ml-auto self-center text-[11px] text-muted-foreground">
          {filtered.length} targets
        </div>
      </div>

      <Table className="mt-1.5">
        <TableHeader>
          <TableRow className="border-border hover:bg-transparent">
            {COLUMNS.map((col, i) => (
              <TableHead
                key={i}
                className="font-label border-none py-2 text-[10px] font-semibold tracking-wide whitespace-nowrap text-muted-foreground uppercase"
                style={{
                  textAlign: col === 'Player' || col === 'Rival Demand' ? 'left' : 'center',
                }}
              >
                {col}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((s, i) => {
            const { player, nominationScore, rivalContributions } = s;
            const c = POS_COLORS[player.pos];
            const isRookie = player.notes.toLowerCase().includes('rookie');
            return (
              <TableRow
                key={player.player}
                className={cn(
                  'border-b-[#141824] hover:bg-card',
                  i % 2 !== 0 ? 'bg-[#0a0c10]' : undefined,
                )}
                style={{ borderLeft: `3px solid ${c.accent}` }}
              >
                <TableCell className="text-center font-mono text-[11px] text-muted-foreground tabular-nums">
                  {i + 1}
                </TableCell>
                <TableCell className="text-left">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[13px] font-semibold text-foreground">
                      {player.player}
                    </span>
                    <span
                      className="font-label inline-block rounded text-[9px] font-bold tracking-wide"
                      style={{ background: c.badge, color: c.badgeText, padding: '2px 5px' }}
                    >
                      {player.pos}
                    </span>
                    {isRookie && (
                      <span
                        className="rounded text-[8px] font-bold tracking-wide uppercase"
                        style={{
                          background: '#3a2800',
                          color: 'var(--pos-wr)',
                          padding: '1px 4px',
                        }}
                      >
                        R
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-center">
                  <span
                    className="font-mono text-[13px] font-bold tabular-nums"
                    style={{ color: c.accent }}
                  >
                    ${player.budget}
                  </span>
                  <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
                    {' '}
                    / ${player.ceiling}
                  </span>
                </TableCell>
                <TableCell className="text-center">
                  <span
                    className="font-mono text-[13px] font-bold tabular-nums"
                    style={{ color: 'var(--pos-wr)' }}
                  >
                    {Math.round(nominationScore).toLocaleString()}
                  </span>
                </TableCell>
                <TableCell className="min-w-[200px] text-left">
                  <RivalDemandBar rivalContributions={rivalContributions} />
                </TableCell>
                <TableCell className="text-center">
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => onWatch(player.player)}
                    className="font-label tracking-wide hover:border-[var(--pos-rb)]"
                    style={{ color: 'var(--pos-rb)' }}
                  >
                    Watch
                  </Button>
                </TableCell>
                <TableCell className="text-center">
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => onNominate(player.player)}
                    className="font-label tracking-wide hover:border-[var(--pos-pick)]"
                    style={{ color: 'var(--pos-pick)' }}
                  >
                    Nom
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
          {filtered.length === 0 && (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={7} className="p-10 text-center text-xs text-muted-foreground">
                No nomination targets found.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm tsc --noEmit`
Expected: No errors related to `NominationTable.tsx`.

- [ ] **Step 3: Verify lint passes**

Run: `pnpm lint`
Expected: No errors or warnings for `NominationTable.tsx`.

- [ ] **Step 4: Commit**

```bash
git add src/components/NominationHelper/NominationTable.tsx
git commit -m "feat: add NominationTable component for Phase 4c"
```

---

### Task 5: Rewrite `NominationHelper.tsx` as orchestrator

**Files:**

- Modify: `src/components/NominationHelper/NominationHelper.tsx` (full rewrite, replacing all 824 lines)

**Interfaces:**

- Consumes: `WatchlistSidebar` (Task 3), `NominationTable` (Task 4), `computeNominationScores`/`ScoredPlayer` from `@/lib/nominationScoring`, `Player`/`Position`/`TeamStats`/`AuctionResultEntry` from `@/types`.
- Produces: default export `NominationHelper({ draftId: number; players: Player[] })` — unchanged public contract, still consumed by `src/app/draft/[draftId]/nominate/page.tsx`.

- [ ] **Step 1: Replace the file contents**

Replace the entire contents of `src/components/NominationHelper/NominationHelper.tsx` with:

```tsx
'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { Player, Position, TeamStats, AuctionResultEntry } from '@/types';
import { computeNominationScores, type ScoredPlayer } from '@/lib/nominationScoring';
import WatchlistSidebar from './WatchlistSidebar';
import NominationTable from './NominationTable';

interface NomData {
  teamStats: TeamStats[];
  auctionResults: AuctionResultEntry[];
  watchlist: string[];
  nominated: string[];
  ownerHandle: string | null;
}

interface NominationHelperProps {
  draftId: number;
  players: Player[];
}

export default function NominationHelper({ draftId, players }: NominationHelperProps) {
  const router = useRouter();
  const [data, setData] = useState<NomData | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [posFilter, setPosFilter] = useState<'ALL' | Position>('ALL');

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch(`/api/draft/${draftId}/nomination-data`);
        if (res.status === 401) {
          router.replace('/sign-in');
          return;
        }
        if (res.status === 404) {
          setDraftError('No draft configured');
          return;
        }
        if (res.ok) setData(await res.json());
      } catch {
        // silent — show stale data
      }
    }
    void fetchData();
    const interval = setInterval(() => void fetchData(), 30_000);
    return () => clearInterval(interval);
  }, [router, draftId]);

  const wonNames = useMemo(() => new Set(data?.auctionResults.map((r) => r.player) ?? []), [data]);

  const scored = useMemo<ScoredPlayer[]>(() => {
    if (!data) return [];
    return computeNominationScores(
      players,
      data.teamStats,
      data.auctionResults,
      data.watchlist,
      data.nominated,
      // null ownerHandle → no owner team excluded from rival demand scoring (correct for unclaimed draft)
      data.ownerHandle ?? '',
    );
  }, [data, players]);

  const addToWatchlist = async (playerName: string) => {
    const snapshot = data;
    setData((prev) => (prev ? { ...prev, watchlist: [...prev.watchlist, playerName] } : prev));
    const res = await fetch(`/api/draft/${draftId}/watchlist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerName }),
    });
    if (!res.ok) {
      if (res.status === 401) {
        router.replace('/sign-in');
        return;
      }
      setData(snapshot);
    }
  };

  const removeFromWatchlist = async (playerName: string) => {
    const snapshot = data;
    setData((prev) =>
      prev ? { ...prev, watchlist: prev.watchlist.filter((n) => n !== playerName) } : prev,
    );
    const res = await fetch(`/api/draft/${draftId}/watchlist`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerName }),
    });
    if (!res.ok) {
      if (res.status === 401) {
        router.replace('/sign-in');
        return;
      }
      setData(snapshot);
    }
  };

  const nominatePlayer = async (playerName: string) => {
    const snapshot = data;
    setData((prev) => (prev ? { ...prev, nominated: [...prev.nominated, playerName] } : prev));
    const res = await fetch(`/api/draft/${draftId}/nominated`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerName }),
    });
    if (!res.ok) {
      if (res.status === 401) {
        router.replace('/sign-in');
        return;
      }
      setData(snapshot);
    }
  };

  const unNominatePlayer = async (playerName: string) => {
    const snapshot = data;
    setData((prev) =>
      prev ? { ...prev, nominated: prev.nominated.filter((n) => n !== playerName) } : prev,
    );
    const res = await fetch(`/api/draft/${draftId}/nominated`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerName }),
    });
    if (!res.ok) {
      if (res.status === 401) {
        router.replace('/sign-in');
        return;
      }
      setData(snapshot);
    }
  };

  if (!data) {
    return (
      <div className="flex h-[400px] items-center justify-center text-muted-foreground">
        {draftError ?? 'Loading nomination data...'}
      </div>
    );
  }

  const hasAuctionData = data.auctionResults.length > 0;

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <WatchlistSidebar
        players={players}
        nominated={data.nominated}
        watchlist={data.watchlist}
        wonNames={wonNames}
        onAddToWatchlist={addToWatchlist}
        onRemoveFromWatchlist={removeFromWatchlist}
        onUnNominate={unNominatePlayer}
      />

      <div className="flex-1 overflow-x-auto px-5 pt-4 pb-10">
        <div className="mb-3.5">
          <div className="font-label mb-0.5 text-[10px] tracking-[3px] text-muted-foreground uppercase">
            Nomination Helper
          </div>
          <div className="text-xs text-muted-foreground">
            Players ranked by how much nominating them will drain rival budgets
          </div>
        </div>

        <NominationTable
          scored={scored}
          posFilter={posFilter}
          onPosFilterChange={setPosFilter}
          hasAuctionData={hasAuctionData}
          onWatch={addToWatchlist}
          onNominate={nominatePlayer}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm tsc --noEmit`
Expected: No errors anywhere in the project.

- [ ] **Step 3: Verify lint passes**

Run: `pnpm lint`
Expected: No errors or warnings anywhere in the project.

- [ ] **Step 4: Verify the props contract with the consuming page**

Run: `grep -n "NominationHelper" src/app/draft/\[draftId\]/nominate/page.tsx`
Expected: `<NominationHelper draftId={draftId} players={players} />` — unchanged, still compiles against the new `NominationHelperProps` shape.

- [ ] **Step 5: Run the full test suite**

Run: `pnpm test`
Expected: All tests pass, including `src/__tests__/nominationScoring.test.ts` and `src/__tests__/api/nomination-data.test.ts` (both untouched by this plan — this run confirms no regression).

- [ ] **Step 6: Commit**

```bash
git add src/components/NominationHelper/NominationHelper.tsx
git commit -m "refactor: rewrite NominationHelper as orchestrator over WatchlistSidebar and NominationTable (Phase 4c)"
```

---

## Manual QA (not automated — flag in PR description)

This phase touches the most interactive surface of the redesign so far (search-to-add autocomplete, two CRUD-driven lists). Cole should verify in-browser after merge:

- Typing in the watchlist search box shows matching players, excluding already-won/watchlisted/nominated ones, capped at 8 results
- Selecting a search result adds it to the watchlist and clears the search box
- Clicking outside the search box while a query is active closes the dropdown
- Removing a watchlist entry or an in-auction entry works and persists (survives the 30s poll refresh)
- Position filter buttons and Watch/Nom buttons still work identically to before the rebuild
