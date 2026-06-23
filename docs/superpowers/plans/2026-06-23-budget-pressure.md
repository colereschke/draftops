# Budget Pressure View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Worktree note:** Before executing, set up an isolated git worktree via `superpowers:using-git-worktrees` to avoid conflicts with parallel feature branches.

**Goal:** Build a `/budget` page that shows all 12 teams' buying power in real-time, auto-refreshing every 20 seconds during live burst-phase auction windows.

**Architecture:** An async RSC at `/app/budget/page.tsx` queries Prisma directly and passes computed `TeamStats[]` to a pure `BudgetPressureView` component. A thin `BudgetRefresher` client component calls `router.refresh()` on a 20-second interval (and exposes a manual button) so data stays current without an API route. A shared `NavBar` added to `layout.tsx` links all pages.

**Tech Stack:** Next.js 16 App Router, Prisma 7 + SQLite, React 19, Jest + React Testing Library, TypeScript 5 strict mode.

## Global Constraints

- pnpm only — never npm or yarn
- Single quotes, trailing commas, 2-space indent, 100-char line width (Prettier enforced on commit)
- No `any` types (ESLint warns); no unused vars (ESLint errors)
- All dynamic/computed styles (colors, widths) stay as inline styles — Tailwind for layout utilities only
- Pre-commit hook runs lint-staged + `tsc --noEmit` — never use `--no-verify`
- Run `make check` before the final commit to verify the full quality gate passes
- `@/*` is an alias for `src/*`
- DB singleton is at `@/lib/db` — never instantiate PrismaClient directly

---

## File Map

| Action | Path                                                   | Responsibility                                                      |
| ------ | ------------------------------------------------------ | ------------------------------------------------------------------- |
| Create | `src/lib/budget.ts`                                    | Pure `computeTeamStats()` helper — all buying-power math lives here |
| Create | `src/components/NavBar/NavBar.tsx`                     | Server component shell — wordmark + `<NavLinks />`                  |
| Create | `src/components/NavBar/NavLinks.tsx`                   | `'use client'` — `usePathname` for active link state                |
| Create | `src/components/NavBar/index.ts`                       | Barrel export                                                       |
| Create | `src/components/BudgetPressure/BudgetPressureView.tsx` | Pure component — receives `TeamStats[]`, renders table              |
| Create | `src/components/BudgetPressure/BudgetRefresher.tsx`    | `'use client'` — `router.refresh()` interval + manual button        |
| Create | `src/components/BudgetPressure/index.ts`               | Barrel export                                                       |
| Create | `src/app/budget/page.tsx`                              | Async RSC — Prisma query, compute, render                           |
| Modify | `src/app/layout.tsx`                                   | Add `<NavBar />` above `{children}`                                 |
| Create | `src/__tests__/lib/budget.test.ts`                     | Unit tests for `computeTeamStats`                                   |
| Create | `src/__tests__/components/NavLinks.test.tsx`           | Active link state                                                   |
| Create | `src/__tests__/components/BudgetPressureView.test.tsx` | Table rendering, color thresholds, Cole highlight                   |
| Create | `src/__tests__/components/BudgetRefresher.test.tsx`    | Interval refresh, manual refresh, elapsed counter                   |

---

### Task 1: NavBar component + layout integration

**Files:**

- Create: `src/components/NavBar/NavBar.tsx`
- Create: `src/components/NavBar/NavLinks.tsx`
- Create: `src/components/NavBar/index.ts`
- Modify: `src/app/layout.tsx`
- Test: `src/__tests__/components/NavLinks.test.tsx`

**Interfaces:**

- Produces: `<NavBar />` — zero-prop server component, safe to render in `layout.tsx`

---

- [ ] **Step 1: Write the failing test for NavLinks**

Create `src/__tests__/components/NavLinks.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import NavLinks from '@/components/NavBar/NavLinks';

jest.mock('next/navigation', () => ({
  usePathname: jest.fn(),
}));

import { usePathname } from 'next/navigation';
const mockUsePathname = usePathname as jest.Mock;

describe('NavLinks', () => {
  it('renders all nav links', () => {
    mockUsePathname.mockReturnValue('/');
    render(<NavLinks />);
    expect(screen.getByText('Value Sheet')).toBeInTheDocument();
    expect(screen.getByText('Budget Pressure')).toBeInTheDocument();
  });

  it('highlights the active route', () => {
    mockUsePathname.mockReturnValue('/budget');
    render(<NavLinks />);
    const active = screen.getByText('Budget Pressure').closest('a');
    const inactive = screen.getByText('Value Sheet').closest('a');
    expect(active).toHaveStyle({ color: '#e8a030' });
    expect(inactive).toHaveStyle({ color: '#4a5168' });
  });

  it('highlights value sheet when on root', () => {
    mockUsePathname.mockReturnValue('/');
    render(<NavLinks />);
    const active = screen.getByText('Value Sheet').closest('a');
    expect(active).toHaveStyle({ color: '#e8a030' });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
pnpm test -- --testPathPattern="NavLinks" --no-coverage
```

Expected: FAIL — `Cannot find module '@/components/NavBar/NavLinks'`

- [ ] **Step 3: Create NavLinks.tsx**

Create `src/components/NavBar/NavLinks.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/', label: 'Value Sheet' },
  { href: '/budget', label: 'Budget Pressure' },
];

export default function NavLinks() {
  const pathname = usePathname();
  return (
    <nav style={{ display: 'flex', gap: 4 }}>
      {LINKS.map(({ href, label }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            style={{
              padding: '3px 10px',
              borderRadius: 5,
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: 0.5,
              fontFamily: 'var(--font-barlow), sans-serif',
              textDecoration: 'none',
              color: active ? '#e8a030' : '#4a5168',
              background: active ? '#2a1f0e' : 'transparent',
              border: `1px solid ${active ? '#e8a030' : '#2a3048'}`,
            }}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 4: Create NavBar.tsx**

Create `src/components/NavBar/NavBar.tsx`:

```tsx
import NavLinks from './NavLinks';

export default function NavBar() {
  return (
    <div
      style={{
        background: 'var(--bg-surface, #141824)',
        borderBottom: '1px solid #1e2434',
        padding: '8px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-barlow), sans-serif',
          fontWeight: 700,
          fontSize: 13,
          letterSpacing: 2,
          color: '#e8eaf0',
          textTransform: 'uppercase',
        }}
      >
        DraftOps
      </span>
      <NavLinks />
    </div>
  );
}
```

- [ ] **Step 5: Create barrel export**

Create `src/components/NavBar/index.ts`:

```ts
export { default } from './NavBar';
```

- [ ] **Step 6: Update layout.tsx to include NavBar**

Modify `src/app/layout.tsx`. Replace the `<body>` tag content:

```tsx
import type { Metadata } from 'next';
import { Barlow_Condensed, Inter, JetBrains_Mono } from 'next/font/google';
import NavBar from '@/components/NavBar';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const barlowCondensed = Barlow_Condensed({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-barlow',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'DraftOps | Dynasty Auction Tool',
  description: '12-team Superflex dynasty auction tracker with live budget management',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${barlowCondensed.variable} ${jetbrainsMono.variable}`}
    >
      <body style={{ fontFamily: 'var(--font-inter), sans-serif' }}>
        <NavBar />
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 7: Run tests to verify they pass**

```bash
pnpm test -- --testPathPattern="NavLinks" --no-coverage
```

Expected: PASS — 3 tests pass

- [ ] **Step 8: Commit**

```bash
git add src/components/NavBar/ src/app/layout.tsx src/__tests__/components/NavLinks.test.tsx
git commit -m "feat: add NavBar with active route highlighting"
```

---

### Task 2: TeamStats computation helper

**Files:**

- Create: `src/lib/budget.ts`
- Test: `src/__tests__/lib/budget.test.ts`

**Interfaces:**

- Consumes: `TeamStats` from `@/types`, `ROSTER_SIZE` from `@/lib/teams`
- Produces: `computeTeamStats(teams: TeamWithResults[]): TeamStats[]` — sorted by `buyingPower` descending

---

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/lib/budget.test.ts`:

```ts
import { computeTeamStats } from '@/lib/budget';

const makeTeam = (overrides: {
  id?: number;
  handle?: string;
  displayName?: string | null;
  budget?: number;
  results?: { price: number }[];
}) => ({
  id: 1,
  handle: 'testteam',
  displayName: null,
  budget: 1000,
  results: [],
  ...overrides,
});

describe('computeTeamStats', () => {
  it('computes zero spent for a team with no results', () => {
    const [stat] = computeTeamStats([makeTeam({})]);
    expect(stat.spent).toBe(0);
    expect(stat.remaining).toBe(1000);
    expect(stat.rosterCount).toBe(0);
    expect(stat.rosterRemaining).toBe(30);
    expect(stat.buyingPower).toBe(970); // 1000 - 30
  });

  it('correctly computes spent from results', () => {
    const [stat] = computeTeamStats([
      makeTeam({ results: [{ price: 200 }, { price: 150 }, { price: 75 }] }),
    ]);
    expect(stat.spent).toBe(425);
    expect(stat.remaining).toBe(575);
    expect(stat.rosterCount).toBe(3);
    expect(stat.rosterRemaining).toBe(27);
    expect(stat.buyingPower).toBe(548); // 575 - 27
  });

  it('sorts by buyingPower descending', () => {
    const teams = computeTeamStats([
      makeTeam({ id: 1, handle: 'low', results: [{ price: 900 }] }),
      makeTeam({ id: 2, handle: 'high', results: [] }),
      makeTeam({ id: 3, handle: 'mid', results: [{ price: 500 }] }),
    ]);
    expect(teams[0].handle).toBe('high');
    expect(teams[1].handle).toBe('mid');
    expect(teams[2].handle).toBe('low');
  });

  it('maps displayName and handle correctly', () => {
    const [stat] = computeTeamStats([makeTeam({ handle: 'coreschke', displayName: 'Cole' })]);
    expect(stat.handle).toBe('coreschke');
    expect(stat.displayName).toBe('Cole');
  });

  it('produces negative buyingPower when remaining cannot cover remaining spots', () => {
    // Team with $5 left but 10 spots to fill → buyingPower = 5 - 10 = -5
    const [stat] = computeTeamStats([
      makeTeam({ results: Array(20).fill({ price: 49 }) }), // 20 * 49 = 980 spent
    ]);
    expect(stat.buyingPower).toBe(stat.remaining - stat.rosterRemaining);
    expect(stat.buyingPower).toBeLessThan(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
pnpm test -- --testPathPattern="budget.test" --no-coverage
```

Expected: FAIL — `Cannot find module '@/lib/budget'`

- [ ] **Step 3: Implement computeTeamStats**

Create `src/lib/budget.ts`:

```ts
import type { TeamStats } from '@/types';
import { ROSTER_SIZE } from '@/lib/teams';

type TeamWithResults = {
  id: number;
  handle: string;
  displayName: string | null;
  budget: number;
  results: { price: number }[];
};

export function computeTeamStats(teams: TeamWithResults[]): TeamStats[] {
  return teams
    .map((team) => {
      const spent = team.results.reduce((s, r) => s + r.price, 0);
      const remaining = team.budget - spent;
      const rosterCount = team.results.length;
      const rosterRemaining = ROSTER_SIZE - rosterCount;
      const buyingPower = remaining - rosterRemaining;
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
      };
    })
    .sort((a, b) => b.buyingPower - a.buyingPower);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test -- --testPathPattern="budget.test" --no-coverage
```

Expected: PASS — 5 tests pass

- [ ] **Step 5: Commit**

```bash
git add src/lib/budget.ts src/__tests__/lib/budget.test.ts
git commit -m "feat: add computeTeamStats helper with buying power math"
```

---

### Task 3: BudgetRefresher client component

**Files:**

- Create: `src/components/BudgetPressure/BudgetRefresher.tsx`
- Test: `src/__tests__/components/BudgetRefresher.test.tsx`

**Interfaces:**

- Consumes: `useRouter` from `next/navigation`
- Produces: `<BudgetRefresher intervalMs={number} />` — renders elapsed counter + refresh button; calls `router.refresh()` automatically and on button click

---

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/components/BudgetRefresher.test.tsx`:

```tsx
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BudgetRefresher from '@/components/BudgetPressure/BudgetRefresher';

const mockRefresh = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

beforeEach(() => {
  jest.useFakeTimers();
  mockRefresh.mockClear();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('BudgetRefresher', () => {
  it('renders the elapsed counter starting at 0', () => {
    render(<BudgetRefresher intervalMs={20000} />);
    expect(screen.getByText('Updated 0s ago')).toBeInTheDocument();
  });

  it('increments elapsed counter every second', () => {
    render(<BudgetRefresher intervalMs={20000} />);
    act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(screen.getByText('Updated 5s ago')).toBeInTheDocument();
  });

  it('calls router.refresh() and resets counter after intervalMs', () => {
    render(<BudgetRefresher intervalMs={20000} />);
    act(() => {
      jest.advanceTimersByTime(20000);
    });
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Updated 0s ago')).toBeInTheDocument();
  });

  it('calls router.refresh() on manual refresh button click', async () => {
    render(<BudgetRefresher intervalMs={20000} />);
    await userEvent.click(screen.getByRole('button', { name: /refresh/i }));
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it('resets elapsed counter on manual refresh', async () => {
    render(<BudgetRefresher intervalMs={20000} />);
    act(() => {
      jest.advanceTimersByTime(10000);
    });
    await userEvent.click(screen.getByRole('button', { name: /refresh/i }));
    expect(screen.getByText('Updated 0s ago')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
pnpm test -- --testPathPattern="BudgetRefresher" --no-coverage
```

Expected: FAIL — `Cannot find module '@/components/BudgetPressure/BudgetRefresher'`

- [ ] **Step 3: Implement BudgetRefresher**

Create `src/components/BudgetPressure/BudgetRefresher.tsx`:

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';

interface BudgetRefresherProps {
  intervalMs?: number;
}

export default function BudgetRefresher({ intervalMs = 20000 }: BudgetRefresherProps) {
  const router = useRouter();
  const [elapsed, setElapsed] = useState(0);
  const intervalSecs = intervalMs / 1000;

  const doRefresh = useCallback(() => {
    router.refresh();
    setElapsed(0);
  }, [router]);

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsed((e) => {
        if (e + 1 >= intervalSecs) {
          router.refresh();
          return 0;
        }
        return e + 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [router, intervalSecs]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span
        style={{
          fontSize: 10,
          color: '#4a5168',
          fontFamily: 'var(--font-mono), monospace',
        }}
      >
        Updated {elapsed}s ago
      </span>
      <button
        onClick={doRefresh}
        style={{
          padding: '3px 8px',
          fontSize: 10,
          background: 'transparent',
          border: '1px solid #2a3048',
          borderRadius: 4,
          color: '#4a5168',
          cursor: 'pointer',
        }}
      >
        Refresh
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test -- --testPathPattern="BudgetRefresher" --no-coverage
```

Expected: PASS — 5 tests pass

- [ ] **Step 5: Commit**

```bash
git add src/components/BudgetPressure/BudgetRefresher.tsx src/__tests__/components/BudgetRefresher.test.tsx
git commit -m "feat: add BudgetRefresher with 20s auto-refresh and manual button"
```

---

### Task 4: BudgetPressureView component

**Files:**

- Create: `src/components/BudgetPressure/BudgetPressureView.tsx`
- Create: `src/components/BudgetPressure/index.ts`
- Test: `src/__tests__/components/BudgetPressureView.test.tsx`

**Interfaces:**

- Consumes: `TeamStats` from `@/types`, `BudgetRefresher` from `./BudgetRefresher`
- Produces: `<BudgetPressureView teams={TeamStats[]} />` — renders full page header + table

---

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/components/BudgetPressureView.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import BudgetPressureView from '@/components/BudgetPressure/BudgetPressureView';
import type { TeamStats } from '@/types';

jest.mock('@/components/BudgetPressure/BudgetRefresher', () => ({
  default: () => <div data-testid="budget-refresher" />,
}));

const makeTeam = (overrides: Partial<TeamStats>): TeamStats => ({
  id: 1,
  handle: 'testteam',
  displayName: null,
  budget: 1000,
  spent: 0,
  remaining: 1000,
  rosterCount: 0,
  rosterRemaining: 30,
  buyingPower: 970,
  ...overrides,
});

const teams: TeamStats[] = [
  makeTeam({
    id: 1,
    handle: 'coreschke',
    displayName: 'Cole',
    buyingPower: 800,
    remaining: 830,
    spent: 170,
    rosterCount: 5,
    rosterRemaining: 25,
  }),
  makeTeam({
    id: 2,
    handle: 'chappy72',
    buyingPower: 500,
    remaining: 530,
    spent: 470,
    rosterCount: 8,
    rosterRemaining: 22,
  }),
  makeTeam({
    id: 3,
    handle: 'DrFunk',
    buyingPower: 30,
    remaining: 60,
    spent: 940,
    rosterCount: 28,
    rosterRemaining: 2,
  }),
];

describe('BudgetPressureView', () => {
  it('renders a row for each team', () => {
    render(<BudgetPressureView teams={teams} />);
    expect(screen.getByText('Cole')).toBeInTheDocument();
    expect(screen.getByText('chappy72')).toBeInTheDocument();
    expect(screen.getByText('DrFunk')).toBeInTheDocument();
  });

  it('displays handle when displayName is null', () => {
    render(<BudgetPressureView teams={teams} />);
    expect(screen.getByText('chappy72')).toBeInTheDocument();
  });

  it('renders rank numbers starting at 1', () => {
    render(<BudgetPressureView teams={teams} />);
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('applies green color to buying power > 150', () => {
    render(<BudgetPressureView teams={teams} />);
    const bpCell = screen.getByTestId('bp-1');
    expect(bpCell).toHaveStyle({ color: '#4caf6e' });
  });

  it('applies amber color to buying power between 50 and 150', () => {
    render(<BudgetPressureView teams={teams} />);
    const bpCell = screen.getByTestId('bp-2');
    expect(bpCell).toHaveStyle({ color: '#e8a030' });
  });

  it('applies red color to buying power under 50', () => {
    render(<BudgetPressureView teams={teams} />);
    const bpCell = screen.getByTestId('bp-3');
    expect(bpCell).toHaveStyle({ color: '#e05050' });
  });

  it("highlights Cole's row with QB-blue left border", () => {
    render(<BudgetPressureView teams={teams} />);
    const coleRow = screen.getByTestId('row-coreschke');
    expect(coleRow).toHaveStyle({ borderLeft: '3px solid #4f83e8' });
  });

  it('renders the BudgetRefresher', () => {
    render(<BudgetPressureView teams={teams} />);
    expect(screen.getByTestId('budget-refresher')).toBeInTheDocument();
  });

  it('renders dollar signs for monetary values', () => {
    render(<BudgetPressureView teams={teams} />);
    expect(screen.getByText('$800')).toBeInTheDocument(); // Cole's buying power
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
pnpm test -- --testPathPattern="BudgetPressureView" --no-coverage
```

Expected: FAIL — `Cannot find module '@/components/BudgetPressure/BudgetPressureView'`

- [ ] **Step 3: Implement BudgetPressureView**

Create `src/components/BudgetPressure/BudgetPressureView.tsx`:

```tsx
import type { TeamStats } from '@/types';
import BudgetRefresher from './BudgetRefresher';

function buyingPowerColor(bp: number): string {
  if (bp > 150) return '#4caf6e';
  if (bp >= 50) return '#e8a030';
  return '#e05050';
}

interface BudgetPressureViewProps {
  teams: TeamStats[];
}

export default function BudgetPressureView({ teams }: BudgetPressureViewProps) {
  const maxBp = Math.max(...teams.map((t) => t.buyingPower), 1);

  return (
    <div
      style={{
        fontFamily: 'var(--font-inter), "Inter", sans-serif',
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
          12-Team · Superflex · $1,000 Budget · 30-Man Rosters
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 10,
          }}
        >
          <h1
            style={{
              margin: 0,
              fontSize: 20,
              fontWeight: 700,
              color: '#fff',
              letterSpacing: -0.5,
              fontFamily: 'var(--font-barlow), sans-serif',
            }}
          >
            Budget Pressure
          </h1>
          <BudgetRefresher intervalMs={20000} />
        </div>
        <div style={{ fontSize: 11, color: '#4a5168', marginTop: 2 }}>
          Buying power = remaining − remaining roster spots · sorted by most dangerous bidder
        </div>
      </div>

      {/* Table */}
      <div style={{ padding: '0 20px 40px', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 6 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #2a3048' }}>
              {['#', 'Team', 'Spent', 'Remaining', 'Roster', 'Buying Power'].map((col) => (
                <th
                  key={col}
                  style={{
                    padding: '9px 10px',
                    textAlign: col === 'Team' || col === 'Buying Power' ? 'left' : 'center',
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: 1,
                    color: '#4a5168',
                    textTransform: 'uppercase',
                    whiteSpace: 'nowrap',
                    fontFamily: 'var(--font-barlow), sans-serif',
                  }}
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {teams.map((team, i) => {
              const isCole = team.handle === 'coreschke';
              const bpColor = buyingPowerColor(team.buyingPower);
              const barWidth = maxBp > 0 ? Math.max(0, (team.buyingPower / maxBp) * 100) : 0;

              return (
                <tr
                  key={team.id}
                  data-testid={`row-${team.handle}`}
                  style={{
                    borderBottom: '1px solid #141824',
                    background: isCole ? '#141e2e' : i % 2 === 0 ? 'transparent' : '#0a0c10',
                    borderLeft: `3px solid ${isCole ? '#4f83e8' : '#2a3048'}`,
                  }}
                >
                  <td
                    style={{
                      padding: '10px 10px',
                      textAlign: 'center',
                      fontSize: 11,
                      color: '#4a5168',
                      fontFamily: 'var(--font-mono), monospace',
                    }}
                  >
                    {i + 1}
                  </td>
                  <td style={{ padding: '10px 10px', textAlign: 'left' }}>
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: isCole ? 700 : 500,
                        color: isCole ? '#e8eaf0' : '#8892a4',
                      }}
                    >
                      {team.displayName ?? team.handle}
                    </span>
                  </td>
                  <td
                    style={{
                      padding: '10px 10px',
                      textAlign: 'center',
                      fontSize: 12,
                      color: '#8892a4',
                      fontFamily: 'var(--font-mono), monospace',
                    }}
                  >
                    ${team.spent}
                  </td>
                  <td
                    style={{
                      padding: '10px 10px',
                      textAlign: 'center',
                      fontSize: 12,
                      color: '#e8eaf0',
                      fontFamily: 'var(--font-mono), monospace',
                    }}
                  >
                    ${team.remaining}
                  </td>
                  <td
                    style={{
                      padding: '10px 10px',
                      textAlign: 'center',
                      fontSize: 12,
                      color: '#8892a4',
                      fontFamily: 'var(--font-mono), monospace',
                    }}
                  >
                    {team.rosterCount} / 30
                  </td>
                  <td style={{ padding: '10px 10px', minWidth: 180 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span
                        data-testid={`bp-${i + 1}`}
                        style={{
                          fontSize: 15,
                          fontWeight: 700,
                          color: bpColor,
                          fontFamily: 'var(--font-mono), monospace',
                          minWidth: 60,
                        }}
                      >
                        ${team.buyingPower}
                      </span>
                      <div
                        style={{
                          flex: 1,
                          height: 6,
                          background: '#1a1f2e',
                          borderRadius: 3,
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            width: `${barWidth}%`,
                            height: '100%',
                            background: bpColor,
                            borderRadius: 3,
                            opacity: 0.75,
                          }}
                        />
                      </div>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create barrel export**

Create `src/components/BudgetPressure/index.ts`:

```ts
export { default } from './BudgetPressureView';
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
pnpm test -- --testPathPattern="BudgetPressureView" --no-coverage
```

Expected: PASS — 9 tests pass

- [ ] **Step 6: Commit**

```bash
git add src/components/BudgetPressure/ src/__tests__/components/BudgetPressureView.test.tsx
git commit -m "feat: add BudgetPressureView with buying power table and bar visualization"
```

---

### Task 5: Budget page wiring + full quality gate

**Files:**

- Create: `src/app/budget/page.tsx`

**Interfaces:**

- Consumes: `db` from `@/lib/db`, `computeTeamStats` from `@/lib/budget`, `BudgetPressureView` from `@/components/BudgetPressure`
- Produces: Next.js page at `/budget`

---

- [ ] **Step 1: Create the budget page**

Create `src/app/budget/page.tsx`:

```tsx
import { db } from '@/lib/db';
import { computeTeamStats } from '@/lib/budget';
import BudgetPressureView from '@/components/BudgetPressure';

export default async function BudgetPage() {
  const teams = await db.team.findMany({ include: { results: true } });
  const teamStats = computeTeamStats(teams);
  return <BudgetPressureView teams={teamStats} />;
}
```

- [ ] **Step 2: Run the full quality gate**

```bash
make check
```

Expected output: typecheck passes, lint passes, format passes, all tests pass. If Prettier reformats any file, stage and amend — but do NOT skip the hook.

- [ ] **Step 3: Commit**

```bash
git add src/app/budget/page.tsx
git commit -m "feat: add /budget page wiring Prisma data to BudgetPressureView"
```

---

## Self-Review

**Spec coverage:**

- ✅ Separate page at `/budget`
- ✅ DB-backed from day one via Prisma in RSC
- ✅ Auto-refresh every 20s via `router.refresh()` + manual button
- ✅ Shared nav strip in `layout.tsx` extensible for future pages
- ✅ 12-row table sorted by buying power descending
- ✅ Rank, Team, Spent, Remaining, Roster, Buying Power columns
- ✅ Buying power bar proportional to max in dataset
- ✅ Green/amber/red color thresholds at >$150 / $50–$150 / <$50
- ✅ Cole's row (`coreschke`) highlighted with QB-blue left border
- ✅ `displayName` used when set, `handle` as fallback
- ✅ No API route — Prisma called directly in RSC

**Placeholder scan:** No TBDs or TODOs. All code steps contain full implementations.

**Type consistency:** `TeamStats` type from `@/types/index.ts` used consistently across `budget.ts`, `BudgetPressureView.tsx`, and `page.tsx`. `TeamWithResults` in `budget.ts` is a local structural type — it matches what Prisma returns from `findMany({ include: { results: true } })`.
