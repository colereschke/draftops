# UI Redesign — Phase 4b: RosterTracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-skin `RosterTracker` (roadmap #6, Phase 4b) with shadcn `Table` and the established token system, splitting the 410-line monolith into a 3-file orchestrator/table/detail structure.

**Architecture:** `RosterTracker.tsx` (state: `expanded`/`sortBy`/`sortDir`, sort/toggle handlers, static header) composes `RosterTable.tsx` (shadcn `Table` shell, sortable column headers, one row per team + an optional expanded detail row) which composes `TeamRosterDetail.tsx` (pure presentational list of a team's won players). No new shadcn primitives — `Table` is already installed from Phase 3.

**Tech Stack:** Next.js 16 App Router, TypeScript 5 strict, Tailwind CSS v4, shadcn/ui `Table` (Base UI), `lucide-react` icons, Jest + React Testing Library.

## Global Constraints

- File split (confirmed): `RosterTracker.tsx` (orchestrator) + `RosterTable.tsx` (table shell, sort headers, rows) + `TeamRosterDetail.tsx` (expanded per-team roster list) — no other new files, no new shadcn primitives.
- Rows are clickable (row click toggles expand) — shadcn `TableRow`'s default `hover:bg-muted/50` gets overridden to `hover:bg-card` (matches `PlayerTable`'s clickable-row treatment from Phase 3), **not** neutralized to `hover:bg-transparent` like `BudgetPressureView`'s static rows.
- Buying-power color scale aligned to `BudgetPressureView`'s exact literal-hex thresholds (financial-status colors stay literal, per Phase 3/4a precedent): `bp > 150` → `'#4caf6e'`, `bp >= 50` → `'#e8a030'`, else `'#e05050'`.
- Owner-row identity highlight aligned to `BudgetPressureView`/Phase 4a exactly: background `'#141e2e'`, `borderLeft: 3px solid #4f83e8'`. Non-owner rows: `borderLeft: '3px solid var(--border)'`.
- Delta (±$) color in `TeamRosterDetail` uses `var(--age-old)` / `var(--age-young)` tokens, not literal hex — this is the same "price vs. target" concept as `PlayerTable`'s claimed-diff cell (Phase 3), which already uses these exact tokens.
- PKG badge text color becomes `var(--pos-pkg)` (exact match to the existing literal `#f0c040`) — badge background stays the literal `'#2a2010'` already used here (component-local, pre-existing; not unified with other PKG-badge backgrounds elsewhere in the app, which is out of scope).
- Sort icons: `lucide-react` `ArrowUp`/`ArrowDown`/`ArrowUpDown` at `size-3.5`, active column colored `var(--pos-wr)`, inactive `text-muted-foreground` — exact copy of `PlayerTable`'s `SortIcon` pattern.
- Expand chevron: `lucide-react` `ChevronRight` at `size-3.5`, rotated via a `cn()`-conditional `rotate-90` class + `transition-transform duration-150`, replacing the unicode `▶` + inline `transform` style.
- `tabular-nums` applied to every numeric cell: roster count, PKG count, spent, remaining, buying power (in `RosterTable`), and price + delta (in `TeamRosterDetail`).
- Token-class mappings (verified against `globals.css`): `text-foreground` = `--text-primary` `#e8eaf0`; `text-secondary-fg` = `--text-secondary` `#8892a4`; `text-muted-foreground` = `--text-muted` `#4a5168`; `border-border` = `--border-default` `#2a3048`; `bg-card` = `--bg-surface` `#141824`.
- No behavior changes: sort logic, expand/collapse logic, and every assertion in `src/__tests__/RosterTracker.test.tsx` must keep passing **unmodified** — zero test-file edits expected (every assertion below was traced against the new markup before writing this plan).

---

### Task 1: `TeamRosterDetail.tsx` — expanded per-team roster list

**Files:**

- Create: `src/components/RosterTracker/TeamRosterDetail.tsx`

**Interfaces:**

- Consumes: `RosterEntry` type from `@/types` (`{ id, player, position, nflTeam, price, sfRank, teamId, teamHandle, delta }`), `POS_COLORS` from `@/lib/posColors`.
- Produces: `export default function TeamRosterDetail({ results }: { results: RosterEntry[] })` — consumed by `RosterTable.tsx` in Task 2.

- [ ] **Step 1: Write the file**

```tsx
import type { RosterEntry, Position } from '@/types';
import { POS_COLORS } from '@/lib/posColors';

interface TeamRosterDetailProps {
  results: RosterEntry[];
}

export default function TeamRosterDetail({ results }: TeamRosterDetailProps) {
  if (results.length === 0) {
    return <div className="text-xs text-muted-foreground italic">No players won yet.</div>;
  }

  return (
    <div className="flex flex-col gap-0.5">
      {results.map((result) => {
        const pos = result.position as Position;
        const c = POS_COLORS[pos] ?? POS_COLORS.PICK;
        const { delta } = result;
        return (
          <div
            key={result.id}
            className="flex items-center gap-2.5 rounded-r bg-[#0a0d14] px-2 py-[5px]"
            style={{ borderLeft: `3px solid ${c.accent}` }}
          >
            <span
              className="font-label min-w-8 rounded text-center text-[9px] font-bold tracking-wide"
              style={{ background: c.badge, color: c.badgeText, padding: '2px 6px' }}
            >
              {result.position}
            </span>
            <span className="flex-1 text-[13px] font-semibold text-foreground">
              {result.player}
            </span>
            <span className="min-w-[30px] text-[11px] text-muted-foreground">{result.nflTeam}</span>
            <span
              className="min-w-11 text-right font-mono text-[13px] font-bold tabular-nums"
              style={{ color: c.accent }}
            >
              ${result.price}
            </span>
            {delta !== null && delta !== 0 && (
              <span
                className="min-w-11 text-right font-mono text-[11px] tabular-nums"
                style={{ color: delta > 0 ? 'var(--age-old)' : 'var(--age-young)' }}
              >
                {delta > 0 ? `+$${delta}` : `-$${Math.abs(delta)}`}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Type-check and confirm existing tests are unaffected**

Run: `pnpm tsc --noEmit`
Expected: no errors (this file isn't imported anywhere yet, so it's dead code at this point — that's expected for this task).

Run: `pnpm test -- RosterTracker.test.tsx`
Expected: PASS, same as before this task (old `RosterTracker.tsx` is still in place, untouched).

- [ ] **Step 3: Commit**

```bash
git add src/components/RosterTracker/TeamRosterDetail.tsx
git commit -m "feat: add TeamRosterDetail component for Phase 4b"
```

---

### Task 2: `RosterTable.tsx` — shadcn Table shell, sortable headers, rows

**Files:**

- Create: `src/components/RosterTracker/RosterTable.tsx`

**Interfaces:**

- Consumes: `TeamWithRoster` type from `@/types`; `ROSTER_SIZE` from `@/lib/teams`; `cn` from `@/lib/utils`; `Table`/`TableHeader`/`TableBody`/`TableRow`/`TableHead`/`TableCell` from `@/components/ui/table`; `TeamRosterDetail` from `./TeamRosterDetail` (Task 1).
- Produces: `export type SortKey = 'buyingPower' | 'spent' | 'remaining' | 'rosterCount'` and `export default function RosterTable(props: RosterTableProps)` where:

```typescript
interface RosterTableProps {
  teams: TeamWithRoster[]; // already sorted by the caller
  expanded: Set<number>;
  onToggle: (id: number) => void;
  sortBy: SortKey;
  sortDir: 'asc' | 'desc';
  onSort: (col: SortKey) => void;
  ownerHandle: string | null;
}
```

Consumed by `RosterTracker.tsx` in Task 3.

- [ ] **Step 1: Write the file**

```tsx
'use client';

import { ArrowUp, ArrowDown, ArrowUpDown, ChevronRight } from 'lucide-react';
import type { TeamWithRoster } from '@/types';
import { ROSTER_SIZE } from '@/lib/teams';
import { cn } from '@/lib/utils';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import TeamRosterDetail from './TeamRosterDetail';

export type SortKey = 'buyingPower' | 'spent' | 'remaining' | 'rosterCount';

function buyingPowerColor(bp: number): string {
  if (bp > 150) return '#4caf6e';
  if (bp >= 50) return '#e8a030';
  return '#e05050';
}

interface SortIconProps {
  col: SortKey;
  sortBy: SortKey;
  sortDir: 'asc' | 'desc';
}

function SortIcon({ col, sortBy, sortDir }: SortIconProps) {
  if (sortBy !== col) {
    return <ArrowUpDown className="ml-1 inline size-3.5 text-muted-foreground" />;
  }
  return sortDir === 'asc' ? (
    <ArrowUp className="ml-1 inline size-3.5" style={{ color: 'var(--pos-wr)' }} />
  ) : (
    <ArrowDown className="ml-1 inline size-3.5" style={{ color: 'var(--pos-wr)' }} />
  );
}

interface RosterTableProps {
  teams: TeamWithRoster[];
  expanded: Set<number>;
  onToggle: (id: number) => void;
  sortBy: SortKey;
  sortDir: 'asc' | 'desc';
  onSort: (col: SortKey) => void;
  ownerHandle: string | null;
}

const SORT_COLUMNS: Array<{ key: SortKey; label: string }> = [
  { key: 'spent', label: 'Spent' },
  { key: 'remaining', label: 'Remaining' },
  { key: 'buyingPower', label: 'Buying Power' },
];

export default function RosterTable({
  teams,
  expanded,
  onToggle,
  sortBy,
  sortDir,
  onSort,
  ownerHandle,
}: RosterTableProps) {
  return (
    <div className="overflow-x-auto px-5 pb-10">
      <Table className="mt-1.5">
        <TableHeader>
          <TableRow className="border-border hover:bg-transparent">
            <TableHead className="font-label border-none py-2 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
              Team
            </TableHead>
            <TableHead
              onClick={() => onSort('rosterCount')}
              className="font-label cursor-pointer border-none py-2 text-center text-[10px] font-semibold tracking-wide whitespace-nowrap uppercase select-none text-muted-foreground"
              style={{ color: sortBy === 'rosterCount' ? 'var(--pos-wr)' : undefined }}
            >
              Roster
              <SortIcon col="rosterCount" sortBy={sortBy} sortDir={sortDir} />
            </TableHead>
            <TableHead className="font-label border-none py-2 text-center text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
              PKG
            </TableHead>
            {SORT_COLUMNS.map((col) => (
              <TableHead
                key={col.key}
                onClick={() => onSort(col.key)}
                className="font-label cursor-pointer border-none py-2 text-center text-[10px] font-semibold tracking-wide whitespace-nowrap uppercase select-none text-muted-foreground"
                style={{ color: sortBy === col.key ? 'var(--pos-wr)' : undefined }}
              >
                {col.label}
                <SortIcon col={col.key} sortBy={sortBy} sortDir={sortDir} />
              </TableHead>
            ))}
            <TableHead className="w-8 border-none py-2" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {teams.flatMap((team, i) => {
            const isExpanded = expanded.has(team.id);
            const isOwner = ownerHandle !== null && team.handle === ownerHandle;

            const rows = [
              <TableRow
                key={team.id}
                onClick={() => onToggle(team.id)}
                className={cn(
                  'cursor-pointer hover:bg-card',
                  isExpanded ? 'border-b-0' : 'border-b-[#141824]',
                  !isOwner && i % 2 !== 0 ? 'bg-[#0a0c10]' : undefined,
                )}
                style={{
                  background: isOwner ? '#141e2e' : undefined,
                  borderLeft: `3px solid ${isOwner ? '#4f83e8' : 'var(--border)'}`,
                }}
              >
                <TableCell className="text-left">
                  <span
                    className={cn(
                      'text-[13px]',
                      isOwner ? 'font-bold' : 'font-normal text-foreground',
                    )}
                    style={isOwner ? { color: '#4f83e8' } : undefined}
                  >
                    {team.handle}
                  </span>
                  {team.displayName && (
                    <span className="ml-1.5 text-[11px] text-muted-foreground">
                      {team.displayName}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-center font-mono text-xs text-secondary-fg tabular-nums">
                  {team.rosterCount} / {ROSTER_SIZE}
                </TableCell>
                <TableCell className="text-center">
                  {team.pkgCount > 0 && (
                    <span
                      className="rounded font-mono text-[11px] font-bold"
                      style={{ color: 'var(--pos-pkg)', background: '#2a2010', padding: '2px 6px' }}
                    >
                      {team.pkgCount}×
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-center font-mono text-[13px] text-secondary-fg tabular-nums">
                  ${team.spent}
                </TableCell>
                <TableCell className="text-center font-mono text-[13px] text-foreground tabular-nums">
                  ${team.remaining}
                </TableCell>
                <TableCell
                  className="text-center font-mono text-[13px] font-bold tabular-nums"
                  style={{ color: buyingPowerColor(team.buyingPower) }}
                >
                  ${team.buyingPower}
                </TableCell>
                <TableCell className="text-right">
                  <ChevronRight
                    className={cn(
                      'ml-auto inline size-3.5 text-muted-foreground transition-transform duration-150',
                      isExpanded && 'rotate-90',
                    )}
                  />
                </TableCell>
              </TableRow>,
            ];

            if (isExpanded) {
              rows.push(
                <TableRow key={`${team.id}-roster`} className="hover:bg-transparent">
                  <TableCell colSpan={7} className="border-b-2 border-b-[#2a3048] p-0">
                    <div className="bg-[#080a10] px-4 pt-2.5 pb-3.5">
                      <TeamRosterDetail results={team.results} />
                    </div>
                  </TableCell>
                </TableRow>,
              );
            }

            return rows;
          })}
        </TableBody>
      </Table>
    </div>
  );
}
```

- [ ] **Step 2: Type-check and confirm existing tests are unaffected**

Run: `pnpm tsc --noEmit`
Expected: no errors (this file isn't imported anywhere yet).

Run: `pnpm test -- RosterTracker.test.tsx`
Expected: PASS, same as before this task (old `RosterTracker.tsx` is still in place, untouched).

- [ ] **Step 3: Commit**

```bash
git add src/components/RosterTracker/RosterTable.tsx
git commit -m "feat: add RosterTable component for Phase 4b"
```

---

### Task 3: Rewrite `RosterTracker.tsx` as the orchestrator

**Files:**

- Modify: `src/components/RosterTracker/RosterTracker.tsx` (full rewrite)

**Interfaces:**

- Consumes: `RosterTable` + `SortKey` from `./RosterTable` (Task 2); `TeamWithRoster` from `@/types`; `LEAGUE_TEAMS`/`ROSTER_SIZE` from `@/lib/teams`.
- Produces: `export default function RosterTracker({ teams, ownerHandle }: { teams: TeamWithRoster[]; ownerHandle: string | null })` — same public props contract as today, consumed unchanged by `src/app/draft/[draftId]/teams/page.tsx` via `src/components/RosterTracker/index.ts`'s existing `export { default } from './RosterTracker';` (no changes needed to `index.ts` or the page).

- [ ] **Step 1: Replace the file contents**

```tsx
'use client';

import { useState, useMemo, useCallback } from 'react';
import type { TeamWithRoster } from '@/types';
import { LEAGUE_TEAMS, ROSTER_SIZE } from '@/lib/teams';
import RosterTable, { type SortKey } from './RosterTable';

interface RosterTrackerProps {
  teams: TeamWithRoster[];
  ownerHandle: string | null;
}

export default function RosterTracker({ teams, ownerHandle }: RosterTrackerProps) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [sortBy, setSortBy] = useState<SortKey>('buyingPower');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const toggle = useCallback((id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSort = (col: SortKey) => {
    if (sortBy === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(col);
      setSortDir('desc');
    }
  };

  const sorted = useMemo(
    () =>
      [...teams].sort((a, b) => {
        const aV = a[sortBy];
        const bV = b[sortBy];
        return sortDir === 'desc' ? bV - aV : aV - bV;
      }),
    [teams, sortBy, sortDir],
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="border-b border-border bg-card px-5 pt-[18px] pb-3.5">
        <div className="font-label mb-1 text-[10px] tracking-[3px] text-muted-foreground uppercase">
          {LEAGUE_TEAMS.length}-Team · Superflex · TE Premium · $1,000 Budget · {ROSTER_SIZE}-Man
          Rosters
        </div>
        <h1 className="font-label m-0 mb-0.5 text-xl font-bold tracking-tight text-white">
          Team Rosters
        </h1>
        <div className="text-[11px] text-muted-foreground">
          Click any row to expand · Multiple rows can be open simultaneously
        </div>
      </div>

      <RosterTable
        teams={sorted}
        expanded={expanded}
        onToggle={toggle}
        sortBy={sortBy}
        sortDir={sortDir}
        onSort={handleSort}
        ownerHandle={ownerHandle}
      />
    </div>
  );
}
```

- [ ] **Step 2: Run the full existing test suite**

Run: `pnpm test -- RosterTracker.test.tsx`
Expected: PASS — all 8 existing tests pass unmodified against the new markup (`.closest('tr')` still resolves to a real `<tr>` since shadcn `TableRow` renders one; all `getByText`/`queryByText` assertions target visible text unaffected by className changes).

Run: `pnpm tsc --noEmit && pnpm lint`
Expected: no errors.

Run: `pnpm test`
Expected: full suite passes (221 pre-existing tests + this file, no regressions elsewhere).

- [ ] **Step 3: Commit**

```bash
git add src/components/RosterTracker/RosterTracker.tsx
git commit -m "refactor: rewrite RosterTracker as orchestrator over RosterTable (Phase 4b)"
```

---

## Self-Review Notes

**Spec coverage:** All confirmed design decisions are implemented — 3-way file split (Task 1/2/3), buying-power scale aligned to BudgetPressureView's literal thresholds, owner-row bg/border aligned to `#141e2e`/`#4f83e8`, delta color switched to `var(--age-old)`/`var(--age-young)` tokens, PKG badge color switched to `var(--pos-pkg)`, lucide sort icons + `ChevronRight` expand icon, `tabular-nums` on every numeric cell.

**Placeholder scan:** No TBD/TODO markers; every step has complete, runnable code.

**Type consistency:** `SortKey` is defined once in `RosterTable.tsx` and imported by `RosterTracker.tsx` — no duplicate/divergent definition. `RosterTableProps`, `TeamRosterDetailProps`, and `RosterTrackerProps` field names match exactly across the three files (`teams`, `expanded`, `onToggle`, `sortBy`, `sortDir`, `onSort`, `ownerHandle`, `results`).

**Test-safety check:** Traced every assertion in `src/__tests__/RosterTracker.test.tsx` against the new markup — `getByText('coreschke').closest('tr')` still finds the real `<tr>` shadcn's `TableRow` renders; `getByText`/`queryByText` for player names, `'1×'`/`'0×'` PKG badges, and `'No players won yet.'` all target unchanged visible text. Zero test-file edits required.
