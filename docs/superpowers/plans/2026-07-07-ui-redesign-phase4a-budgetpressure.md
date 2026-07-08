# UI Redesign Phase 4a: BudgetPressure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-skin `BudgetPressureView.tsx` and `BudgetRefresher.tsx` with shadcn `Table`/`Button` primitives and the Phase 3 design tokens, with zero behavior change.

**Architecture:** Both files stay as-is structurally (no split — both are under CLAUDE.md's ~300-line threshold and each already has one clear responsibility). `BudgetPressureView` swaps its native `<table>` for shadcn's `Table` family; `BudgetRefresher` swaps its hand-styled `<button>` for shadcn `Button`. No new props, no new state, no new features.

**Tech Stack:** Next.js 16, TypeScript 5 strict, Tailwind CSS 4, shadcn/ui on Base UI (`Table`, `Button` — both already installed from Phases 1 and 3, nothing new to add via CLI).

## Global Constraints

- Financial-status colors (`buyingPowerColor()`: green `#4caf6e` / amber `#e8a030` / red `#e05050`) and the owner-row identity highlight (`#141e2e` background, `#4f83e8` left border) stay as literal inline `style` — same rationale as Phase 3's Budget/Spent/Remaining tracker: no success/danger token pair exists in the design system and this phase doesn't introduce one.
- Token mapping confirmed from `src/app/globals.css`: `--text-secondary: #8892a4` → class `text-secondary-fg`; `--text-muted: #4a5168` → class `text-muted-foreground`; `--text-primary: #e8eaf0` → class `text-foreground`; `--border-default: #2a3048` → class `border-border` / `var(--border)`; `--bg-elevated: #1a1f2e` → class `bg-muted`.
- Apply `tabular-nums` to every numeric table cell (Spent, Remaining, Roster, Buying Power) — established in Phase 3, not applied yet on this page.
- No new shadcn primitives beyond `Table` (`src/components/ui/table.tsx`) and `Button` (`src/components/ui/button.tsx`) — both already exist in this repo, do not re-run `npx shadcn add`.
- Existing tests (`src/__tests__/components/BudgetPressureView.test.tsx`, `src/__tests__/components/BudgetRefresher.test.tsx`) must pass **unmodified** — they assert on `data-testid` values (`row-{handle}`, `bp-{rank}`, `budget-refresher`), visible text, and `toHaveStyle` on literal hex colors. None of those need to change since the constraint above keeps those colors/testids literal and in place.
- Follow `cn()` (from `@/lib/utils`) for conditional className composition, matching `src/components/AuctionSheet/PlayerTable.tsx`'s established pattern — never string-concatenate conditional classes.
- Single quotes, trailing commas, 2-space indent (Prettier) — run `pnpm lint` and `pnpm tsc --noEmit` before considering a task done.

---

### Task 1: Re-skin BudgetRefresher with shadcn Button

**Files:**

- Modify: `src/components/BudgetPressure/BudgetRefresher.tsx` (full file, 68 lines)
- Test (verify only, no edits needed): `src/__tests__/components/BudgetRefresher.test.tsx`

**Interfaces:**

- Consumes: `Button` from `@/components/ui/button` (`variant`, `size`, `onClick`, `children` props — no new props needed beyond what's already used elsewhere, e.g. `src/components/BidModal/BidModal.tsx:155` `<Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>`)
- Produces: no change to `BudgetRefresherProps` (`{ intervalMs?: number }`) — Task 2 (`BudgetPressureView`) already renders `<BudgetRefresher intervalMs={20000} />` unchanged.

This component's only visual element is the "Refresh" button — replace its hand-rolled `<button>` (with `onMouseEnter`/`onMouseLeave` inline hover handlers) with shadcn `Button`. All timer/state logic (`useState`, `useEffect`, `useCallback`, `useRef`) stays byte-identical — only the JSX return changes.

- [ ] **Step 1: Confirm current tests pass before touching the file (baseline)**

Run: `pnpm test src/__tests__/components/BudgetRefresher.test.tsx`
Expected: PASS (5/5 tests) — this is the pre-existing baseline, not a new test.

- [ ] **Step 2: Replace the hand-rolled button with shadcn Button**

Replace the full contents of `src/components/BudgetPressure/BudgetRefresher.tsx` with:

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';

interface BudgetRefresherProps {
  intervalMs?: number;
}

export default function BudgetRefresher({ intervalMs = 20000 }: BudgetRefresherProps) {
  const router = useRouter();
  const [elapsed, setElapsed] = useState(0);
  const intervalSecs = intervalMs / 1000;
  const tickRef = useRef(0);
  const routerRef = useRef(router);
  useEffect(() => {
    routerRef.current = router;
  }, [router]);

  const doRefresh = useCallback(() => {
    routerRef.current.refresh();
    tickRef.current = 0;
    setElapsed(0);
  }, []);

  useEffect(() => {
    tickRef.current = 0;
    const timer = setInterval(() => {
      tickRef.current += 1;
      if (tickRef.current >= intervalSecs) {
        routerRef.current.refresh();
        tickRef.current = 0;
        setElapsed(0);
      } else {
        setElapsed(tickRef.current);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [intervalSecs]);

  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-[10px] text-muted-foreground">Updated {elapsed}s ago</span>
      <Button variant="outline" size="sm" onClick={doRefresh}>
        Refresh
      </Button>
    </div>
  );
}
```

- [ ] **Step 3: Run tests to verify nothing broke**

Run: `pnpm test src/__tests__/components/BudgetRefresher.test.tsx`
Expected: PASS (5/5 tests) — unchanged from Step 1, since `getByRole('button', { name: /refresh/i })` matches shadcn `Button`'s rendered `<button>Refresh</button>` exactly as it matched the old hand-rolled one.

- [ ] **Step 4: Typecheck and lint**

Run: `pnpm tsc --noEmit && pnpm lint`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/BudgetPressure/BudgetRefresher.tsx
git commit -m "refactor(ui): re-skin BudgetRefresher with shadcn Button"
```

---

### Task 2: Re-skin BudgetPressureView with shadcn Table + tokens

**Files:**

- Modify: `src/components/BudgetPressure/BudgetPressureView.tsx` (full file, 215 lines)
- Test (verify only, no edits needed): `src/__tests__/components/BudgetPressureView.test.tsx`

**Interfaces:**

- Consumes: `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell` from `@/components/ui/table`; `cn` from `@/lib/utils`; `BudgetRefresher` from `./BudgetRefresher` (Task 1's output — props unchanged: `<BudgetRefresher intervalMs={20000} />`).
- Produces: no change to `BudgetPressureViewProps` (`{ teams: TeamStats[]; ownerHandle: string | null }`) — this is a leaf page component, nothing downstream consumes its internals.

The table structure, column order, and the `buyingPowerColor()` threshold function are unchanged. Only the markup (native `<table>` → shadcn `Table` family) and styling (inline `style` → Tailwind token classes, except where Global Constraints says a color must stay literal) change.

Note the row's default shadcn hover state (`hover:bg-muted/50` baked into `TableRow`) is explicitly neutralized below with `hover:bg-transparent` — the original table had no row hover effect (rows aren't clickable, unlike `AuctionSheet`'s `PlayerTable`), and leaving the default hover in would falsely suggest interactivity.

- [ ] **Step 1: Confirm current tests pass before touching the file (baseline)**

Run: `pnpm test src/__tests__/components/BudgetPressureView.test.tsx`
Expected: PASS (9/9 tests) — this is the pre-existing baseline, not a new test.

- [ ] **Step 2: Replace the hand-rolled table with shadcn Table + tokens**

Replace the full contents of `src/components/BudgetPressure/BudgetPressureView.tsx` with:

```tsx
import type { TeamStats } from '@/types';
import { ROSTER_SIZE } from '@/lib/teams';
import { cn } from '@/lib/utils';
import BudgetRefresher from './BudgetRefresher';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';

function buyingPowerColor(bp: number): string {
  if (bp > 150) return '#4caf6e';
  if (bp >= 50) return '#e8a030';
  return '#e05050';
}

interface BudgetPressureViewProps {
  teams: TeamStats[];
  ownerHandle: string | null;
}

const COLUMNS = ['#', 'Team', 'Spent', 'Remaining', 'Roster', 'Buying Power'] as const;

export default function BudgetPressureView({ teams, ownerHandle }: BudgetPressureViewProps) {
  const maxBp = Math.max(...teams.map((t) => t.buyingPower), 1);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="border-b border-border bg-card px-5 pt-[18px] pb-3.5">
        <div className="font-label mb-1 text-[10px] tracking-[3px] text-muted-foreground uppercase">
          12-Team · Superflex · $1,000 Budget · 30-Man Rosters
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <h1 className="font-label m-0 text-xl font-bold tracking-tight text-white">
            Budget Pressure
          </h1>
          <BudgetRefresher intervalMs={20000} />
        </div>
        <div className="mt-0.5 text-[11px] text-muted-foreground">
          Buying power = remaining − remaining roster spots · sorted by most dangerous bidder
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto px-5 pb-10">
        <Table className="mt-1.5">
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              {COLUMNS.map((col) => (
                <TableHead
                  key={col}
                  className="font-label border-none py-2 text-[10px] font-semibold tracking-wide whitespace-nowrap text-muted-foreground uppercase"
                  style={{
                    textAlign: col === 'Team' || col === 'Buying Power' ? 'left' : 'center',
                  }}
                >
                  {col}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {teams.map((team, i) => {
              const isOwner = ownerHandle !== null && team.handle === ownerHandle;
              const bpColor = buyingPowerColor(team.buyingPower);
              const barWidth = maxBp > 0 ? Math.max(0, (team.buyingPower / maxBp) * 100) : 0;

              return (
                <TableRow
                  key={team.id}
                  data-testid={`row-${team.handle}`}
                  className={cn(
                    'border-b-[#141824] hover:bg-transparent',
                    !isOwner && i % 2 !== 0 ? 'bg-[#0a0c10]' : undefined,
                  )}
                  style={{
                    background: isOwner ? '#141e2e' : undefined,
                    borderLeft: `3px solid ${isOwner ? '#4f83e8' : 'var(--border)'}`,
                  }}
                >
                  <TableCell className="text-center font-mono text-[11px] text-muted-foreground tabular-nums">
                    {i + 1}
                  </TableCell>
                  <TableCell className="text-left">
                    <span
                      className={cn(
                        'text-[13px]',
                        isOwner ? 'font-bold text-foreground' : 'font-medium text-secondary-fg',
                      )}
                    >
                      {team.displayName ?? team.handle}
                    </span>
                  </TableCell>
                  <TableCell className="text-center font-mono text-xs text-secondary-fg tabular-nums">
                    ${team.spent}
                  </TableCell>
                  <TableCell className="text-center font-mono text-xs text-foreground tabular-nums">
                    ${team.remaining}
                  </TableCell>
                  <TableCell className="text-center font-mono text-xs text-secondary-fg tabular-nums">
                    {team.rosterCount} / {ROSTER_SIZE}
                  </TableCell>
                  <TableCell className="min-w-[180px]">
                    <div className="flex items-center gap-2.5">
                      <span
                        data-testid={`bp-${i + 1}`}
                        className="min-w-[60px] font-mono text-[15px] font-bold tabular-nums"
                        style={{ color: bpColor }}
                      >
                        ${team.buyingPower}
                      </span>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${barWidth}%`, background: bpColor, opacity: 0.75 }}
                        />
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Run tests to verify nothing broke**

Run: `pnpm test src/__tests__/components/BudgetPressureView.test.tsx`
Expected: PASS (9/9 tests) — unchanged from Step 1. In particular:

- `getByTestId('bp-1')` / `bp-2` / `bp-3` still resolve (same `data-testid` on the same `<span>` element, now with an added `font-mono`/`tabular-nums`/`min-w-[60px]` className but the same inline `style={{ color: bpColor }}`) and `toHaveStyle({ color: '#4caf6e' | '#e8a030' | '#e05050' })` still passes since that color is still inline `style`, not a class.
- `getByTestId('row-coreschke')` still resolves and `toHaveStyle({ borderLeft: '3px solid #4f83e8' })` still passes — the owner row's border color is still computed inline `style`, unchanged literal value.
- `getByText('Cole')`, `getByText('chappy72')`, `getByText('DrFunk')`, `getByText('1')`/`'2'`/`'3'`, `getByText('$800')` all still resolve — same text content, only wrapping markup changed.
- `getByTestId('budget-refresher')` still resolves — the test file mocks `BudgetRefresher` entirely, so Task 1's internal changes to that component are irrelevant here.

- [ ] **Step 4: Typecheck and lint**

Run: `pnpm tsc --noEmit && pnpm lint`
Expected: no errors.

- [ ] **Step 5: Run the full test suite as a regression check**

Run: `pnpm test`
Expected: all tests pass (no count given here since the full suite's size will have grown since Phase 3 — compare against whatever the pre-Task-1 baseline count was, not a hardcoded number).

- [ ] **Step 6: Commit**

```bash
git add src/components/BudgetPressure/BudgetPressureView.tsx
git commit -m "refactor(ui): re-skin BudgetPressureView with shadcn Table"
```

---

## Self-Review Notes

**Spec coverage:** Every design decision from the brainstorm is covered — shadcn Table adoption (Task 2), shadcn Button on the Refresh control (Task 1), `tabular-nums` on all four numeric columns (Task 2 Step 2: Spent/Remaining/Roster/Buying Power), `text-secondary-fg`/`border-border-subtle`-family tokens replacing hardcoded hex where a token exists, literal-color exceptions preserved exactly (`buyingPowerColor()` thresholds, owner-row highlight). No new shadcn primitives added, matching the "no new features" scope agreed in brainstorming.

**Placeholder scan:** No TBD/TODO — both tasks contain complete, final file contents, not diffs-with-gaps.

**Type consistency:** `BudgetPressureViewProps` and `BudgetRefresherProps` are unchanged from the current codebase (verified by reading both files before writing this plan) — no signature drift between the two tasks or across the task boundary where `BudgetPressureView` renders `BudgetRefresher`.

**Test-safety check:** Both existing test files were read in full before writing this plan. Every assertion they make (`data-testid` values, visible text, `toHaveStyle` literal-color checks, the `getByRole('button', { name: /refresh/i })` query) was traced against the new markup to confirm it still resolves — this plan intentionally requires zero test file edits.
