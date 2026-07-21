# HARD-015: Address accessibility and contrast defects — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the accessibility gaps identified in `docs/draftops-audit-workstreams.md` (HARD-015): missing skip-link/landmark strategy, unlabeled search inputs, a non-semantic clickable table row, silent async flows, sub-4.5:1 text contrast on two semantic tokens, undersized touch targets, incomplete reduced-motion coverage, and no automated axe/keyboard-flow regression coverage.

**Architecture:** Each defect category gets its own self-contained task with its own test. Tokens are fixed at the CSS-custom-property level (one change point, not per-component overrides). The existing `MutationStatus` live-region component (shipped in HARD-010) is reused rather than duplicated for the three async flows that currently have no announcement. A new shared test-fixture helper (created in Task 2) is reused by Task 10's axe suite so both tasks render the same four critical routes/components from one source of truth.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind CSS 4 (`@theme inline` tokens in `src/app/globals.css`), `class-variance-authority` for the `Button`/`Toggle` primitives, Jest 30 + React Testing Library + `jest-axe` (new dependency, added in Task 10).

## Global Constraints

- Every task must leave `pnpm test` green with zero new failures before its commit.
- Do not touch files flagged for other backlog items in the same audit doc: `BudgetPressureView.tsx`'s hardcoded "$1,000 Budget" string and `RosterTracker.tsx`'s hardcoded "Superflex" string belong to HARD-016 (truthful settings labels) — leave them as-is.
- Do not add a nav/`<header>` landmark to `NavBar` — HARD-015's own implementation direction only calls for a skip link + one `<main>` per route; adding unrequested landmark restructuring is out of scope.
- Follow existing repo conventions: `data-testid` selectors in tests (not text/role-by-name where a testid already exists on the element), single quotes, 2-space indent, `interface` for prop shapes.
- Run `pnpm tsc --noEmit` and `pnpm lint` before considering any task's commit final — both must be clean.

---

### Task 1: Fix semantic token contrast (`--text-muted`, `--destructive`/`--age-old`) and add a regression test

The audit found `--text-muted` (aliased to `--muted-foreground`) and `--age-old` (aliased to `--destructive`) both render as normal-sized text directly on app backgrounds (`text-muted-foreground` labels/values across `AuctionHeader`, `ThreatBoard`, `NominationTable`, etc.; `text-destructive`/`ageColor()` error and age-band text in `SleeperRosterSyncDialog`, `BidModal`, `PlayerTable`, `DossierFace`) and both fail 4.5:1 against every app background (`--bg-base`, `--bg-surface`, `--bg-elevated`). A fifth hardcoded copy of the old error red (`#e05050`) exists outside the token system in `ErrorText.tsx`, `error.tsx`, `global-error.tsx`, and twice in `drafts/new/page.tsx`.

**Files:**

- Create: `src/lib/contrastRatio.ts`
- Create: `src/lib/__tests__/contrastRatio.test.ts`
- Create: `src/lib/__tests__/tokenContrast.test.ts`
- Modify: `src/app/globals.css:15,27`
- Modify: `src/components/RankingsUpload/ErrorText.tsx:10`
- Modify: `src/app/error.tsx:31`
- Modify: `src/app/global-error.tsx:32`
- Modify: `src/app/drafts/new/page.tsx:382,902`

**Interfaces:**

- Produces: `contrastRatio(hexA: string, hexB: string): number` — pure WCAG relative-luminance contrast ratio, exported from `src/lib/contrastRatio.ts`. No other task consumes this.

- [ ] **Step 1: Write the failing contrast-ratio unit test**

```typescript
// src/lib/__tests__/contrastRatio.test.ts
import { contrastRatio } from '../contrastRatio';

describe('contrastRatio', () => {
  it('returns 21:1 for pure black on pure white', () => {
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 0);
  });

  it('returns 1:1 for identical colors', () => {
    expect(contrastRatio('#334455', '#334455')).toBeCloseTo(1, 5);
  });

  it('is symmetric regardless of argument order', () => {
    const a = contrastRatio('#e8eaf0', '#141824');
    const b = contrastRatio('#141824', '#e8eaf0');
    expect(a).toBeCloseTo(b, 10);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test contrastRatio.test.ts`
Expected: FAIL — `Cannot find module '../contrastRatio'`

- [ ] **Step 3: Implement the contrast-ratio utility**

```typescript
// src/lib/contrastRatio.ts
function srgbChannelToLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (
    0.2126 * srgbChannelToLinear(r) +
    0.7152 * srgbChannelToLinear(g) +
    0.0722 * srgbChannelToLinear(b)
  );
}

/** WCAG 2.x relative-luminance contrast ratio between two `#rrggbb` colors, from 1 (no contrast) to 21 (black/white). */
export function contrastRatio(hexA: string, hexB: string): number {
  const lA = relativeLuminance(hexA);
  const lB = relativeLuminance(hexB);
  const lighter = Math.max(lA, lB);
  const darker = Math.min(lA, lB);
  return (lighter + 0.05) / (darker + 0.05);
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm test contrastRatio.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Write the failing token-contrast regression test**

This parses the real `globals.css` so the test fails now (current tokens are below 4.5:1) and keeps failing forever if someone regresses the tokens later.

```typescript
// src/lib/__tests__/tokenContrast.test.ts
import fs from 'fs';
import path from 'path';
import { contrastRatio } from '../contrastRatio';

const css = fs.readFileSync(path.resolve(__dirname, '../../app/globals.css'), 'utf-8');

function tokenHex(name: string): string {
  const match = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!match) throw new Error(`Token --${name} not found in globals.css`);
  return match[1];
}

const WCAG_AA_NORMAL_TEXT = 4.5;
const BACKGROUND_TOKENS = ['bg-base', 'bg-surface', 'bg-elevated'];

describe('semantic token contrast (WCAG AA, normal text)', () => {
  it.each(BACKGROUND_TOKENS)('--text-muted meets 4.5:1 against --%s', (bgName) => {
    const ratio = contrastRatio(tokenHex('text-muted'), tokenHex(bgName));
    expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
  });

  it.each(BACKGROUND_TOKENS)(
    '--age-old (aliased to --destructive) meets 4.5:1 against --%s',
    (bgName) => {
      const ratio = contrastRatio(tokenHex('age-old'), tokenHex(bgName));
      expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
    },
  );
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `pnpm test tokenContrast.test.ts`
Expected: FAIL — both `it.each` blocks fail (`--text-muted` measures ~3.3–3.8:1, `--age-old` measures ~2.5–2.8:1 depending on background)

- [ ] **Step 7: Fix the two token values**

In `src/app/globals.css`, change:

```css
--text-muted: #687066;
```

to:

```css
--text-muted: #838980;
```

and change:

```css
--age-old: #9f363c;
```

to:

```css
--age-old: #f87171;
```

(`#838980` measures ~4.71:1 against `--bg-elevated`, the worst-case background — chosen to stay in the same muted sage-gray family as the passing `--text-secondary: #a8ada4`, just one step darker, rather than introducing a neutral gray foreign to the palette. `#f87171` — Tailwind's "red-400", a widely-used, well-tested dark-theme danger red — measures ~6.1:1 against the same background, comfortably clearing 4.5:1 with margin to spare rather than landing right at the line. Both pass with even more margin on the two darker backgrounds.)

- [ ] **Step 8: Run it to verify it passes**

Run: `pnpm test tokenContrast.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 9: Fold the hardcoded error-red copies into the fixed token**

The old `#e05050` was never contrast-checked and is now redundant with the fixed `--destructive`. Replace all five occurrences with `var(--destructive)`:

In `src/components/RankingsUpload/ErrorText.tsx:10`, change:

```typescript
  color: '#e05050',
```

to:

```typescript
  color: 'var(--destructive)',
```

In `src/app/error.tsx:31`, change:

```tsx
      <div style={{ fontSize: 14, color: '#e05050', fontWeight: 600 }}>
```

to:

```tsx
      <div style={{ fontSize: 14, color: 'var(--destructive)', fontWeight: 600 }}>
```

In `src/app/global-error.tsx:32`, change:

```tsx
<div style={{ fontSize: 14, color: '#e05050', fontWeight: 600 }}>Something went wrong</div>
```

to:

```tsx
<div style={{ fontSize: 14, color: 'var(--destructive)', fontWeight: 600 }}>
  Something went wrong
</div>
```

In `src/app/drafts/new/page.tsx`, both occurrences at lines 382 and 902 are the identical line `color: '#e05050',` inside inline style objects — replace both with `color: 'var(--destructive)',`.

- [ ] **Step 10: Run the full suite to confirm no regressions**

Run: `pnpm test`
Expected: PASS — same suite/test counts as the Task 1 baseline plus the 9 new tests from this task, 0 failures

- [ ] **Step 11: Typecheck and lint**

Run: `pnpm tsc --noEmit && pnpm lint`
Expected: both clean

- [ ] **Step 12: Commit**

```bash
git add src/lib/contrastRatio.ts src/lib/__tests__/contrastRatio.test.ts src/lib/__tests__/tokenContrast.test.ts src/app/globals.css src/components/RankingsUpload/ErrorText.tsx src/app/error.tsx src/app/global-error.tsx src/app/drafts/new/page.tsx
git commit -m "HARD-015: fix muted/destructive token contrast to meet WCAG AA on all backgrounds"
```

---

### Task 2: Add a skip link and one `<main>` landmark per route

The audit found no skip link anywhere in the app, and only 3 of ~9 routes (`drafts/new`, `drafts`, `rankings`) have a `<main>` landmark. The four highest-traffic draft-workflow routes — value sheet (`AuctionSheet`), nominate (`NominationHelper`), budget (`BudgetPressureView`), teams (`RosterTracker`) — have none, nor does `/sign-in`.

**Files:**

- Create: `src/components/SkipLink.tsx`
- Create: `src/__tests__/helpers/criticalRouteFixtures.tsx`
- Create: `src/__tests__/criticalRouteLandmarks.test.tsx`
- Modify: `src/app/layout.tsx`
- Modify: `src/components/AuctionSheet/AuctionSheet.tsx:350`
- Modify: `src/components/NominationHelper/NominationHelper.tsx:257-262`
- Modify: `src/components/RosterTracker/RosterTracker.tsx:155-162`
- Modify: `src/components/BudgetPressure/BudgetPressureView.tsx:24-25`
- Modify: `src/components/SignIn/SignInScreen.tsx:10-11`
- Modify: `src/app/drafts/new/page.tsx:294`
- Modify: `src/app/drafts/page.tsx:32`
- Modify: `src/app/rankings/page.tsx:33`

**Interfaces:**

- Produces: `src/__tests__/helpers/criticalRouteFixtures.tsx` exporting `auctionSheetProps()`, `budgetPressureViewProps()`, `rosterTrackerProps()`, `nominationHelperProps()` — plain prop-object factories (no rendering, no mocks) for the four critical components. Task 10 imports these directly.

- [ ] **Step 1: Create the shared fixture helper**

```tsx
// src/__tests__/helpers/criticalRouteFixtures.tsx
import type { Player, ClaimedBid, LeagueTeam, TeamStats, TeamWithRoster } from '@/types';
import { DEFAULT_SCORING_SETTINGS } from '@/types';
import type { ManagerTendency, Appetite, AppetitePos } from '@/lib/tendencies';

export const FIXTURE_PLAYERS: Player[] = [
  {
    id: 10,
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
];

export const FIXTURE_TEAMS: LeagueTeam[] = [{ id: 1, handle: 'coreschke', displayName: 'Cole' }];

function fixturePositionTendency(position: AppetitePos, appetite: Appetite) {
  return {
    position,
    buys: 3,
    spend: 0,
    valueSum: 0,
    deltaSum: 0,
    avgDelta: null,
    overPct: null,
    spendShare: 0,
    appetite,
  };
}

function fixtureManagerTendency(teamId: number, handle: string): ManagerTendency {
  return {
    teamId,
    handle,
    displayName: handle,
    buys: 5,
    totalSpend: 500,
    totalValue: 480,
    overallOverPct: 0.04,
    topBuy: 120,
    lean: 'balanced',
    aggression: 'neutral',
    positions: {
      QB: fixturePositionTendency('QB', 'neutral'),
      RB: fixturePositionTendency('RB', 'neutral'),
      WR: fixturePositionTendency('WR', 'neutral'),
      TE: fixturePositionTendency('TE', 'neutral'),
    },
  };
}

export function auctionSheetProps() {
  return {
    players: FIXTURE_PLAYERS,
    claimedBids: [] as ClaimedBid[],
    teams: FIXTURE_TEAMS,
    nominatedPlayers: [] as string[],
    draftId: 1,
    ownerHandle: 'coreschke',
    ownerBudget: 1000,
    scoringSettings: { ...DEFAULT_SCORING_SETTINGS },
  };
}

export function budgetPressureViewProps() {
  const teams: TeamStats[] = [
    {
      id: 1,
      handle: 'coreschke',
      displayName: 'coreschke',
      budget: 1000,
      spent: 0,
      remaining: 680,
      rosterCount: 5,
      rosterRemaining: 20,
      buyingPower: 660,
      pkgCount: 0,
      avgAge: null,
    },
  ];
  return {
    teams,
    tendencies: [fixtureManagerTendency(1, 'coreschke')],
    livePosition: null,
    liveName: null,
    ownerHandle: 'coreschke',
  };
}

export function rosterTrackerProps() {
  const team: TeamWithRoster = {
    id: 1,
    handle: 'coreschke',
    displayName: 'Cole',
    budget: 1000,
    spent: 110,
    remaining: 890,
    rosterCount: 1,
    rosterRemaining: 29,
    buyingPower: 860,
    pkgCount: 0,
    avgAge: null,
    results: [
      {
        id: 1,
        playerId: 10,
        player: 'Josh Allen',
        position: 'QB',
        nflTeam: 'BUF',
        price: 110,
        sfRank: 1,
        teamId: 1,
        teamHandle: 'coreschke',
        delta: -10,
      },
    ],
  };
  return {
    teams: [team],
    tendencies: [fixtureManagerTendency(1, 'coreschke')],
    ownerHandle: 'coreschke',
  };
}

export function nominationHelperProps() {
  return { draftId: 1, players: FIXTURE_PLAYERS };
}
```

- [ ] **Step 2: Write the failing landmark test**

```tsx
// src/__tests__/criticalRouteLandmarks.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import SkipLink from '@/components/SkipLink';
import AuctionSheet from '@/components/AuctionSheet/AuctionSheet';
import NominationHelper from '@/components/NominationHelper/NominationHelper';
import RosterTracker from '@/components/RosterTracker/RosterTracker';
import BudgetPressureView from '@/components/BudgetPressure/BudgetPressureView';
import {
  auctionSheetProps,
  budgetPressureViewProps,
  rosterTrackerProps,
  nominationHelperProps,
} from './helpers/criticalRouteFixtures';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: jest.fn(), replace: jest.fn() }),
}));

jest.mock('@/lib/actions', () => ({
  logBid: jest.fn(),
  updateBid: jest.fn(),
  deleteBid: jest.fn(),
}));

jest.mock('@/components/Onboarding/OnboardingContext', () => ({
  useOnboarding: () => ({
    progress: null,
    recordBidLogged: jest.fn().mockResolvedValue(undefined),
    recordPlayerNominated: jest.fn().mockResolvedValue(undefined),
  }),
}));

jest.mock('@/components/BudgetPressure/BudgetRefresher', () => ({
  __esModule: true,
  default: () => <div data-testid="budget-refresher" />,
}));

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      teamStats: [],
      auctionResults: [],
      watchlist: [],
      nominated: [],
      ownerHandle: null,
      targetRoster: { QB: 4, RB: 9, WR: 11, TE: 3 },
    }),
  } as Response);
});

describe('critical route landmarks', () => {
  it('renders a skip link targeting #main-content', () => {
    render(<SkipLink />);
    const link = screen.getByRole('link', { name: /skip to main content/i });
    expect(link).toHaveAttribute('href', '#main-content');
  });

  it('AuctionSheet renders exactly one main landmark with id="main-content"', () => {
    render(<AuctionSheet {...auctionSheetProps()} />);
    const mains = screen.getAllByRole('main');
    expect(mains).toHaveLength(1);
    expect(mains[0]).toHaveAttribute('id', 'main-content');
  });

  it('BudgetPressureView renders exactly one main landmark with id="main-content"', () => {
    render(<BudgetPressureView {...budgetPressureViewProps()} />);
    const mains = screen.getAllByRole('main');
    expect(mains).toHaveLength(1);
    expect(mains[0]).toHaveAttribute('id', 'main-content');
  });

  it('RosterTracker renders exactly one main landmark with id="main-content"', () => {
    render(<RosterTracker {...rosterTrackerProps()} />);
    const mains = screen.getAllByRole('main');
    expect(mains).toHaveLength(1);
    expect(mains[0]).toHaveAttribute('id', 'main-content');
  });

  it('NominationHelper renders exactly one main landmark with id="main-content"', async () => {
    render(<NominationHelper {...nominationHelperProps()} />);
    await waitFor(() => expect(screen.getByText('Nomination Helper')).toBeInTheDocument());
    const mains = screen.getAllByRole('main');
    expect(mains).toHaveLength(1);
    expect(mains[0]).toHaveAttribute('id', 'main-content');
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm test criticalRouteLandmarks.test.ts`
Expected: FAIL — `Cannot find module '@/components/SkipLink'`, then (once that's stubbed) `getAllByRole('main')` returns an empty array for all four components

- [ ] **Step 4: Create the skip link component**

```tsx
// src/components/SkipLink.tsx
export default function SkipLink() {
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-foreground"
    >
      Skip to main content
    </a>
  );
}
```

- [ ] **Step 5: Wire the skip link into the root layout**

In `src/app/layout.tsx`, add the import:

```typescript
import SkipLink from '@/components/SkipLink';
```

and render it as the first child of `<body>`:

```tsx
<body style={{ fontFamily: 'var(--font-inter), sans-serif' }}>
  <SkipLink />
  <NavBarGate>
    <NavBar session={session} />
  </NavBarGate>
  {children}
</body>
```

- [ ] **Step 6: Add the landmark to the four delegate components**

In `src/components/AuctionSheet/AuctionSheet.tsx:350`, change:

```tsx
    <div className="min-h-screen bg-background text-foreground">
```

to:

```tsx
    <main id="main-content" className="min-h-screen bg-background text-foreground">
```

and change the matching closing `</div>` at the end of this component's return to `</main>`.

In `src/components/BudgetPressure/BudgetPressureView.tsx:25`, change:

```tsx
    <div className="min-h-screen bg-background text-foreground">
```

to:

```tsx
    <main id="main-content" className="min-h-screen bg-background text-foreground">
```

and change its matching closing `</div>` to `</main>`.

In `src/components/RosterTracker/RosterTracker.tsx:156-162`, change:

```tsx
    <div
      className={
        isDesktop
          ? 'flex h-[calc(100vh-3.5rem)] flex-col bg-background text-foreground'
          : 'min-h-screen bg-background text-foreground'
      }
    >
```

to:

```tsx
    <main
      id="main-content"
      className={
        isDesktop
          ? 'flex h-[calc(100vh-3.5rem)] flex-col bg-background text-foreground'
          : 'min-h-screen bg-background text-foreground'
      }
    >
```

and change its matching closing `</div>` to `</main>`.

In `src/components/NominationHelper/NominationHelper.tsx:257-262`, change:

```tsx
    <div
      data-testid="nomination-helper-layout"
      data-onboarding-nomination-state="ready"
      className="flex min-h-screen flex-col bg-background text-foreground md:flex-row"
    >
```

to:

```tsx
    <main
      id="main-content"
      data-testid="nomination-helper-layout"
      data-onboarding-nomination-state="ready"
      className="flex min-h-screen flex-col bg-background text-foreground md:flex-row"
    >
```

and change its matching closing `</div>` to `</main>`.

- [ ] **Step 7: Add the landmark to SignInScreen and add `id="main-content"` to the existing `<main>` tags**

In `src/components/SignIn/SignInScreen.tsx:10-11`, change:

```tsx
  return (
    <div className="bg-background flex h-screen flex-col overflow-y-auto md:flex-row md:overflow-hidden">
```

to:

```tsx
  return (
    <main
      id="main-content"
      className="bg-background flex h-screen flex-col overflow-y-auto md:flex-row md:overflow-hidden"
    >
```

and change its matching closing `</div>` to `</main>`.

In `src/app/drafts/new/page.tsx:294`, change:

```tsx
    <main style={{ padding: '2rem', maxWidth: '680px', margin: '0 auto' }}>
```

to:

```tsx
    <main id="main-content" style={{ padding: '2rem', maxWidth: '680px', margin: '0 auto' }}>
```

In `src/app/drafts/page.tsx:32`, change:

```tsx
    <main style={{ padding: '2rem', maxWidth: '720px', margin: '0 auto' }}>
```

to:

```tsx
    <main id="main-content" style={{ padding: '2rem', maxWidth: '720px', margin: '0 auto' }}>
```

In `src/app/rankings/page.tsx:33`, change:

```tsx
    <main style={{ padding: '2rem', maxWidth: '720px', margin: '0 auto' }}>
```

to:

```tsx
    <main id="main-content" style={{ padding: '2rem', maxWidth: '720px', margin: '0 auto' }}>
```

- [ ] **Step 8: Run it to verify it passes**

Run: `pnpm test criticalRouteLandmarks.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 9: Run the full suite to confirm no regressions**

Run: `pnpm test`
Expected: PASS — 0 failures. Pay attention to any test asserting the outer wrapper's tag name or querying `container.firstChild` directly on `AuctionSheet`/`NominationHelper`/`RosterTracker`/`BudgetPressureView`/`SignInScreen` — none of the existing test files read above do this (they all use `getByTestId`/`getByText`/`getByRole`), so none should break, but re-run to confirm.

- [ ] **Step 10: Typecheck and lint**

Run: `pnpm tsc --noEmit && pnpm lint`
Expected: both clean

- [ ] **Step 11: Commit**

```bash
git add src/components/SkipLink.tsx src/__tests__/helpers/criticalRouteFixtures.tsx src/__tests__/criticalRouteLandmarks.test.tsx src/app/layout.tsx src/components/AuctionSheet/AuctionSheet.tsx src/components/NominationHelper/NominationHelper.tsx src/components/RosterTracker/RosterTracker.tsx src/components/BudgetPressure/BudgetPressureView.tsx src/components/SignIn/SignInScreen.tsx src/app/drafts/new/page.tsx src/app/drafts/page.tsx src/app/rankings/page.tsx
git commit -m "HARD-015: add skip link and one main landmark per route"
```

---

### Task 3: Add explicit accessible names to placeholder-only search inputs

Four search inputs rely solely on a visual placeholder with no `<label>`, `aria-label`, or `aria-labelledby`: the value-sheet player/team search, the rankings "missing from ETR" filter, the watchlist add-player search, and the rankings unmatched-row resolver search.

**Files:**

- Modify: `src/components/AuctionSheet/FilterControls.tsx:93-98`
- Modify: `src/components/RankingsUpload/MissingFromEtrList.tsx:52-58`
- Modify: `src/components/NominationHelper/WatchlistSidebar.tsx:146-150`
- Modify: `src/components/RankingsUpload/ResolveUnmatchedList.tsx:114-119`
- Test: `src/__tests__/searchInputLabels.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/__tests__/searchInputLabels.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import FilterControls from '@/components/AuctionSheet/FilterControls';
import MissingFromEtrList from '@/components/RankingsUpload/MissingFromEtrList';

describe('search input accessible names', () => {
  it('FilterControls player/team search has an accessible name', () => {
    render(
      <FilterControls
        posFilter="ALL"
        onPosFilterChange={jest.fn()}
        search=""
        onSearchChange={jest.fn()}
        showNotes={false}
        onShowNotesChange={jest.fn()}
        availableOnly={false}
        onAvailableOnlyChange={jest.fn()}
        resultCount={0}
        strategyFilter="ALL"
        onStrategyFilterChange={jest.fn()}
      />,
    );
    expect(screen.getByRole('textbox', { name: /search player or team/i })).toBeInTheDocument();
  });

  it('MissingFromEtrList filter input has an accessible name', () => {
    render(<MissingFromEtrList names={['Foo Bar']} />);
    // The toggle button must be opened first to reveal the filter input.
    fireEvent.click(screen.getByTestId('missing-from-etr-toggle'));
    expect(
      screen.getByRole('textbox', { name: /filter missing-from-etr players/i }),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test searchInputLabels.test.tsx`
Expected: FAIL — `getByRole('textbox', { name: ... })` finds no accessible-name match on either input

- [ ] **Step 3: Add `aria-label` and `autoComplete="off"` to the four inputs**

In `src/components/AuctionSheet/FilterControls.tsx:93-98`, change:

```tsx
<Input
  value={search}
  onChange={(e) => onSearchChange(e.target.value)}
  placeholder="Search player or team..."
  className="w-full rounded-md bg-background text-[12px] focus-visible:border-border focus-visible:ring-1 focus-visible:ring-border md:w-[210px]"
/>
```

to:

```tsx
<Input
  value={search}
  onChange={(e) => onSearchChange(e.target.value)}
  placeholder="Search player or team..."
  aria-label="Search player or team"
  autoComplete="off"
  className="w-full rounded-md bg-background text-[12px] focus-visible:border-border focus-visible:ring-1 focus-visible:ring-border md:w-[210px]"
/>
```

In `src/components/RankingsUpload/MissingFromEtrList.tsx:52-58`, change:

```tsx
          <input
            type="text"
            data-testid="missing-from-etr-search"
            placeholder="Filter…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
```

to:

```tsx
          <input
            type="text"
            data-testid="missing-from-etr-search"
            placeholder="Filter…"
            aria-label="Filter missing-from-ETR players"
            autoComplete="off"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
```

In `src/components/NominationHelper/WatchlistSidebar.tsx:146-150`, change:

```tsx
<CommandInput value={search} onValueChange={setSearch} placeholder="Add player I want..." />
```

to:

```tsx
<CommandInput
  value={search}
  onValueChange={setSearch}
  placeholder="Add player I want..."
  aria-label="Add player to watchlist"
  autoComplete="off"
/>
```

In `src/components/RankingsUpload/ResolveUnmatchedList.tsx:114-119`, change:

```tsx
<CommandInput
  data-testid={`unmatched-search-${player.id}`}
  placeholder="Search Sleeper players…"
  value={search}
  onValueChange={setSearch}
/>
```

to:

```tsx
<CommandInput
  data-testid={`unmatched-search-${player.id}`}
  placeholder="Search Sleeper players…"
  aria-label={`Search Sleeper players to match ${player.name}`}
  autoComplete="off"
  value={search}
  onValueChange={setSearch}
/>
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm test searchInputLabels.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Run the full suite to confirm no regressions**

Run: `pnpm test`
Expected: PASS — 0 failures (adding `aria-label`/`autoComplete` does not remove the `placeholder` or any `data-testid`, so existing `getByPlaceholderText`/`getByTestId` queries in `FilterControls`, `MissingFromEtrList`, `WatchlistSidebar`, and `ResolveUnmatchedList` test files continue to match)

- [ ] **Step 6: Typecheck and lint**

Run: `pnpm tsc --noEmit && pnpm lint`
Expected: both clean

- [ ] **Step 7: Commit**

```bash
git add src/components/AuctionSheet/FilterControls.tsx src/components/RankingsUpload/MissingFromEtrList.tsx src/components/NominationHelper/WatchlistSidebar.tsx src/components/RankingsUpload/ResolveUnmatchedList.tsx src/__tests__/searchInputLabels.test.tsx
git commit -m "HARD-015: add accessible names to placeholder-only search inputs"
```

---

### Task 4: Remove the redundant, non-semantic keyboard handling from `PlayerTable`'s clickable row

`PlayerTable`'s `<TableRow>` (a `<tr>`) currently has `tabIndex={0}`, `onClick`, and `onKeyDown` (Enter/Space) — making it a second, unlabeled keyboard stop for the exact same action already exposed by the nested `<button aria-label="Open bid modal for {player}">` in the row. A `<tr>` that's both keyboard-focusable and contains a real nested interactive `<button>` is an invalid/confusing ARIA pattern: assistive tech reaches a dead-end "row" stop with no accessible name, then a second stop for the real button. The mouse-only "click anywhere on the row" convenience stays — only the row's keyboard affordance is removed, since the nested button already covers that.

**Files:**

- Modify: `src/components/AuctionSheet/PlayerTable.tsx:165-176`
- Modify: `src/__tests__/PlayerTable.test.tsx:100-108`

- [ ] **Step 1: Update the test to assert the new (correct) behavior first**

Replace the existing test that focuses the row directly (this test currently encodes the behavior being removed):

```tsx
it('opens a player row with the keyboard', async () => {
  const user = userEvent.setup();
  const { onRowClick } = renderTable();

  screen.getByTestId('player-row-1').focus();
  await user.keyboard('{Enter}');

  expect(onRowClick).toHaveBeenCalledWith(PLAYERS[0]);
});
```

with:

```tsx
it('does not expose the row itself as a redundant keyboard stop', () => {
  renderTable();

  expect(screen.getByTestId('player-row-1')).not.toHaveAttribute('tabindex');
});
```

(The existing test immediately below this one, `'row actions can be operated with the keyboard'`, already asserts that focusing the nested "Open bid modal for..." button and pressing Enter calls `onRowClick` — that test is unchanged and remains the keyboard-operability guarantee.)

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test PlayerTable.test.tsx`
Expected: FAIL — `does not expose the row itself as a redundant keyboard stop` fails because the row currently has `tabIndex={0}`

- [ ] **Step 3: Remove the row's keyboard handling**

In `src/components/AuctionSheet/PlayerTable.tsx:165-176`, change:

```tsx
                tabIndex={onRowClick ? 0 : undefined}
                onClick={onRowClick ? () => onRowClick(p) : undefined}
                onKeyDown={
                  onRowClick
                    ? (event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          onRowClick(p);
                        }
                      }
                    : undefined
                }
```

to:

```tsx
                onClick={onRowClick ? () => onRowClick(p) : undefined}
```

Also remove the now-orphaned `focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none` class from the row's `className` (the row is no longer focusable, so it never receives `:focus-visible`), changing:

```tsx
                className={cn(
                  'border-b-border-subtle hover:bg-card',
                  onRowClick &&
                    'cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                  claim && 'bg-background',
                  !claim && isNominated && 'bg-[color-mix(in_srgb,var(--pos-pick)_9%,transparent)]',
                  !claim && !isNominated && i % 2 !== 0 && 'bg-card/45',
                )}
```

to:

```tsx
                className={cn(
                  'border-b-border-subtle hover:bg-card',
                  onRowClick && 'cursor-pointer',
                  claim && 'bg-background',
                  !claim && isNominated && 'bg-[color-mix(in_srgb,var(--pos-pick)_9%,transparent)]',
                  !claim && !isNominated && i % 2 !== 0 && 'bg-card/45',
                )}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm test PlayerTable.test.tsx`
Expected: PASS (all tests in this file, including the still-present mouse-click and nested-button-keyboard tests)

- [ ] **Step 5: Run the full suite to confirm no regressions**

Run: `pnpm test`
Expected: PASS — 0 failures. `AuctionSheet.onboarding.test.tsx` and `AuctionSheet.claimed.test.tsx` only click the row (via `user.click`), never focus+Enter it directly, so they are unaffected.

- [ ] **Step 6: Typecheck and lint**

Run: `pnpm tsc --noEmit && pnpm lint`
Expected: both clean

- [ ] **Step 7: Commit**

```bash
git add src/components/AuctionSheet/PlayerTable.tsx src/__tests__/PlayerTable.test.tsx
git commit -m "HARD-015: remove redundant non-semantic keyboard handling from PlayerTable row"
```

---

### Task 5: Announce Budget Pressure auto-refresh through the shared live region

`BudgetRefresher` polls `router.refresh()` every 20s and on manual click, but only shows a plain `<span>` — screen-reader users get no announcement when the threat board refreshes.

**Files:**

- Modify: `src/components/BudgetPressure/BudgetRefresher.tsx`
- Test: `src/__tests__/BudgetRefresher.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/__tests__/BudgetRefresher.test.tsx
import { render, screen, act, fireEvent } from '@testing-library/react';
import BudgetRefresher from '@/components/BudgetPressure/BudgetRefresher';

const mockRefresh = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

describe('BudgetRefresher', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockRefresh.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('announces a refresh through the shared live region on the polling interval', () => {
    render(<BudgetRefresher intervalMs={20000} />);

    act(() => {
      jest.advanceTimersByTime(20000);
    });

    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('mutation-status')).toHaveTextContent(/threat board refreshed/i);
  });

  it('announces a refresh through the shared live region on manual click', () => {
    render(<BudgetRefresher intervalMs={20000} />);

    fireEvent.click(screen.getByRole('button', { name: /refresh/i }));

    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('mutation-status')).toHaveTextContent(/threat board refreshed/i);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test BudgetRefresher.test.tsx`
Expected: FAIL — `getByTestId('mutation-status')` finds no element

- [ ] **Step 3: Wire in `MutationStatus`**

In `src/components/BudgetPressure/BudgetRefresher.tsx`, change:

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

to:

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import MutationStatus from '@/components/MutationStatus';

interface BudgetRefresherProps {
  intervalMs?: number;
}

export default function BudgetRefresher({ intervalMs = 20000 }: BudgetRefresherProps) {
  const router = useRouter();
  const [elapsed, setElapsed] = useState(0);
  const [mutationStatus, setMutationStatus] = useState('');
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
    setMutationStatus('Threat board refreshed.');
  }, []);

  useEffect(() => {
    tickRef.current = 0;
    const timer = setInterval(() => {
      tickRef.current += 1;
      if (tickRef.current >= intervalSecs) {
        routerRef.current.refresh();
        tickRef.current = 0;
        setElapsed(0);
        setMutationStatus('Threat board refreshed.');
      } else {
        setElapsed(tickRef.current);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [intervalSecs]);

  return (
    <div className="flex items-center gap-2">
      <MutationStatus message={mutationStatus} />
      <span className="font-mono text-[10px] text-muted-foreground">Updated {elapsed}s ago</span>
      <Button variant="outline" size="sm" onClick={doRefresh}>
        Refresh
      </Button>
    </div>
  );
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm test BudgetRefresher.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Run the full suite to confirm no regressions**

Run: `pnpm test`
Expected: PASS — 0 failures. `BudgetPressureView.test.tsx` mocks `BudgetRefresher` entirely, so it is unaffected.

- [ ] **Step 6: Typecheck and lint**

Run: `pnpm tsc --noEmit && pnpm lint`
Expected: both clean

- [ ] **Step 7: Commit**

```bash
git add src/components/BudgetPressure/BudgetRefresher.tsx src/__tests__/BudgetRefresher.test.tsx
git commit -m "HARD-015: announce Budget Pressure refreshes through the shared live region"
```

---

### Task 6: Announce rankings upload outcomes through the shared live region

`RankingsUploadForm` shows upload errors via visible `<ErrorText>` markup only — no `aria-live` region announces success or failure to screen-reader users.

**Files:**

- Modify: `src/components/RankingsUpload/RankingsUploadForm.tsx`
- Test: `src/__tests__/RankingsUploadForm.test.tsx` (extend existing file — read it first to match its existing mock/setup conventions for `uploadRankingsCsv` before adding the new test below)

- [ ] **Step 1: Write the failing test**

The existing file already defines `mockUpload`, the `@/lib/rankings-actions` mock, and a local `makeFile(contents, name)` helper — add these two tests to its `describe` block, following the same `user.upload(...)` pattern its other upload tests use:

```tsx
it('announces a successful upload through the shared live region', async () => {
  mockUpload.mockResolvedValue({ ok: true });
  render(<RankingsUploadForm summary={null} />);
  const input = screen.getByTestId('rankings-upload-button').querySelector('input')!;
  const user = userEvent.setup();

  await user.upload(
    input,
    makeFile('Player,Team,Position,Age,2QBAuction\nJosh Allen,BUF,QB,30.1,$51'),
  );

  await waitFor(() => {
    expect(screen.getByTestId('mutation-status')).toHaveTextContent(/uploaded successfully/i);
  });
});

it('announces a failed upload through the shared live region', async () => {
  mockUpload.mockResolvedValue({ ok: false, errors: ['Missing required column(s): Age'] });
  render(<RankingsUploadForm summary={null} />);
  const input = screen.getByTestId('rankings-upload-button').querySelector('input')!;
  const user = userEvent.setup();

  await user.upload(input, makeFile('Player,Team\nJosh Allen,BUF'));

  await waitFor(() => {
    expect(screen.getByTestId('mutation-status')).toHaveTextContent(
      /missing required column\(s\): age/i,
    );
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test RankingsUploadForm.test.tsx`
Expected: FAIL — `getByTestId('mutation-status')` finds no element in either new test

- [ ] **Step 3: Wire in `MutationStatus`**

In `src/components/RankingsUpload/RankingsUploadForm.tsx`, change:

```tsx
'use client';

import { useRef, useState, useTransition } from 'react';
import { uploadRankingsCsv } from '@/lib/rankings-actions';
import ErrorText from './ErrorText';

export interface RankingSummaryView {
  fileName: string | null;
  uploadedAt: string;
  totalCount: number;
  matchedCount: number;
  unmatchedCount: number;
  etrCoverage: { covered: number; total: number };
}

interface RankingsUploadFormProps {
  summary: RankingSummaryView | null;
}

export default function RankingsUploadForm({ summary }: RankingsUploadFormProps) {
  const [errors, setErrors] = useState<string[] | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrors(null);
    startTransition(async () => {
      try {
        const text = await file.text();
        const result = await uploadRankingsCsv(file.name, text);
        if (!result.ok) {
          setErrors(result.errors);
        }
      } catch {
        setErrors(['Upload failed — please try again.']);
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    });
  }

  return (
    <div
```

to:

```tsx
'use client';

import { useRef, useState, useTransition } from 'react';
import { uploadRankingsCsv } from '@/lib/rankings-actions';
import ErrorText from './ErrorText';
import MutationStatus from '@/components/MutationStatus';

export interface RankingSummaryView {
  fileName: string | null;
  uploadedAt: string;
  totalCount: number;
  matchedCount: number;
  unmatchedCount: number;
  etrCoverage: { covered: number; total: number };
}

interface RankingsUploadFormProps {
  summary: RankingSummaryView | null;
}

export default function RankingsUploadForm({ summary }: RankingsUploadFormProps) {
  const [errors, setErrors] = useState<string[] | null>(null);
  const [mutationStatus, setMutationStatus] = useState('');
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrors(null);
    setMutationStatus('');
    startTransition(async () => {
      try {
        const text = await file.text();
        const result = await uploadRankingsCsv(file.name, text);
        if (!result.ok) {
          setErrors(result.errors);
          setMutationStatus(result.errors.join(' '));
        } else {
          setMutationStatus('Rankings uploaded successfully.');
        }
      } catch {
        setErrors(['Upload failed — please try again.']);
        setMutationStatus('Upload failed — please try again.');
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    });
  }

  return (
    <div
```

Then, immediately after the opening `<div ...>` returned by the component (right before the `{summary ? (` line), add:

```tsx
<MutationStatus message={mutationStatus} />
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm test RankingsUploadForm.test.tsx`
Expected: PASS (all tests in this file, including the 2 new ones)

- [ ] **Step 5: Run the full suite to confirm no regressions**

Run: `pnpm test`
Expected: PASS — 0 failures

- [ ] **Step 6: Typecheck and lint**

Run: `pnpm tsc --noEmit && pnpm lint`
Expected: both clean

- [ ] **Step 7: Commit**

```bash
git add src/components/RankingsUpload/RankingsUploadForm.tsx src/__tests__/RankingsUploadForm.test.tsx
git commit -m "HARD-015: announce rankings upload outcomes through the shared live region"
```

---

### Task 7: Announce Sleeper roster catch-up outcomes through the shared live region

`SleeperRosterSyncDialog` shows loading/error text as plain markup only (`data-testid="sleeper-sync-loading"`, `data-testid="sleeper-sync-error"`) — no `aria-live` region. Add a `MutationStatus` alongside the existing visible `error` text, and a new `successMessage` state set only on the two successful-mutation paths, without changing any existing visible markup or `data-testid`.

**Files:**

- Modify: `src/components/SleeperRosterSync/SleeperRosterSyncDialog.tsx`
- Test: `src/__tests__/SleeperRosterSyncDialog.test.tsx` (extend existing file — read it first to match its existing mock conventions for `saveSleeperRosterMapping`/`logSleeperRosterCatchUp` before adding the new tests below)

- [ ] **Step 1: Write the failing test**

The existing file's `beforeEach` already sets `mockPreview.mockResolvedValue({ ok: true, preview: PREVIEW })` and `mockLogCatchUp.mockResolvedValue({ ok: true, createdPlayerIds: [3], conflicts: [] })`, and `PREVIEW.actionable` has one row for `playerId: 3`. Add these two tests to the existing `describe` block, following the same render/type/click pattern its other tests use:

```tsx
it('announces a failure through the shared live region', async () => {
  mockPreview.mockResolvedValueOnce({ ok: false, code: 'sleeper_error' });
  render(
    <SleeperRosterSyncDialog
      draftId={4}
      teams={TEAMS}
      initiallyConfigured={true}
      sleeperLeagueId="league-1"
      onClose={jest.fn()}
    />,
  );

  await waitFor(() => {
    expect(screen.getByTestId('mutation-status')).toHaveTextContent(/sleeper/i);
  });
});

it('announces a successful catch-up import through the shared live region', async () => {
  const user = userEvent.setup();
  render(
    <SleeperRosterSyncDialog
      draftId={4}
      teams={TEAMS}
      initiallyConfigured={true}
      onClose={jest.fn()}
    />,
  );
  await screen.findByTestId('sleeper-sync-price-3');

  await user.type(screen.getByTestId('sleeper-sync-price-3'), '42');
  await user.click(screen.getByTestId('sleeper-sync-submit'));

  await waitFor(() => {
    expect(screen.getByTestId('mutation-status')).toHaveTextContent(/imported 1 price/i);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test SleeperRosterSyncDialog.test.tsx`
Expected: FAIL — `getByTestId('mutation-status')` finds no element in either new test

- [ ] **Step 3: Wire in `MutationStatus` and a `successMessage` state**

In `src/components/SleeperRosterSync/SleeperRosterSyncDialog.tsx`, add the import:

```typescript
import MutationStatus from '@/components/MutationStatus';
```

Add a new state declaration alongside the existing `error` state (find the line declaring `const [error, setError] = useState<string>('');` and add immediately after it):

```typescript
const [successMessage, setSuccessMessage] = useState('');
```

The success-branch pattern `setPreview(response.preview); setView('preview');` appears three times in this file (`fetchInitialPreview` around line 101-102, `previewMatchAndSync` around line 123-124, and `saveConfiguration` at lines 222-223) — only the third one, inside **`saveConfiguration`** (the function saving the manual league ID + roster mapping form, declared at line 189), should get the new announcement. In `saveConfiguration`'s success branch (lines 222-223), change:

```typescript
setPreview(response.preview);
setView('preview');
```

to:

```typescript
setPreview(response.preview);
setView('preview');
setSuccessMessage('Sleeper roster mapping saved.');
```

Do not touch the other two occurrences of this line pair (`fetchInitialPreview`, `previewMatchAndSync`) — they are unrelated code paths and adding the announcement there would falsely report "mapping saved" on every dialog open.

In `submitCatchUp`, change:

```typescript
    setError('');
    setConflicts(new Map());
    try {
      const response = await logSleeperRosterCatchUp({ draftId, entries });
      if (!response.ok) {
        setError(responseMessage(response.code));
        return;
      }
      setConflicts(
        new Map(response.conflicts.map((conflict) => [conflict.playerId, conflict.reason])),
      );
      router.refresh();
    } catch {
      setError('Unable to save the catch-up results. Please try again.');
    }
  }
```

to:

```typescript
    setError('');
    setSuccessMessage('');
    setConflicts(new Map());
    try {
      const response = await logSleeperRosterCatchUp({ draftId, entries });
      if (!response.ok) {
        setError(responseMessage(response.code));
        return;
      }
      setConflicts(
        new Map(response.conflicts.map((conflict) => [conflict.playerId, conflict.reason])),
      );
      setSuccessMessage(`Imported ${entries.length} price${entries.length === 1 ? '' : 's'}.`);
      router.refresh();
    } catch {
      setError('Unable to save the catch-up results. Please try again.');
    }
  }
```

Finally, in the render, immediately after `<DialogTitle>Sleeper roster catch-up</DialogTitle>`, add:

```tsx
<MutationStatus message={error || successMessage} />
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm test SleeperRosterSyncDialog.test.tsx`
Expected: PASS (all tests in this file, including the 2 new ones)

- [ ] **Step 5: Run the full suite to confirm no regressions**

Run: `pnpm test`
Expected: PASS — 0 failures

- [ ] **Step 6: Typecheck and lint**

Run: `pnpm tsc --noEmit && pnpm lint`
Expected: both clean

- [ ] **Step 7: Commit**

```bash
git add src/components/SleeperRosterSync/SleeperRosterSyncDialog.tsx src/__tests__/SleeperRosterSyncDialog.test.tsx
git commit -m "HARD-015: announce Sleeper roster catch-up outcomes through the shared live region"
```

---

### Task 8: Add a 44px comfortable-touch size variant and apply it to `BidModal`

`Button`/`Toggle` size variants top out at 36px (`lg`/`icon-lg`), below the ~44×44px comfortable touch target. `BidModal` — the single most frequently used live-draft control, plausibly operated on a phone at the draft table — uses `size="sm"` (28px) throughout.

**Files:**

- Modify: `src/components/ui/button.tsx`
- Modify: `src/components/ui/toggle.tsx`
- Modify: `src/components/BidModal/BidModal.tsx`
- Test: `src/components/ui/__tests__/touchTargetSize.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/ui/__tests__/touchTargetSize.test.tsx
import { render, screen } from '@testing-library/react';
import { Button } from '../button';

describe('Button touch size variant', () => {
  it('the "touch" size renders a 44px-tall control', () => {
    render(<Button size="touch">Tap me</Button>);
    expect(screen.getByRole('button', { name: 'Tap me' })).toHaveClass('h-11');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test touchTargetSize.test.tsx`
Expected: FAIL — TypeScript error, `size="touch"` is not assignable (or the class assertion fails if TS is loose in this test context)

- [ ] **Step 3: Add the `touch` size to `Button` and `Toggle`**

In `src/components/ui/button.tsx`, in the `size` variants object, change:

```typescript
        'icon-lg': 'size-9',
      },
```

to:

```typescript
        'icon-lg': 'size-9',
        touch:
          'h-11 gap-1.5 px-3 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3',
      },
```

In `src/components/ui/toggle.tsx`, in the `size` variants object, change:

```typescript
        lg: 'h-9 min-w-9 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2',
      },
```

to:

```typescript
        lg: 'h-9 min-w-9 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2',
        touch: 'h-11 min-w-11 px-3 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3',
      },
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm test touchTargetSize.test.tsx`
Expected: PASS (1 test)

- [ ] **Step 5: Apply the new size to every `Button` in `BidModal`**

In `src/components/BidModal/BidModal.tsx`, replace every `size="sm"` with `size="touch"` across the 6 `<Button>` elements in the actions row (the "Remove" button, "Keep"/"Confirm Remove" pair, "Nom" button, "Cancel" button, and the primary submit button) — i.e. change each occurrence of:

```tsx
size = 'sm';
```

(and the equivalent inline `<Button variant="outline" size="sm" ...>` / `<Button data-testid="bid-submit" size="sm" ...>` forms) to:

```tsx
size = 'touch';
```

Use a scoped find-and-replace across this one file only (`size="sm"` → `size="touch"`); do not touch `size="sm"` in any other file.

- [ ] **Step 6: Run the full suite to confirm no regressions**

Run: `pnpm test`
Expected: PASS — 0 failures. `BidModal`'s existing tests select buttons by `data-testid`/role name, not by size class, so they are unaffected by the size change.

- [ ] **Step 7: Typecheck and lint**

Run: `pnpm tsc --noEmit && pnpm lint`
Expected: both clean

- [ ] **Step 8: Commit**

```bash
git add src/components/ui/button.tsx src/components/ui/toggle.tsx src/components/BidModal/BidModal.tsx src/components/ui/__tests__/touchTargetSize.test.tsx
git commit -m "HARD-015: add a 44px comfortable-touch size variant, apply it to BidModal"
```

---

### Task 9: Replace `transition-all` with explicit-property transitions and add a global reduced-motion safety net

`Button` and `Toggle` are the only two `transition-all` usages in the app. The only existing `prefers-reduced-motion: reduce` rule targets `.ticker-scroll` alone — it does nothing for these two base primitives' hover/focus/active transitions (including `Button`'s `active:translate-y-px` press effect).

**Files:**

- Modify: `src/components/ui/button.tsx`
- Modify: `src/components/ui/toggle.tsx`
- Modify: `src/app/globals.css`
- Test: `src/components/ui/__tests__/transitions.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/components/ui/__tests__/transitions.test.ts
import fs from 'fs';
import path from 'path';

describe('motion-sensitive transitions', () => {
  it('Button and Toggle do not use transition-all', () => {
    const buttonSource = fs.readFileSync(path.resolve(__dirname, '../button.tsx'), 'utf-8');
    const toggleSource = fs.readFileSync(path.resolve(__dirname, '../toggle.tsx'), 'utf-8');
    expect(buttonSource).not.toMatch(/\btransition-all\b/);
    expect(toggleSource).not.toMatch(/\btransition-all\b/);
  });

  it('globals.css disables transitions and animations under prefers-reduced-motion', () => {
    const css = fs.readFileSync(path.resolve(__dirname, '../../../app/globals.css'), 'utf-8');
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{/);
    expect(css).toMatch(/transition-duration: 0\.01ms !important/);
    expect(css).toMatch(/animation-duration: 0\.01ms !important/);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test transitions.test.ts`
Expected: FAIL — both `Button`/`Toggle` still contain `transition-all`, and `globals.css` has no blanket reduced-motion rule

- [ ] **Step 3: Replace `transition-all` with explicit properties**

In `src/components/ui/button.tsx`, in the base `buttonVariants` class string, change:

```
transition-all outline-none
```

to:

```
transition-[color,background-color,border-color,box-shadow,transform] outline-none
```

(This is inside the long `cva(...)` base class string on line 7 — only the `transition-all` token changes, the surrounding classes stay as-is.)

In `src/components/ui/toggle.tsx`, in the base `toggleVariants` class string, change:

```
transition-all outline-none
```

to:

```
transition-[color,background-color,border-color,box-shadow] outline-none
```

(This is inside the `cva(...)` base class string on line 9 — only the `transition-all` token changes.)

- [ ] **Step 4: Add the global reduced-motion safety net**

In `src/app/globals.css`, immediately after the existing block:

```css
@media (prefers-reduced-motion: reduce) {
  .ticker-scroll {
    animation: none;
  }
}
```

add:

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `pnpm test transitions.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 6: Run the full suite to confirm no regressions**

Run: `pnpm test`
Expected: PASS — 0 failures

- [ ] **Step 7: Typecheck and lint**

Run: `pnpm tsc --noEmit && pnpm lint`
Expected: both clean

- [ ] **Step 8: Commit**

```bash
git add src/components/ui/button.tsx src/components/ui/toggle.tsx src/app/globals.css src/components/ui/__tests__/transitions.test.ts
git commit -m "HARD-015: use property-specific transitions and add a global reduced-motion rule"
```

---

### Task 10: Add `jest-axe` and automated accessibility + keyboard-flow smoke tests for the four critical routes

Adds the axe-core-backed regression net the audit calls for, reusing the fixture helper from Task 2 so the four critical components (`AuctionSheet`, `NominationHelper`, `RosterTracker`, `BudgetPressureView`) are scanned with the exact same fixtures the landmark test already established. Run this task last, after Tasks 3, 4, 8, and 9 have already cleaned up the specific defects an axe scan would otherwise catch, so this task's job is to add the regression net, not to fix a pile of new findings — but if the scan surfaces additional real violations beyond what's in this plan, fix them as part of this task and note what was found.

**Files:**

- Modify: `package.json` (add `jest-axe` devDependency)
- Modify: `jest.setup.ts`
- Create: `src/__tests__/criticalRouteAccessibility.test.tsx`

**Interfaces:**

- Consumes: `auctionSheetProps`, `budgetPressureViewProps`, `rosterTrackerProps`, `nominationHelperProps` from `src/__tests__/helpers/criticalRouteFixtures.tsx` (created in Task 2).

- [ ] **Step 1: Add the `jest-axe` dependency**

Run: `pnpm add -D jest-axe`
Expected: `package.json` and `pnpm-lock.yaml` updated, install succeeds

- [ ] **Step 2: Register the `toHaveNoViolations` matcher**

In `jest.setup.ts`, add at the top of the file:

```typescript
import 'jest-axe/extend-expect';
```

- [ ] **Step 3: Write the failing test**

```tsx
// src/__tests__/criticalRouteAccessibility.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import { axe } from 'jest-axe';
import AuctionSheet from '@/components/AuctionSheet/AuctionSheet';
import NominationHelper from '@/components/NominationHelper/NominationHelper';
import RosterTracker from '@/components/RosterTracker/RosterTracker';
import BudgetPressureView from '@/components/BudgetPressure/BudgetPressureView';
import userEvent from '@testing-library/user-event';
import {
  auctionSheetProps,
  budgetPressureViewProps,
  rosterTrackerProps,
  nominationHelperProps,
} from './helpers/criticalRouteFixtures';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: jest.fn(), replace: jest.fn() }),
}));

jest.mock('@/lib/actions', () => ({
  logBid: jest.fn(),
  updateBid: jest.fn(),
  deleteBid: jest.fn(),
}));

jest.mock('@/components/Onboarding/OnboardingContext', () => ({
  useOnboarding: () => ({
    progress: null,
    recordBidLogged: jest.fn().mockResolvedValue(undefined),
    recordPlayerNominated: jest.fn().mockResolvedValue(undefined),
  }),
}));

jest.mock('@/components/BudgetPressure/BudgetRefresher', () => ({
  __esModule: true,
  default: () => <div data-testid="budget-refresher" />,
}));

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      teamStats: [],
      auctionResults: [],
      watchlist: [],
      nominated: [],
      ownerHandle: null,
      targetRoster: { QB: 4, RB: 9, WR: 11, TE: 3 },
    }),
  } as Response);
});

// jsdom cannot compute real layout/paint, so axe-core's color-contrast rule is
// unreliable there — contrast is already covered by src/lib/__tests__/tokenContrast.test.ts.
const AXE_OPTIONS = { rules: { 'color-contrast': { enabled: false } } };

describe('critical route accessibility', () => {
  it('AuctionSheet has no serious axe violations', async () => {
    const { container } = render(<AuctionSheet {...auctionSheetProps()} />);
    expect(await axe(container, AXE_OPTIONS)).toHaveNoViolations();
  });

  it('BudgetPressureView has no serious axe violations', async () => {
    const { container } = render(<BudgetPressureView {...budgetPressureViewProps()} />);
    expect(await axe(container, AXE_OPTIONS)).toHaveNoViolations();
  });

  it('RosterTracker has no serious axe violations', async () => {
    const { container } = render(<RosterTracker {...rosterTrackerProps()} />);
    expect(await axe(container, AXE_OPTIONS)).toHaveNoViolations();
  });

  it('NominationHelper has no serious axe violations', async () => {
    const { container } = render(<NominationHelper {...nominationHelperProps()} />);
    await waitFor(() => expect(screen.getByText('Nomination Helper')).toBeInTheDocument());
    expect(await axe(container, AXE_OPTIONS)).toHaveNoViolations();
  });

  it('opens the bid modal end-to-end via keyboard alone', async () => {
    const user = userEvent.setup();
    render(<AuctionSheet {...auctionSheetProps()} />);

    screen.getByRole('button', { name: /open bid modal for josh allen/i }).focus();
    await user.keyboard('{Enter}');

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `pnpm test criticalRouteAccessibility.test.tsx`
Expected: FAIL initially on `Cannot find module 'jest-axe'` if Step 1/2 were skipped; once those are in place, this test is expected to largely PASS already (Tasks 1–9 already fixed the known issues) — treat any remaining failure as new information, not a plan defect: inspect `violations` from the failing assertion's output (temporarily `console.log(results.violations)` if needed) and fix genuine issues in the relevant component before proceeding. Do not disable additional axe rules to force a pass without understanding why they fired.

- [ ] **Step 5: Iterate until green**

Fix any real violations surfaced in Step 4 in the component they originate from (not in the test). Re-run after each fix:

Run: `pnpm test criticalRouteAccessibility.test.tsx`
Expected: eventually PASS (5 tests)

- [ ] **Step 6: Run the full suite**

Run: `pnpm test`
Expected: PASS — 0 failures across the whole suite

- [ ] **Step 7: Typecheck and lint**

Run: `pnpm tsc --noEmit && pnpm lint`
Expected: both clean

- [ ] **Step 8: Run the full quality gate**

Run: `make check`
Expected: typecheck, lint, format check, and test all pass

- [ ] **Step 9: Commit**

```bash
git add package.json pnpm-lock.yaml jest.setup.ts src/__tests__/criticalRouteAccessibility.test.tsx
git commit -m "HARD-015: add jest-axe and accessibility/keyboard-flow smoke tests for critical routes"
```

---

## Post-plan note

This plan covers HARD-015's Jest-testable surface: skip link/landmarks, accessible names, semantic row interaction, live-region coverage, token contrast, touch targets, and reduced motion, each backed by an automated regression test. It does not add browser-level (Playwright) axe/keyboard coverage — HARD-012 already established Playwright smoke coverage separately; extending that suite with an axe pass is a reasonable fast-follow but is not required to satisfy HARD-015's acceptance criteria, which are met here at the component level.
