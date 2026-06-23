# Team Roster Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a `/teams` page showing all 12 league managers in a sortable budget leaderboard with multi-expand accordion rows revealing each team's full roster.

**Architecture:** A Next.js App Router async Server Component at `src/app/teams/page.tsx` queries Prisma, computes team stats, and passes serializable data to a `'use client'` `RosterTracker` component that manages all accordion expand/collapse state locally. No API routes. Navigation between pages is handled by a separate session — do not touch `src/app/layout.tsx` or any nav component.

**Tech Stack:** Next.js 16 App Router, TypeScript 5 (strict), Prisma 7 + SQLite (`prisma` singleton from `@/lib/db`), Jest + React Testing Library

## Global Constraints

- pnpm only — no npm or yarn
- Single quotes, trailing commas, 2-space indent, 100-char line width (Prettier)
- No unused vars (ESLint errors), no explicit `any` (ESLint warns)
- Pre-commit hook runs lint-staged + `pnpm tsc --noEmit` — never skip with `--no-verify`
- All numbers and dollar values: `fontFamily: 'var(--font-mono), monospace'`
- All labels/headers: `fontFamily: 'var(--font-barlow), sans-serif'`
- 3px left border in position accent color on every player row (signature design element)
- Inline styles for dynamic/computed values; Tailwind for layout utilities
- If you have visual design questions not covered by the existing design system in `src/app/globals.css` or `src/components/AuctionSheet/AuctionSheet.tsx`, invoke the `frontend-design` skill before deciding

---

## File Map

| Path                                             | Action | Responsibility                                                              |
| ------------------------------------------------ | ------ | --------------------------------------------------------------------------- |
| `src/types/index.ts`                             | Modify | Add `pkgCount` to `TeamStats`; add `RosterEntry` and `TeamWithRoster` types |
| `src/lib/posColors.ts`                           | Create | Shared `POS_COLORS` map (extracted from AuctionSheet)                       |
| `src/components/AuctionSheet/AuctionSheet.tsx`   | Modify | Import `POS_COLORS` from new shared lib instead of defining it locally      |
| `src/lib/computeTeamStats.ts`                    | Create | Pure function: raw Prisma result → `TeamWithRoster[]`                       |
| `src/__tests__/computeTeamStats.test.ts`         | Create | Unit tests for stat computation                                             |
| `src/components/RosterTracker/RosterTracker.tsx` | Create | `'use client'` accordion table UI                                           |
| `src/components/RosterTracker/index.ts`          | Create | Re-export                                                                   |
| `src/__tests__/RosterTracker.test.tsx`           | Create | RTL tests for accordion behavior                                            |
| `src/app/teams/page.tsx`                         | Create | Async Server Component: queries Prisma, renders RosterTracker               |

---

### Task 1: Types + Shared Position Colors

**Files:**

- Modify: `src/types/index.ts`
- Create: `src/lib/posColors.ts`
- Modify: `src/components/AuctionSheet/AuctionSheet.tsx`

**Interfaces:**

- Produces: `POS_COLORS` (consumed by Task 3), `RosterEntry` (consumed by Tasks 2 and 3), `TeamWithRoster` (consumed by Tasks 2, 3, and 4)

- [ ] **Step 1: Replace the contents of `src/types/index.ts`**

Add `pkgCount` to `TeamStats` and add the two new types needed by the roster feature. The rest of the file is unchanged.

```ts
export type Position = 'QB' | 'RB' | 'WR' | 'TE' | 'PICK' | 'PKG';

export interface Player {
  player: string;
  team: string;
  pos: Position;
  age: number | null;
  sfRank: number;
  budget: number;
  ceiling: number;
  floor: number;
  notes: string;
}

export interface TeamStats {
  id: number;
  handle: string;
  displayName: string | null;
  budget: number;
  spent: number;
  remaining: number;
  rosterCount: number;
  rosterRemaining: number;
  buyingPower: number;
  pkgCount: number;
}

export interface AuctionResultEntry {
  id: number;
  player: string;
  position: string;
  nflTeam: string;
  price: number;
  sfRank: number | null;
  teamId: number;
  teamHandle: string;
  createdAt: Date;
}

export interface RosterEntry {
  id: number;
  player: string;
  position: string;
  nflTeam: string;
  price: number;
  sfRank: number | null;
  teamId: number;
  teamHandle: string;
}

export interface TeamWithRoster extends TeamStats {
  results: RosterEntry[];
}
```

- [ ] **Step 2: Create `src/lib/posColors.ts`**

```ts
import type { Position } from '@/types';

export const POS_COLORS: Record<
  Position,
  { bg: string; accent: string; badge: string; badgeText: string }
> = {
  QB: { bg: '#1a2744', accent: '#4f83e8', badge: '#e8f0fe', badgeText: '#1a2744' },
  RB: { bg: '#1a2e1a', accent: '#4caf6e', badge: '#e6f4ea', badgeText: '#1a3a22' },
  WR: { bg: '#2a1f0e', accent: '#e8a030', badge: '#fef3e2', badgeText: '#3a2008' },
  TE: { bg: '#2a1a2a', accent: '#c060d0', badge: '#f5e6f8', badgeText: '#3a0a3a' },
  PICK: { bg: '#1a2a2a', accent: '#40b0b0', badge: '#e0f5f5', badgeText: '#0a3030' },
  PKG: { bg: '#2a2010', accent: '#f0c040', badge: '#fdf5d0', badgeText: '#3a2a00' },
};
```

- [ ] **Step 3: Update `src/components/AuctionSheet/AuctionSheet.tsx`**

Remove the local `POS_COLORS` definition (lines 7–17, the `Record<Position, ...>` block) and add this import near the top of the file alongside the other imports:

```ts
import { POS_COLORS } from '@/lib/posColors';
```

- [ ] **Step 4: Verify no regressions**

```bash
pnpm tsc --noEmit && pnpm lint
```

Expected: exits 0, no errors or warnings.

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts src/lib/posColors.ts src/components/AuctionSheet/AuctionSheet.tsx
git commit -m "refactor: extract POS_COLORS to shared lib, extend TeamStats with pkgCount"
```

---

### Task 2: Team Stat Computation

**Files:**

- Create: `src/lib/computeTeamStats.ts`
- Create: `src/__tests__/computeTeamStats.test.ts`

**Interfaces:**

- Consumes: `TeamWithRoster`, `RosterEntry` from `@/types`; `ROSTER_SIZE` from `@/lib/teams`
- Produces: `computeTeamStats(teams: TeamInput[]): TeamWithRoster[]` where `TeamInput` is the local interface defined in the module

- [ ] **Step 1: Write the failing test at `src/__tests__/computeTeamStats.test.ts`**

```ts
import { computeTeamStats } from '@/lib/computeTeamStats';

const makeResult = (
  overrides: Partial<{
    id: number;
    player: string;
    position: string;
    nflTeam: string;
    price: number;
    sfRank: number | null;
    teamId: number;
  }> = {},
) => ({
  id: 1,
  player: 'Patrick Mahomes',
  position: 'QB',
  nflTeam: 'KC',
  price: 200,
  sfRank: 1,
  teamId: 1,
  ...overrides,
});

const makeTeam = (
  overrides: Partial<{
    id: number;
    handle: string;
    displayName: string | null;
    budget: number;
    results: ReturnType<typeof makeResult>[];
  }> = {},
) => ({
  id: 1,
  handle: 'test',
  displayName: null,
  budget: 1000,
  results: [] as ReturnType<typeof makeResult>[],
  ...overrides,
});

describe('computeTeamStats', () => {
  it('computes zero stats for a team with no results', () => {
    const [stats] = computeTeamStats([makeTeam()]);
    expect(stats.spent).toBe(0);
    expect(stats.remaining).toBe(1000);
    expect(stats.rosterCount).toBe(0);
    expect(stats.rosterRemaining).toBe(30);
    expect(stats.buyingPower).toBe(970);
    expect(stats.pkgCount).toBe(0);
  });

  it('computes spent from the sum of result prices', () => {
    const team = makeTeam({
      results: [makeResult({ price: 150 }), makeResult({ id: 2, price: 100 })],
    });
    const [stats] = computeTeamStats([team]);
    expect(stats.spent).toBe(250);
    expect(stats.remaining).toBe(750);
  });

  it('computes rosterCount and rosterRemaining', () => {
    const team = makeTeam({
      results: [makeResult(), makeResult({ id: 2 }), makeResult({ id: 3 })],
    });
    const [stats] = computeTeamStats([team]);
    expect(stats.rosterCount).toBe(3);
    expect(stats.rosterRemaining).toBe(27);
  });

  it('computes buyingPower as remaining minus rosterRemaining', () => {
    const team = makeTeam({ results: [makeResult({ price: 100 })] });
    const [stats] = computeTeamStats([team]);
    // remaining=900, rosterRemaining=29, buyingPower=871
    expect(stats.buyingPower).toBe(871);
  });

  it('counts only PKG position results for pkgCount', () => {
    const team = makeTeam({
      results: [
        makeResult({ position: 'PKG', price: 109 }),
        makeResult({ id: 2, position: 'QB', price: 200 }),
        makeResult({ id: 3, position: 'PKG', price: 72 }),
      ],
    });
    const [stats] = computeTeamStats([team]);
    expect(stats.pkgCount).toBe(2);
  });

  it('maps results to RosterEntry shape and injects teamHandle', () => {
    const team = makeTeam({ handle: 'coreschke', results: [makeResult()] });
    const [stats] = computeTeamStats([team]);
    expect(stats.results[0]).toMatchObject({
      id: 1,
      player: 'Patrick Mahomes',
      position: 'QB',
      nflTeam: 'KC',
      price: 200,
      sfRank: 1,
      teamId: 1,
      teamHandle: 'coreschke',
    });
  });

  it('handles multiple teams independently', () => {
    const teams = [
      makeTeam({ id: 1, handle: 'a', results: [makeResult({ price: 300, teamId: 1 })] }),
      makeTeam({ id: 2, handle: 'b', results: [] }),
    ];
    const stats = computeTeamStats(teams);
    expect(stats[0].spent).toBe(300);
    expect(stats[1].spent).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
pnpm test -- --testPathPattern computeTeamStats
```

Expected: FAIL — `Cannot find module '@/lib/computeTeamStats'`

- [ ] **Step 3: Implement `src/lib/computeTeamStats.ts`**

```ts
import type { TeamWithRoster, RosterEntry } from '@/types';
import { ROSTER_SIZE } from '@/lib/teams';

interface TeamInput {
  id: number;
  handle: string;
  displayName: string | null;
  budget: number;
  results: Array<{
    id: number;
    player: string;
    position: string;
    nflTeam: string;
    price: number;
    sfRank: number | null;
    teamId: number;
  }>;
}

export function computeTeamStats(teams: TeamInput[]): TeamWithRoster[] {
  return teams.map((team) => {
    const spent = team.results.reduce((sum, r) => sum + r.price, 0);
    const remaining = team.budget - spent;
    const rosterCount = team.results.length;
    const rosterRemaining = ROSTER_SIZE - rosterCount;
    const buyingPower = remaining - rosterRemaining;
    const pkgCount = team.results.filter((r) => r.position === 'PKG').length;

    const results: RosterEntry[] = team.results.map((r) => ({
      id: r.id,
      player: r.player,
      position: r.position,
      nflTeam: r.nflTeam,
      price: r.price,
      sfRank: r.sfRank,
      teamId: r.teamId,
      teamHandle: team.handle,
    }));

    return {
      id: team.id,
      handle: team.handle,
      displayName: team.displayName,
      budget: team.budget,
      spent,
      remaining,
      rosterCount,
      rosterRemaining,
      buyingPower,
      pkgCount,
      results,
    };
  });
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

```bash
pnpm test -- --testPathPattern computeTeamStats
```

Expected: PASS — 6 tests passing.

- [ ] **Step 5: Run the full quality gate**

```bash
pnpm check
```

Expected: typecheck, lint, format check, and tests all pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/computeTeamStats.ts src/__tests__/computeTeamStats.test.ts
git commit -m "feat: add computeTeamStats pure function with unit tests"
```

---

### Task 3: RosterTracker Client Component

**Files:**

- Create: `src/components/RosterTracker/RosterTracker.tsx`
- Create: `src/components/RosterTracker/index.ts`
- Create: `src/__tests__/RosterTracker.test.tsx`

**Interfaces:**

- Consumes: `TeamWithRoster`, `Position` from `@/types`; `POS_COLORS` from `@/lib/posColors`; `players` from `@/data/players`
- Produces: `default export function RosterTracker({ teams }: { teams: TeamWithRoster[] })`

- [ ] **Step 1: Write the failing tests at `src/__tests__/RosterTracker.test.tsx`**

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import RosterTracker from '@/components/RosterTracker/RosterTracker';
import type { TeamWithRoster } from '@/types';

const makeTeam = (overrides: Partial<TeamWithRoster> = {}): TeamWithRoster => ({
  id: 1,
  handle: 'coreschke',
  displayName: 'Cole',
  budget: 1000,
  spent: 312,
  remaining: 688,
  rosterCount: 2,
  rosterRemaining: 28,
  buyingPower: 660,
  pkgCount: 1,
  results: [
    {
      id: 1,
      player: 'Patrick Mahomes',
      position: 'QB',
      nflTeam: 'KC',
      price: 200,
      sfRank: 1,
      teamId: 1,
      teamHandle: 'coreschke',
    },
    {
      id: 2,
      player: 'Matt Gay',
      position: 'PKG',
      nflTeam: 'MIN',
      price: 112,
      sfRank: null,
      teamId: 1,
      teamHandle: 'coreschke',
    },
  ],
  ...overrides,
});

const emptyTeam: TeamWithRoster = {
  id: 2,
  handle: 'chappy72',
  displayName: null,
  budget: 1000,
  spent: 0,
  remaining: 1000,
  rosterCount: 0,
  rosterRemaining: 30,
  buyingPower: 970,
  pkgCount: 0,
  results: [],
};

describe('RosterTracker', () => {
  it('renders all team handles in the table', () => {
    render(<RosterTracker teams={[makeTeam(), emptyTeam]} />);
    expect(screen.getByText('coreschke')).toBeInTheDocument();
    expect(screen.getByText('chappy72')).toBeInTheDocument();
  });

  it('does not show roster player rows by default', () => {
    render(<RosterTracker teams={[makeTeam()]} />);
    expect(screen.queryByText('Patrick Mahomes')).not.toBeInTheDocument();
  });

  it('shows roster when a team row is clicked', () => {
    render(<RosterTracker teams={[makeTeam()]} />);
    fireEvent.click(screen.getByText('coreschke').closest('tr')!);
    expect(screen.getByText('Patrick Mahomes')).toBeInTheDocument();
  });

  it('collapses roster when the same row is clicked again', () => {
    render(<RosterTracker teams={[makeTeam()]} />);
    const row = screen.getByText('coreschke').closest('tr')!;
    fireEvent.click(row);
    fireEvent.click(row);
    expect(screen.queryByText('Patrick Mahomes')).not.toBeInTheDocument();
  });

  it('keeps multiple rows expanded simultaneously', () => {
    const team2 = makeTeam({
      id: 2,
      handle: 'chappy72',
      displayName: null,
      pkgCount: 0,
      results: [
        {
          id: 3,
          player: 'Justin Jefferson',
          position: 'WR',
          nflTeam: 'MIN',
          price: 180,
          sfRank: 5,
          teamId: 2,
          teamHandle: 'chappy72',
        },
      ],
    });
    render(<RosterTracker teams={[makeTeam(), team2]} />);
    fireEvent.click(screen.getByText('coreschke').closest('tr')!);
    fireEvent.click(screen.getByText('chappy72').closest('tr')!);
    expect(screen.getByText('Patrick Mahomes')).toBeInTheDocument();
    expect(screen.getByText('Justin Jefferson')).toBeInTheDocument();
  });

  it('shows PKG badge for teams with pick packages', () => {
    render(<RosterTracker teams={[makeTeam()]} />);
    expect(screen.getByText('1×')).toBeInTheDocument();
  });

  it('does not render a PKG badge for teams with zero pick packages', () => {
    render(<RosterTracker teams={[emptyTeam]} />);
    expect(screen.queryByText('0×')).not.toBeInTheDocument();
  });

  it('shows empty state message when an expanded team has no results', () => {
    render(<RosterTracker teams={[emptyTeam]} />);
    fireEvent.click(screen.getByText('chappy72').closest('tr')!);
    expect(screen.getByText('No players won yet.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
pnpm test -- --testPathPattern RosterTracker
```

Expected: FAIL — `Cannot find module '@/components/RosterTracker/RosterTracker'`

- [ ] **Step 3: Implement `src/components/RosterTracker/RosterTracker.tsx`**

```tsx
'use client';

import { useState } from 'react';
import type { TeamWithRoster, Position } from '@/types';
import { POS_COLORS } from '@/lib/posColors';
import { players } from '@/data/players';

type SortKey = 'buyingPower' | 'spent' | 'remaining' | 'rosterCount';

function buyingPowerColor(bp: number): string {
  if (bp < 50) return '#e05050';
  if (bp < 150) return '#e8a030';
  return '#e8eaf0';
}

function SortIcon({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  if (!active) return <span style={{ color: '#444', marginLeft: 3 }}>↕</span>;
  return <span style={{ color: '#e8a030', marginLeft: 3 }}>{dir === 'asc' ? '↑' : '↓'}</span>;
}

interface Props {
  teams: TeamWithRoster[];
}

export default function RosterTracker({ teams }: Props) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [sortBy, setSortBy] = useState<SortKey>('buyingPower');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const toggle = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSort = (col: SortKey) => {
    if (sortBy === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(col);
      setSortDir('desc');
    }
  };

  const sorted = [...teams].sort((a, b) => {
    const aV = a[sortBy];
    const bV = b[sortBy];
    return sortDir === 'desc' ? bV - aV : aV - bV;
  });

  return (
    <div
      style={{
        fontFamily: 'var(--font-inter), "Inter", "Helvetica Neue", sans-serif',
        background: 'var(--bg-base, #0a0d14)',
        minHeight: '100vh',
        color: '#e8eaf0',
      }}
    >
      {/* Header */}
      <div
        style={{
          background: 'var(--bg-surface, #141824)',
          borderBottom: '1px solid #2a3048',
          padding: '18px 20px 14px',
        }}
      >
        <div
          style={{
            fontSize: 10,
            letterSpacing: 3,
            color: '#4a5168',
            textTransform: 'uppercase',
            marginBottom: 3,
            fontFamily: 'var(--font-barlow), sans-serif',
          }}
        >
          12-Team · Superflex · TE Premium · $1,000 Budget · 30-Man Rosters
        </div>
        <h1
          style={{
            margin: '0 0 2px',
            fontSize: 20,
            fontWeight: 700,
            color: '#fff',
            letterSpacing: -0.5,
            fontFamily: 'var(--font-barlow), sans-serif',
          }}
        >
          Team Rosters
        </h1>
        <div style={{ fontSize: 11, color: '#4a5168' }}>
          Click any row to expand · Multiple rows can be open simultaneously
        </div>
      </div>

      {/* Table */}
      <div style={{ padding: '0 20px 40px', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 6 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #2a3048' }}>
              <th
                style={{
                  padding: '9px 10px',
                  textAlign: 'left',
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: 1,
                  color: '#4a5168',
                  textTransform: 'uppercase',
                  fontFamily: 'var(--font-barlow), sans-serif',
                  userSelect: 'none',
                }}
              >
                Team
              </th>
              <th
                onClick={() => handleSort('rosterCount')}
                style={{
                  padding: '9px 10px',
                  textAlign: 'center',
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: 1,
                  color: sortBy === 'rosterCount' ? '#e8a030' : '#4a5168',
                  textTransform: 'uppercase',
                  fontFamily: 'var(--font-barlow), sans-serif',
                  cursor: 'pointer',
                  userSelect: 'none',
                }}
              >
                Roster <SortIcon active={sortBy === 'rosterCount'} dir={sortDir} />
              </th>
              <th
                style={{
                  padding: '9px 10px',
                  textAlign: 'center',
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: 1,
                  color: '#4a5168',
                  textTransform: 'uppercase',
                  fontFamily: 'var(--font-barlow), sans-serif',
                  userSelect: 'none',
                }}
              >
                PKG
              </th>
              {(
                [
                  { key: 'spent' as SortKey, label: 'Spent' },
                  { key: 'remaining' as SortKey, label: 'Remaining' },
                  { key: 'buyingPower' as SortKey, label: 'Buying Power' },
                ] as Array<{ key: SortKey; label: string }>
              ).map((col) => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  style={{
                    padding: '9px 10px',
                    textAlign: 'center',
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: 1,
                    color: sortBy === col.key ? '#e8a030' : '#4a5168',
                    textTransform: 'uppercase',
                    cursor: 'pointer',
                    userSelect: 'none',
                    whiteSpace: 'nowrap',
                    fontFamily: 'var(--font-barlow), sans-serif',
                  }}
                >
                  {col.label}
                  <SortIcon active={sortBy === col.key} dir={sortDir} />
                </th>
              ))}
              <th style={{ width: 32 }} />
            </tr>
          </thead>
          <tbody>
            {sorted.flatMap((team, i) => {
              const isExpanded = expanded.has(team.id);
              const isMe = team.handle === 'coreschke';
              const rowBg = isMe ? '#0a1020' : i % 2 === 0 ? 'transparent' : '#0a0c10';

              const rows = [
                <tr
                  key={team.id}
                  onClick={() => toggle(team.id)}
                  style={{
                    borderBottom: isExpanded ? 'none' : '1px solid #141824',
                    background: rowBg,
                    cursor: 'pointer',
                    borderLeft: isMe ? '3px solid #4f83e8' : '3px solid transparent',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#141824')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = rowBg)}
                >
                  <td style={{ padding: '10px 10px', textAlign: 'left' }}>
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: isMe ? 700 : 400,
                        color: isMe ? '#4f83e8' : '#e8eaf0',
                      }}
                    >
                      {team.handle}
                    </span>
                    {team.displayName && (
                      <span style={{ fontSize: 11, color: '#4a5168', marginLeft: 6 }}>
                        {team.displayName}
                      </span>
                    )}
                  </td>
                  <td
                    style={{
                      padding: '10px 10px',
                      textAlign: 'center',
                      fontSize: 12,
                      fontFamily: 'var(--font-mono), monospace',
                      color: '#8892a4',
                    }}
                  >
                    {team.rosterCount} / 30
                  </td>
                  <td style={{ padding: '10px 10px', textAlign: 'center' }}>
                    {team.pkgCount > 0 && (
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: '#f0c040',
                          fontFamily: 'var(--font-mono), monospace',
                          background: '#2a2010',
                          borderRadius: 4,
                          padding: '2px 6px',
                        }}
                      >
                        {team.pkgCount}×
                      </span>
                    )}
                  </td>
                  <td
                    style={{
                      padding: '10px 10px',
                      textAlign: 'center',
                      fontSize: 13,
                      fontFamily: 'var(--font-mono), monospace',
                      color: '#8892a4',
                    }}
                  >
                    ${team.spent}
                  </td>
                  <td
                    style={{
                      padding: '10px 10px',
                      textAlign: 'center',
                      fontSize: 13,
                      fontFamily: 'var(--font-mono), monospace',
                      color: '#e8eaf0',
                    }}
                  >
                    ${team.remaining}
                  </td>
                  <td
                    style={{
                      padding: '10px 10px',
                      textAlign: 'center',
                      fontSize: 13,
                      fontWeight: 700,
                      fontFamily: 'var(--font-mono), monospace',
                      color: buyingPowerColor(team.buyingPower),
                    }}
                  >
                    ${team.buyingPower}
                  </td>
                  <td style={{ padding: '10px 10px', textAlign: 'right' }}>
                    <span
                      style={{
                        display: 'inline-block',
                        transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                        transition: 'transform 0.15s ease',
                        color: '#4a5168',
                        fontSize: 12,
                        lineHeight: 1,
                      }}
                    >
                      ▶
                    </span>
                  </td>
                </tr>,
              ];

              if (isExpanded) {
                rows.push(
                  <tr key={`${team.id}-roster`}>
                    <td colSpan={7} style={{ padding: 0, borderBottom: '2px solid #2a3048' }}>
                      <div style={{ background: '#080a10', padding: '10px 16px 14px' }}>
                        {team.results.length === 0 ? (
                          <div style={{ fontSize: 12, color: '#4a5168', fontStyle: 'italic' }}>
                            No players won yet.
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            {team.results.map((result) => {
                              const pos = result.position as Position;
                              const c = POS_COLORS[pos] ?? POS_COLORS.PICK;
                              const targetPlayer = players.find((p) => p.player === result.player);
                              const delta =
                                targetPlayer != null ? result.price - targetPlayer.budget : null;
                              return (
                                <div
                                  key={result.id}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 10,
                                    padding: '5px 8px',
                                    borderLeft: `3px solid ${c.accent}`,
                                    background: '#0a0d14',
                                    borderRadius: '0 4px 4px 0',
                                  }}
                                >
                                  <span
                                    style={{
                                      display: 'inline-block',
                                      background: c.badge,
                                      color: c.badgeText,
                                      borderRadius: 4,
                                      fontSize: 9,
                                      fontWeight: 700,
                                      padding: '2px 6px',
                                      letterSpacing: 0.5,
                                      fontFamily: 'var(--font-barlow), sans-serif',
                                      minWidth: 32,
                                      textAlign: 'center',
                                    }}
                                  >
                                    {result.position}
                                  </span>
                                  <span
                                    style={{
                                      fontSize: 13,
                                      fontWeight: 600,
                                      color: '#e8eaf0',
                                      flex: 1,
                                    }}
                                  >
                                    {result.player}
                                  </span>
                                  <span style={{ fontSize: 11, color: '#4a5168', minWidth: 30 }}>
                                    {result.nflTeam}
                                  </span>
                                  <span
                                    style={{
                                      fontSize: 13,
                                      fontWeight: 700,
                                      color: c.accent,
                                      fontFamily: 'var(--font-mono), monospace',
                                      minWidth: 44,
                                      textAlign: 'right',
                                    }}
                                  >
                                    ${result.price}
                                  </span>
                                  {delta !== null && delta !== 0 && (
                                    <span
                                      style={{
                                        fontSize: 11,
                                        fontFamily: 'var(--font-mono), monospace',
                                        color: delta > 0 ? '#e05050' : '#4caf6e',
                                        minWidth: 44,
                                        textAlign: 'right',
                                      }}
                                    >
                                      {delta > 0 ? `+$${delta}` : `-$${Math.abs(delta)}`}
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>,
                );
              }

              return rows;
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create `src/components/RosterTracker/index.ts`**

```ts
export { default } from './RosterTracker';
```

- [ ] **Step 5: Run the tests and confirm they pass**

```bash
pnpm test -- --testPathPattern RosterTracker
```

Expected: PASS — 8 tests passing.

- [ ] **Step 6: Run the full quality gate**

```bash
pnpm check
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/components/RosterTracker/RosterTracker.tsx src/components/RosterTracker/index.ts src/__tests__/RosterTracker.test.tsx
git commit -m "feat: add RosterTracker client component with multi-expand accordion"
```

---

### Task 4: /teams Server Component Page

**Files:**

- Create: `src/app/teams/page.tsx`

**Interfaces:**

- Consumes: `prisma` from `@/lib/db`; `computeTeamStats` from `@/lib/computeTeamStats`; `RosterTracker` (default) from `@/components/RosterTracker`

- [ ] **Step 1: Create `src/app/teams/page.tsx`**

```tsx
import { prisma } from '@/lib/db';
import { computeTeamStats } from '@/lib/computeTeamStats';
import RosterTracker from '@/components/RosterTracker';

export const dynamic = 'force-dynamic';

export default async function TeamsPage() {
  const teams = await prisma.team.findMany({
    include: { results: true },
    orderBy: { handle: 'asc' },
  });

  const teamsWithRoster = computeTeamStats(teams);

  return <RosterTracker teams={teamsWithRoster} />;
}
```

- [ ] **Step 2: Run the full quality gate**

```bash
pnpm check
```

Expected: typecheck, lint, format check, and tests all pass.

- [ ] **Step 3: Start the dev server and manually verify the page**

```bash
make dev
```

Navigate to `http://localhost:3000/teams`. Confirm:

- All 12 team handles appear in the table
- Table is sorted by buying power (all $970 with an empty DB — correct)
- Clicking a row expands an inline panel showing "No players won yet."
- Clicking the same row again collapses it
- Clicking two different rows leaves both expanded simultaneously
- No browser console errors

- [ ] **Step 4: Commit**

```bash
git add src/app/teams/page.tsx
git commit -m "feat: add /teams page wired to Prisma via server component"
```
