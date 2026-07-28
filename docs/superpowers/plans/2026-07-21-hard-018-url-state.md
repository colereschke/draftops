# HARD-018: URL State and Route Loading States Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the value sheet's filters/search/sort/available-only, the roster tracker's sort/selected-team, and the nomination helper's position filter into the URL query string (so refresh, copy/paste sharing, and browser back/forward preserve the operator's working view), and give every route segment under `src/app/draft/[draftId]/` a loading state, a tailored not-found state, and a tailored error state.

**Architecture:** Two small shared client hooks (`useDebouncedValue`, `useUrlQuerySync`) plus one pure parse/serialize module per stateful component (`urlState.ts` colocated with each). Each component keeps its existing `useState`-driven filtering/sorting exactly as-is; the only change is that initial state is read once from `useSearchParams()` and every subsequent change is mirrored into the URL via `window.history.replaceState` (which Next.js's App Router patches, so `useSearchParams()` reflects it and browser back/forward across pages still work correctly). `useUrlQuerySync` deliberately uses `replaceState` for every field, not just debounced search — a live draft session can generate dozens of filter/sort clicks, and if each pushed a new history entry, the back button would step through that entire click history one at a time before ever leaving the page, which is worse than not syncing at all. The tradeoff: back/forward restores state across _page_ navigations (leave `/draft/[id]` with filters set, come back, filters are still there) rather than stepping through each individual in-page filter change — this is what HARD-018's "shared URLs reproduce the view" and "back/forward restores meaningful state" criteria are read to mean here. Route segment `loading.tsx` files double as the Suspense boundary `useSearchParams()` needs during static analysis (though in practice these routes are already forced-dynamic via `auth()`/`force-dynamic`, so this is a belt-and-suspenders sequencing choice, not a strict requirement). A shared `RouteLoading` / `RouteErrorBoundary` component removes duplication across the four segment-level loading/error files.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Jest + React Testing Library, `next/navigation` (`usePathname`, `useSearchParams`), native `window.history.replaceState`.

## Global Constraints

- Do not touch `src/components/BudgetPressure/ThreatBoard.tsx`'s `overridePos` state. It is an explicitly flagged pending product decision (see `docs/superpowers/plans/threat-board-override-pivot` context in project memory) and is not in HARD-018's primary locations list. Leave `/draft/[draftId]/budget` filter state exactly as it is today.
- `AuctionSheet`'s `showNotes` toggle is a display option, not a filter/sort/selection — leave it as local `useState`, not synced to the URL.
- `RosterTracker`'s mobile `expanded` (Set of expanded card IDs) stays local-only — it's ephemeral UI state, not a primary filter/sort/selection, and doesn't fit a single query param cleanly.
- Modal/pending state (`modalPlayer`, `showSleeperSync`, `nominatingIds`, `pendingIds`, etc.) stays local — never put transient mutation UI state in the URL.
- Every new/changed component keeps using `data-testid` selectors in tests, per this repo's testing standard — never select by visible text or role+name.
- Single quotes, trailing commas, 2-space indent, 100-char width (Prettier) — run `pnpm format` if unsure.
- No explicit `any`. Prefer `interface` for prop shapes.
- Run `pnpm tsc --noEmit` and `pnpm lint` before considering any task done; run the full `make check` before the final task.

---

### Task 1: Shared hooks — `useDebouncedValue` and `useUrlQuerySync`

**Files:**

- Create: `src/lib/useDebouncedValue.ts`
- Create: `src/lib/useUrlQuerySync.ts`
- Test: `src/__tests__/useDebouncedValue.test.ts`
- Test: `src/__tests__/useUrlQuerySync.test.tsx`

**Interfaces:**

- Produces: `useDebouncedValue<T>(value: T, delayMs: number): T` — returns `value`, but only updates after `delayMs` of no further changes.
- Produces: `useUrlQuerySync(queryString: string): void` — writes `queryString` into the current URL (via `history.replaceState`, using `usePathname()` for the path) whenever it changes, skipping the very first render so mounting never rewrites the URL a user navigated to or pasted.

- [ ] **Step 1: Write the failing tests**

```ts
// src/__tests__/useDebouncedValue.test.ts
import { renderHook, act } from '@testing-library/react';
import { useDebouncedValue } from '@/lib/useDebouncedValue';

describe('useDebouncedValue', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns the initial value immediately', () => {
    const { result } = renderHook(() => useDebouncedValue('a', 300));
    expect(result.current).toBe('a');
  });

  it('does not update before the delay elapses', () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 300), {
      initialProps: { value: 'a' },
    });
    rerender({ value: 'ab' });
    act(() => jest.advanceTimersByTime(299));
    expect(result.current).toBe('a');
  });

  it('updates to the latest value once the delay elapses', () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 300), {
      initialProps: { value: 'a' },
    });
    rerender({ value: 'ab' });
    act(() => jest.advanceTimersByTime(300));
    expect(result.current).toBe('ab');
  });

  it('resets the timer on rapid successive changes, keeping only the final value', () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 300), {
      initialProps: { value: 'a' },
    });
    rerender({ value: 'ab' });
    act(() => jest.advanceTimersByTime(200));
    rerender({ value: 'abc' });
    act(() => jest.advanceTimersByTime(200));
    expect(result.current).toBe('a');
    act(() => jest.advanceTimersByTime(100));
    expect(result.current).toBe('abc');
  });
});
```

```tsx
// src/__tests__/useUrlQuerySync.test.tsx
import { renderHook } from '@testing-library/react';
import { useUrlQuerySync } from '@/lib/useUrlQuerySync';

let mockPathname = '/draft/1';

jest.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

describe('useUrlQuerySync', () => {
  beforeEach(() => {
    mockPathname = '/draft/1';
    window.history.replaceState(null, '', '/draft/1');
    jest.spyOn(window.history, 'replaceState');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('does not touch the URL on initial mount', () => {
    renderHook(({ query }) => useUrlQuerySync(query), { initialProps: { query: 'pos=QB' } });
    expect(window.history.replaceState).not.toHaveBeenCalled();
  });

  it('writes the new query string to the URL when it changes', () => {
    const { rerender } = renderHook(({ query }) => useUrlQuerySync(query), {
      initialProps: { query: '' },
    });
    rerender({ query: 'pos=QB' });
    expect(window.location.pathname + window.location.search).toBe('/draft/1?pos=QB');
  });

  it('drops the query string entirely when the query becomes empty', () => {
    const { rerender } = renderHook(({ query }) => useUrlQuerySync(query), {
      initialProps: { query: 'pos=QB' },
    });
    rerender({ query: 'pos=RB' });
    rerender({ query: '' });
    expect(window.location.pathname + window.location.search).toBe('/draft/1');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm jest useDebouncedValue useUrlQuerySync`
Expected: FAIL — `Cannot find module '@/lib/useDebouncedValue'` / `'@/lib/useUrlQuerySync'`

- [ ] **Step 3: Implement the hooks**

```ts
// src/lib/useDebouncedValue.ts
'use client';

import { useEffect, useState } from 'react';

export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
```

```ts
// src/lib/useUrlQuerySync.ts
'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Mirrors a component's already-composed query string into the URL via
 * history.replaceState (which Next's router patches, keeping useSearchParams()
 * and back/forward in sync) without triggering a navigation/refetch. Skips the
 * first render so mounting never rewrites the URL the user arrived with.
 */
export function useUrlQuerySync(queryString: string): void {
  const pathname = usePathname();
  const didMount = useRef(false);

  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      return;
    }
    window.history.replaceState(null, '', queryString ? `${pathname}?${queryString}` : pathname);
  }, [pathname, queryString]);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm jest useDebouncedValue useUrlQuerySync`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/useDebouncedValue.ts src/lib/useUrlQuerySync.ts src/__tests__/useDebouncedValue.test.ts src/__tests__/useUrlQuerySync.test.tsx
git commit -m "Add useDebouncedValue and useUrlQuerySync hooks"
```

---

### Task 2: Shared route UI — `RouteLoading` and `RouteErrorBoundary`

**Files:**

- Create: `src/components/RouteLoading.tsx`
- Create: `src/components/RouteErrorBoundary.tsx`
- Test: `src/__tests__/RouteLoading.test.tsx`
- Test: `src/__tests__/RouteErrorBoundary.test.tsx`

**Interfaces:**

- Produces: `RouteLoading({ label }: { label: string })` — a server component rendering one `<main id="main-content">` landmark with `role="status"`/`aria-live="polite"` and the given label.
- Produces: `RouteErrorBoundary({ error, reset, title }: { error: Error & { digest?: string }; reset: () => void; title: string })` — mirrors the existing root `src/app/error.tsx` structure (incident capture via `deriveIncidentDetails`/`captureClientError`) but with a caller-supplied title instead of a hardcoded one.

- [ ] **Step 1: Write the failing tests**

```tsx
// src/__tests__/RouteLoading.test.tsx
import { render, screen } from '@testing-library/react';
import RouteLoading from '@/components/RouteLoading';

describe('RouteLoading', () => {
  it('renders exactly one status landmark announcing the given label', () => {
    render(<RouteLoading label="Loading value sheet…" />);
    const statuses = screen.getAllByRole('status');
    expect(statuses).toHaveLength(1);
    expect(statuses[0]).toHaveAttribute('id', 'main-content');
    expect(statuses[0]).toHaveTextContent('Loading value sheet…');
  });
});
```

```tsx
// src/__tests__/RouteErrorBoundary.test.tsx
import * as Sentry from '@sentry/nextjs';
import { render, screen, waitFor } from '@testing-library/react';
import RouteErrorBoundary from '@/components/RouteErrorBoundary';

jest.mock('@sentry/nextjs', () => ({
  captureException: jest.fn(),
}));

describe('RouteErrorBoundary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the given title and no raw error text, and captures the failure once', async () => {
    const error = new Error('postgres://user:password@host');
    const { rerender } = render(
      <RouteErrorBoundary error={error} reset={jest.fn()} title="Failed to load team rosters" />,
    );

    expect(screen.getByText('Failed to load team rosters')).toBeInTheDocument();
    const incident = screen.getByTestId('error-incident-id').textContent;
    expect(incident).toMatch(/^Incident ID: [\w-]+$/);
    expect(screen.queryByText(/postgres|password/i)).not.toBeInTheDocument();

    await waitFor(() => expect(Sentry.captureException).toHaveBeenCalledTimes(1));

    rerender(
      <RouteErrorBoundary error={error} reset={jest.fn()} title="Failed to load team rosters" />,
    );
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });

  it('does not recapture an error that already carries a server digest', async () => {
    render(
      <RouteErrorBoundary
        error={Object.assign(new Error('secret'), { digest: 'digest-123' })}
        reset={jest.fn()}
        title="Failed to load budget pressure"
      />,
    );
    expect(screen.getByTestId('error-incident-id')).toHaveTextContent('Incident ID: digest-123');
    await waitFor(() => expect(Sentry.captureException).not.toHaveBeenCalled());
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm jest RouteLoading RouteErrorBoundary`
Expected: FAIL — modules do not exist yet

- [ ] **Step 3: Implement the components**

```tsx
// src/components/RouteLoading.tsx
interface RouteLoadingProps {
  label: string;
}

export default function RouteLoading({ label }: RouteLoadingProps) {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      role="status"
      aria-live="polite"
      className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background text-foreground"
    >
      <div
        aria-hidden
        className="size-6 animate-spin rounded-full border-2"
        style={{ borderColor: 'var(--border-subtle)', borderTopColor: 'var(--primary)' }}
      />
      <div className="text-[12px] text-muted-foreground">{label}</div>
    </main>
  );
}
```

```tsx
// src/components/RouteErrorBoundary.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { captureClientError } from '@/lib/clientObservability';
import { deriveIncidentDetails } from '@/lib/incident';

interface RouteErrorBoundaryProps {
  error: Error & { digest?: string };
  reset: () => void;
  title: string;
}

interface IncidentState {
  error: Error;
  incidentId: string;
  hasDigest: boolean;
}

export default function RouteErrorBoundary({ error, reset, title }: RouteErrorBoundaryProps) {
  const capturedErrorRef = useRef<Error | null>(null);
  const [storedIncident, setStoredIncident] = useState<IncidentState>(() => ({
    error,
    ...deriveIncidentDetails(error),
  }));

  let incident = storedIncident;
  if (storedIncident.error !== error) {
    incident = { error, ...deriveIncidentDetails(error) };
    setStoredIncident(incident);
  }

  const { hasDigest, incidentId } = incident;

  useEffect(() => {
    if (hasDigest || capturedErrorRef.current === error) {
      return;
    }
    capturedErrorRef.current = error;
    try {
      captureClientError(error, incidentId);
    } catch {
      // Reporting must never prevent the recovery UI from rendering.
    }
  }, [error, hasDigest, incidentId]);

  return (
    <main
      id="main-content"
      tabIndex={-1}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        minHeight: '100vh',
        background: '#0a0d14',
        color: '#e8eaf0',
        fontFamily: '"Inter", "Helvetica Neue", sans-serif',
      }}
    >
      <div style={{ fontSize: 14, color: 'var(--destructive)', fontWeight: 600 }}>{title}</div>
      <div style={{ fontSize: 12, color: '#4a5168', maxWidth: 320, textAlign: 'center' }}>
        We logged the problem. Try again, and share the incident ID if it continues.
      </div>
      <div data-testid="error-incident-id" style={{ fontSize: 12, color: '#4a5168' }}>
        Incident ID: {incidentId}
      </div>
      <button
        onClick={reset}
        style={{
          marginTop: 8,
          padding: '7px 18px',
          borderRadius: 6,
          border: '1px solid #2a3048',
          background: 'transparent',
          color: '#8892a4',
          fontSize: 12,
          cursor: 'pointer',
        }}
      >
        Try Again
      </button>
    </main>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm jest RouteLoading RouteErrorBoundary`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/RouteLoading.tsx src/components/RouteErrorBoundary.tsx src/__tests__/RouteLoading.test.tsx src/__tests__/RouteErrorBoundary.test.tsx
git commit -m "Add shared RouteLoading and RouteErrorBoundary components"
```

---

### Task 3: Segment `loading.tsx`, `not-found.tsx`, and `error.tsx` files

**Files:**

- Create: `src/app/draft/[draftId]/loading.tsx`
- Create: `src/app/draft/[draftId]/teams/loading.tsx`
- Create: `src/app/draft/[draftId]/budget/loading.tsx`
- Create: `src/app/draft/[draftId]/nominate/loading.tsx`
- Create: `src/app/draft/[draftId]/not-found.tsx`
- Create: `src/app/draft/[draftId]/error.tsx`
- Create: `src/app/draft/[draftId]/teams/error.tsx`
- Create: `src/app/draft/[draftId]/budget/error.tsx`
- Create: `src/app/draft/[draftId]/nominate/error.tsx`
- Test: `src/__tests__/draftSegmentBoundaries.test.tsx`

**Interfaces:**

- Consumes: `RouteLoading` and `RouteErrorBoundary` from Task 2.
- Produces: a Suspense boundary at each of the four segments (via `loading.tsx`), satisfying `useSearchParams()`'s Suspense requirement before Task 5/7/9 introduce that hook into the page components rendered inside these segments.

Note: `not-found.tsx` at `draft/[draftId]/` catches `notFound()` calls made from the layout and from every nested page (`page.tsx`, `teams/page.tsx`, `budget/page.tsx`, `nominate/page.tsx`) — Next.js only needs the closer file if a segment wants to _override_ the parent's not-found UI, which none of these do, so one file covers the whole subtree.

- [ ] **Step 1: Write the failing test**

```tsx
// src/__tests__/draftSegmentBoundaries.test.tsx
import { render, screen } from '@testing-library/react';
import ValueSheetLoading from '@/app/draft/[draftId]/loading';
import TeamsLoading from '@/app/draft/[draftId]/teams/loading';
import BudgetLoading from '@/app/draft/[draftId]/budget/loading';
import NominateLoading from '@/app/draft/[draftId]/nominate/loading';
import DraftNotFound from '@/app/draft/[draftId]/not-found';
import DraftError from '@/app/draft/[draftId]/error';
import TeamsError from '@/app/draft/[draftId]/teams/error';
import BudgetError from '@/app/draft/[draftId]/budget/error';
import NominateError from '@/app/draft/[draftId]/nominate/error';

jest.mock('@sentry/nextjs', () => ({
  captureException: jest.fn(),
}));

describe('draft segment loading states', () => {
  it.each([
    [ValueSheetLoading, 'Loading value sheet…'],
    [TeamsLoading, 'Loading team rosters…'],
    [BudgetLoading, 'Loading budget pressure…'],
    [NominateLoading, 'Loading nomination helper…'],
  ])('renders a status landmark with the expected label', (Component, label) => {
    render(<Component />);
    expect(screen.getByRole('status')).toHaveTextContent(label);
  });
});

describe('draft not-found state', () => {
  it('renders a tailored message with a link back to /drafts', () => {
    render(<DraftNotFound />);
    expect(screen.getByText('Draft not found')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to drafts/i })).toHaveAttribute(
      'href',
      '/drafts',
    );
  });
});

describe('draft segment error states', () => {
  it.each([
    [DraftError, 'Failed to load the value sheet'],
    [TeamsError, 'Failed to load team rosters'],
    [BudgetError, 'Failed to load budget pressure'],
    [NominateError, 'Failed to load the nomination helper'],
  ])('renders the tailored title', (Component, title) => {
    render(<Component error={new Error('boom')} reset={jest.fn()} />);
    expect(screen.getByText(title)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm jest draftSegmentBoundaries`
Expected: FAIL — modules do not exist

- [ ] **Step 3: Create the loading files**

```tsx
// src/app/draft/[draftId]/loading.tsx
import RouteLoading from '@/components/RouteLoading';

export default function Loading() {
  return <RouteLoading label="Loading value sheet…" />;
}
```

```tsx
// src/app/draft/[draftId]/teams/loading.tsx
import RouteLoading from '@/components/RouteLoading';

export default function Loading() {
  return <RouteLoading label="Loading team rosters…" />;
}
```

```tsx
// src/app/draft/[draftId]/budget/loading.tsx
import RouteLoading from '@/components/RouteLoading';

export default function Loading() {
  return <RouteLoading label="Loading budget pressure…" />;
}
```

```tsx
// src/app/draft/[draftId]/nominate/loading.tsx
import RouteLoading from '@/components/RouteLoading';

export default function Loading() {
  return <RouteLoading label="Loading nomination helper…" />;
}
```

- [ ] **Step 4: Create the not-found file**

```tsx
// src/app/draft/[draftId]/not-found.tsx
import Link from 'next/link';

export default function DraftNotFound() {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-5 text-center text-foreground"
    >
      <div className="font-label text-[10px] tracking-[2.5px] text-muted-foreground uppercase">
        404
      </div>
      <h1 className="font-label text-2xl font-bold tracking-tight text-foreground">
        Draft not found
      </h1>
      <p className="max-w-sm text-[12px] text-muted-foreground">
        This draft doesn&apos;t exist, or you don&apos;t have access to it.
      </p>
      <Link
        href="/drafts"
        className="font-label mt-1 rounded-md border border-border-subtle bg-card px-3 py-1.5 text-[11px] font-semibold tracking-wide text-foreground uppercase hover:bg-accent"
      >
        Back to Drafts
      </Link>
    </main>
  );
}
```

- [ ] **Step 5: Create the error files**

```tsx
// src/app/draft/[draftId]/error.tsx
'use client';

import RouteErrorBoundary from '@/components/RouteErrorBoundary';

interface RouteErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function DraftError({ error, reset }: RouteErrorProps) {
  return <RouteErrorBoundary error={error} reset={reset} title="Failed to load the value sheet" />;
}
```

```tsx
// src/app/draft/[draftId]/teams/error.tsx
'use client';

import RouteErrorBoundary from '@/components/RouteErrorBoundary';

interface RouteErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function TeamsError({ error, reset }: RouteErrorProps) {
  return <RouteErrorBoundary error={error} reset={reset} title="Failed to load team rosters" />;
}
```

```tsx
// src/app/draft/[draftId]/budget/error.tsx
'use client';

import RouteErrorBoundary from '@/components/RouteErrorBoundary';

interface RouteErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function BudgetError({ error, reset }: RouteErrorProps) {
  return <RouteErrorBoundary error={error} reset={reset} title="Failed to load budget pressure" />;
}
```

```tsx
// src/app/draft/[draftId]/nominate/error.tsx
'use client';

import RouteErrorBoundary from '@/components/RouteErrorBoundary';

interface RouteErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function NominateError({ error, reset }: RouteErrorProps) {
  return (
    <RouteErrorBoundary error={error} reset={reset} title="Failed to load the nomination helper" />
  );
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm jest draftSegmentBoundaries`
Expected: PASS (9 test cases across the 3 describe blocks)

- [ ] **Step 7: Verify the app still builds**

Run: `pnpm tsc --noEmit && pnpm build`
Expected: both succeed (confirms the new segment files are valid Next.js route conventions)

- [ ] **Step 8: Commit**

```bash
git add src/app/draft/\[draftId\] src/__tests__/draftSegmentBoundaries.test.tsx
git commit -m "Add loading, not-found, and tailored error states for draft route segments"
```

---

### Task 4: `AuctionSheet` URL-state pure helpers

**Files:**

- Create: `src/components/AuctionSheet/urlState.ts`
- Test: `src/__tests__/AuctionSheetUrlState.test.ts`

**Interfaces:**

- Consumes: `PositionFilter`, `StrategyFilter` from `./FilterControls`; `SortKey` from `./PlayerTable`.
- Produces: `AuctionSheetUrlState` interface, `parseAuctionSheetSearchParams(params: URLSearchParams): AuctionSheetUrlState`, `buildAuctionSheetQueryString(state: AuctionSheetUrlState): string`.

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/AuctionSheetUrlState.test.ts
import {
  parseAuctionSheetSearchParams,
  buildAuctionSheetQueryString,
} from '@/components/AuctionSheet/urlState';

describe('parseAuctionSheetSearchParams', () => {
  it('returns defaults for an empty query string', () => {
    expect(parseAuctionSheetSearchParams(new URLSearchParams())).toEqual({
      posFilter: 'ALL',
      strategyFilter: 'ALL',
      search: '',
      sortBy: 'budget',
      sortDir: 'desc',
      availableOnly: false,
    });
  });

  it('reads every recognized param', () => {
    const params = new URLSearchParams(
      'pos=WR&strategy=BARGAIN&q=jefferson&sort=spread&dir=asc&available=1',
    );
    expect(parseAuctionSheetSearchParams(params)).toEqual({
      posFilter: 'WR',
      strategyFilter: 'BARGAIN',
      search: 'jefferson',
      sortBy: 'spread',
      sortDir: 'asc',
      availableOnly: true,
    });
  });

  it('falls back to defaults for unrecognized values instead of trusting them', () => {
    const params = new URLSearchParams('pos=DROP&strategy=NOPE&sort=__proto__&dir=sideways');
    expect(parseAuctionSheetSearchParams(params)).toEqual({
      posFilter: 'ALL',
      strategyFilter: 'ALL',
      search: '',
      sortBy: 'budget',
      sortDir: 'desc',
      availableOnly: false,
    });
  });
});

describe('buildAuctionSheetQueryString', () => {
  it('omits every field that is at its default value', () => {
    expect(
      buildAuctionSheetQueryString({
        posFilter: 'ALL',
        strategyFilter: 'ALL',
        search: '',
        sortBy: 'budget',
        sortDir: 'desc',
        availableOnly: false,
      }),
    ).toBe('');
  });

  it('includes only the fields that differ from their default', () => {
    expect(
      buildAuctionSheetQueryString({
        posFilter: 'WR',
        strategyFilter: 'ALL',
        search: '',
        sortBy: 'budget',
        sortDir: 'desc',
        availableOnly: true,
      }),
    ).toBe('pos=WR&available=1');
  });

  it('round-trips through parseAuctionSheetSearchParams', () => {
    const state = {
      posFilter: 'TE' as const,
      strategyFilter: 'FADE' as const,
      search: 'kittle',
      sortBy: 'ceiling' as const,
      sortDir: 'asc' as const,
      availableOnly: true,
    };
    const query = buildAuctionSheetQueryString(state);
    expect(parseAuctionSheetSearchParams(new URLSearchParams(query))).toEqual(state);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm jest AuctionSheetUrlState`
Expected: FAIL — module does not exist

- [ ] **Step 3: Implement the helpers**

```ts
// src/components/AuctionSheet/urlState.ts
import type { PositionFilter, StrategyFilter } from './FilterControls';
import type { SortKey } from './PlayerTable';

const VALID_POSITIONS: PositionFilter[] = ['ALL', 'QB', 'RB', 'WR', 'TE', 'PICK', 'PKG'];
const VALID_STRATEGIES: StrategyFilter[] = ['ALL', 'WIN-NOW', 'BARGAIN', 'FUTURE', 'FADE'];
const VALID_SORT_KEYS: SortKey[] = [
  'sfRank',
  'player',
  'pos',
  'team',
  'age',
  'floor',
  'budget',
  'ceiling',
  'spread',
  'claimedPrice',
];

export interface AuctionSheetUrlState {
  posFilter: PositionFilter;
  strategyFilter: StrategyFilter;
  search: string;
  sortBy: SortKey;
  sortDir: 'asc' | 'desc';
  availableOnly: boolean;
}

export function parseAuctionSheetSearchParams(params: URLSearchParams): AuctionSheetUrlState {
  const pos = params.get('pos');
  const strategy = params.get('strategy');
  const sort = params.get('sort');
  const dir = params.get('dir');
  return {
    posFilter: (VALID_POSITIONS as string[]).includes(pos ?? '') ? (pos as PositionFilter) : 'ALL',
    strategyFilter: (VALID_STRATEGIES as string[]).includes(strategy ?? '')
      ? (strategy as StrategyFilter)
      : 'ALL',
    search: params.get('q') ?? '',
    sortBy: (VALID_SORT_KEYS as string[]).includes(sort ?? '') ? (sort as SortKey) : 'budget',
    sortDir: dir === 'asc' ? 'asc' : 'desc',
    availableOnly: params.get('available') === '1',
  };
}

export function buildAuctionSheetQueryString(state: AuctionSheetUrlState): string {
  const params = new URLSearchParams();
  if (state.posFilter !== 'ALL') params.set('pos', state.posFilter);
  if (state.strategyFilter !== 'ALL') params.set('strategy', state.strategyFilter);
  if (state.search) params.set('q', state.search);
  if (state.sortBy !== 'budget') params.set('sort', state.sortBy);
  if (state.sortDir !== 'desc') params.set('dir', state.sortDir);
  if (state.availableOnly) params.set('available', '1');
  return params.toString();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm jest AuctionSheetUrlState`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/AuctionSheet/urlState.ts src/__tests__/AuctionSheetUrlState.test.ts
git commit -m "Add AuctionSheet URL-state parse/serialize helpers"
```

---

### Task 5: Wire URL state into `AuctionSheet`

**Files:**

- Modify: `src/components/AuctionSheet/AuctionSheet.tsx`
- Modify: `src/__tests__/AuctionSheet.onboarding.test.tsx`
- Modify: `src/__tests__/AuctionSheet.claimed.test.tsx`
- Test: `src/__tests__/AuctionSheet.urlSync.test.tsx`

**Interfaces:**

- Consumes: `useDebouncedValue` (Task 1), `useUrlQuerySync` (Task 1), `parseAuctionSheetSearchParams`/`buildAuctionSheetQueryString` (Task 4).

- [ ] **Step 1: Write the failing test**

This file needs its own `jest.mock('@/lib/actions', ...)`, matching every other test that renders the full `AuctionSheet` (see `AuctionSheet.onboarding.test.tsx`). Without it, `AuctionSheet.tsx`'s real import of `@/lib/actions` pulls in `@/auth` (NextAuth instantiation) at test-module-load time.

```tsx
// src/__tests__/AuctionSheet.urlSync.test.tsx
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AuctionSheet from '@/components/AuctionSheet/AuctionSheet';
import type { Player, ClaimedBid, LeagueTeam } from '@/types';
import {
  DEFAULT_BUDGET,
  DEFAULT_ROSTER_SIZE,
  DEFAULT_SCORING_SETTINGS,
  DEFAULT_STARTING_LINEUP,
  DEFAULT_TEAM_COUNT,
} from '@/types';

let mockSearch = '';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: jest.fn() }),
  usePathname: () => '/draft/1',
  useSearchParams: () => new URLSearchParams(mockSearch),
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

const MOCK_PLAYERS: Player[] = [
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
  {
    id: 11,
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

const MOCK_TEAMS: LeagueTeam[] = [{ id: 1, handle: 'coreschke', displayName: 'Cole' }];

function renderSheet() {
  return render(
    <AuctionSheet
      players={MOCK_PLAYERS}
      claimedBids={[] as ClaimedBid[]}
      teams={MOCK_TEAMS}
      nominatedPlayers={[]}
      draftId={1}
      ownerHandle="coreschke"
      ownerBudget={1000}
      scoringSettings={{ ...DEFAULT_SCORING_SETTINGS }}
      teamCount={DEFAULT_TEAM_COUNT}
      budget={DEFAULT_BUDGET}
      rosterSize={DEFAULT_ROSTER_SIZE}
      startingLineup={[...DEFAULT_STARTING_LINEUP]}
    />,
  );
}

describe('AuctionSheet URL state', () => {
  beforeEach(() => {
    mockSearch = '';
    window.history.replaceState(null, '', '/draft/1');
  });

  it('hydrates the position filter from the URL on mount', () => {
    mockSearch = 'pos=WR';
    renderSheet();
    expect(screen.queryByTestId('player-row-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('player-row-5')).toBeInTheDocument();
  });

  it('writes the position filter to the URL when changed', async () => {
    const user = userEvent.setup();
    renderSheet();
    await user.click(screen.getByTestId('position-filter-WR'));
    expect(window.location.search).toBe('?pos=WR');
  });

  it('clears the pos param when returning to ALL', async () => {
    const user = userEvent.setup();
    mockSearch = 'pos=WR';
    renderSheet();
    await user.click(screen.getByTestId('position-filter-ALL'));
    expect(window.location.search).toBe('');
  });

  it('debounces the search query before writing it to the URL', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ delay: null, advanceTimers: jest.advanceTimersByTime });
    renderSheet();
    await user.type(screen.getByLabelText('Search player or team'), 'jeff');
    expect(window.location.search).toBe('');
    act(() => jest.advanceTimersByTime(400));
    expect(window.location.search).toBe('?q=jeff');
    jest.useRealTimers();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm jest AuctionSheet.urlSync`
Expected: FAIL — `useSearchParams` is not a function (AuctionSheet doesn't call it yet, and the URL never changes)

- [ ] **Step 3: Wire the component**

Modify `src/components/AuctionSheet/AuctionSheet.tsx`:

Change the import block (around line 4-24):

```ts
import { useState, useMemo, useOptimistic, useTransition } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import type {
  Player,
  Position,
  ClaimedBid,
  LeagueTeam,
  ScoringSettings,
  StartingSlot,
} from '@/types';
import { logBid, updateBid, deleteBid } from '@/lib/actions';
import BidModal from '@/components/BidModal';
import { useOnboarding } from '@/components/Onboarding/OnboardingContext';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { useUrlQuerySync } from '@/lib/useUrlQuerySync';
import AuctionHeader from './AuctionHeader';
import FilterControls, { type PositionFilter, type StrategyFilter } from './FilterControls';
import PlayerTable, { type SortKey } from './PlayerTable';
import DraftReadOnlyBanner from '@/components/DraftReadOnlyBanner';
import MutationStatus from '@/components/MutationStatus';
import BidHistoryPanel, { type DeletedBid } from '@/components/BidHistory/BidHistoryPanel';
import type { DraftMutationCode } from '@/lib/draftMutation';
import { parseAuctionSheetSearchParams, buildAuctionSheetQueryString } from './urlState';
```

Replace the initial hooks/state block, from `const router = useRouter();` through the `showSleeperSync` state declaration (currently lines 73-89):

```ts
const router = useRouter();
const { progress, recordBidLogged } = useOnboarding();
const searchParams = useSearchParams();
const initialUrlState = parseAuctionSheetSearchParams(searchParams);
const [posFilter, setPosFilter] = useState<PositionFilter>(initialUrlState.posFilter);
const [strategyFilter, setStrategyFilter] = useState<StrategyFilter>(
  initialUrlState.strategyFilter,
);
const [search, setSearch] = useState<string>(initialUrlState.search);
const [sortBy, setSortBy] = useState<SortKey>(initialUrlState.sortBy);
const [sortDir, setSortDir] = useState<'asc' | 'desc'>(initialUrlState.sortDir);
const [showNotes, setShowNotes] = useState<boolean>(false);
const [availableOnly, setAvailableOnly] = useState<boolean>(initialUrlState.availableOnly);
const [modalPlayer, setModalPlayer] = useState<Player | null>(null);
const [modalError, setModalError] = useState<string>('');
const [mutationStatus, setMutationStatus] = useState<string>('');
const [isPending, startTransition] = useTransition();
const [nominatingIds, setNominatingIds] = useState<Set<number>>(new Set());
const [extraNominated, setExtraNominated] = useState<Array<number | string>>([]);
const [clearedNominations, setClearedNominations] = useState<Set<number | string>>(new Set());
const [showSleeperSync, setShowSleeperSync] = useState<boolean>(false);

const debouncedSearch = useDebouncedValue(search, 400);
const urlQuery = useMemo(
  () =>
    buildAuctionSheetQueryString({
      posFilter,
      strategyFilter,
      search: debouncedSearch,
      sortBy,
      sortDir,
      availableOnly,
    }),
  [posFilter, strategyFilter, debouncedSearch, sortBy, sortDir, availableOnly],
);
useUrlQuerySync(urlQuery);
```

- [ ] **Step 4: Update the existing navigation mocks so the component can call the new hooks**

In `src/__tests__/AuctionSheet.onboarding.test.tsx`, change:

```ts
jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: jest.fn() }),
}));
```

to:

```ts
jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: jest.fn() }),
  usePathname: () => '/draft/1',
  useSearchParams: () => new URLSearchParams(),
}));
```

In `src/__tests__/AuctionSheet.claimed.test.tsx`, change:

```ts
jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRouterRefresh }),
}));
```

to:

```ts
jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRouterRefresh }),
  usePathname: () => '/draft/1',
  useSearchParams: () => new URLSearchParams(),
}));
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm jest AuctionSheet`
Expected: PASS across `AuctionSheet.urlSync.test.tsx`, `AuctionSheet.onboarding.test.tsx`, `AuctionSheet.claimed.test.tsx`

- [ ] **Step 6: Commit**

```bash
git add src/components/AuctionSheet/AuctionSheet.tsx src/__tests__/AuctionSheet.onboarding.test.tsx src/__tests__/AuctionSheet.claimed.test.tsx src/__tests__/AuctionSheet.urlSync.test.tsx
git commit -m "Sync AuctionSheet filters, search, sort, and available-only to the URL"
```

---

### Task 6: `RosterTracker` URL-state pure helpers

**Files:**

- Create: `src/components/RosterTracker/urlState.ts`
- Test: `src/__tests__/RosterTrackerUrlState.test.ts`

**Interfaces:**

- Consumes: `AppetitePos`, `APPETITE_POSITIONS` from `@/lib/tendencies.constants`.
- Produces: `RosterTrackerSortKey`, `RosterTrackerSortDir`, `RosterTrackerUrlState` types; `parseRosterTrackerSearchParams(params: URLSearchParams): RosterTrackerUrlState`; `buildRosterTrackerQueryString(state: RosterTrackerUrlState): string`.

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/RosterTrackerUrlState.test.ts
import {
  parseRosterTrackerSearchParams,
  buildRosterTrackerQueryString,
} from '@/components/RosterTracker/urlState';

describe('parseRosterTrackerSearchParams', () => {
  it('returns defaults for an empty query string', () => {
    expect(parseRosterTrackerSearchParams(new URLSearchParams())).toEqual({
      sortBy: 'spend',
      sortDir: 'desc',
      selectedTeamId: null,
    });
  });

  it('reads a valid position sort key, direction, and team id', () => {
    const params = new URLSearchParams('sort=WR&dir=asc&team=7');
    expect(parseRosterTrackerSearchParams(params)).toEqual({
      sortBy: 'WR',
      sortDir: 'asc',
      selectedTeamId: 7,
    });
  });

  it('falls back to defaults for unrecognized sort keys and non-integer team ids', () => {
    const params = new URLSearchParams('sort=nope&dir=sideways&team=abc');
    expect(parseRosterTrackerSearchParams(params)).toEqual({
      sortBy: 'spend',
      sortDir: 'desc',
      selectedTeamId: null,
    });
  });
});

describe('buildRosterTrackerQueryString', () => {
  it('omits fields at their default value', () => {
    expect(
      buildRosterTrackerQueryString({ sortBy: 'spend', sortDir: 'desc', selectedTeamId: null }),
    ).toBe('');
  });

  it('round-trips through parseRosterTrackerSearchParams', () => {
    const state = { sortBy: 'age' as const, sortDir: 'asc' as const, selectedTeamId: 3 };
    const query = buildRosterTrackerQueryString(state);
    expect(parseRosterTrackerSearchParams(new URLSearchParams(query))).toEqual(state);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm jest RosterTrackerUrlState`
Expected: FAIL — module does not exist

- [ ] **Step 3: Implement the helpers**

```ts
// src/components/RosterTracker/urlState.ts
import type { AppetitePos } from '@/lib/tendencies.constants';
import { APPETITE_POSITIONS } from '@/lib/tendencies.constants';

export type RosterTrackerSortKey = 'spend' | 'aggression' | 'buys' | 'age' | AppetitePos;
export type RosterTrackerSortDir = 'asc' | 'desc';

const STAT_SORT_KEYS: RosterTrackerSortKey[] = ['spend', 'aggression', 'buys', 'age'];
const VALID_SORT_KEYS: RosterTrackerSortKey[] = [...STAT_SORT_KEYS, ...APPETITE_POSITIONS];

export interface RosterTrackerUrlState {
  sortBy: RosterTrackerSortKey;
  sortDir: RosterTrackerSortDir;
  selectedTeamId: number | null;
}

export function parseRosterTrackerSearchParams(params: URLSearchParams): RosterTrackerUrlState {
  const sort = params.get('sort');
  const dir = params.get('dir');
  const team = params.get('team');
  const teamId = team !== null ? Number(team) : NaN;
  return {
    sortBy: (VALID_SORT_KEYS as string[]).includes(sort ?? '')
      ? (sort as RosterTrackerSortKey)
      : 'spend',
    sortDir: dir === 'asc' ? 'asc' : 'desc',
    selectedTeamId: Number.isSafeInteger(teamId) ? teamId : null,
  };
}

export function buildRosterTrackerQueryString(state: RosterTrackerUrlState): string {
  const params = new URLSearchParams();
  if (state.sortBy !== 'spend') params.set('sort', state.sortBy);
  if (state.sortDir !== 'desc') params.set('dir', state.sortDir);
  if (state.selectedTeamId !== null) params.set('team', String(state.selectedTeamId));
  return params.toString();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm jest RosterTrackerUrlState`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/RosterTracker/urlState.ts src/__tests__/RosterTrackerUrlState.test.ts
git commit -m "Add RosterTracker URL-state parse/serialize helpers"
```

---

### Task 7: Wire URL state into `RosterTracker`

**Files:**

- Modify: `src/components/RosterTracker/RosterTracker.tsx`
- Modify: `src/__tests__/RosterTracker.test.tsx`

**Interfaces:**

- Consumes: `useUrlQuerySync` (Task 1), `parseRosterTrackerSearchParams`/`buildRosterTrackerQueryString`/`RosterTrackerSortKey` (Task 6).

- [ ] **Step 1: Write the failing tests**

Add to the end of the `'RosterTracker — desktop split view'` describe block in `src/__tests__/RosterTracker.test.tsx` (after the existing `'updates the detail pane when a different team is clicked in the list'` test, before its closing `});`):

```tsx
it('writes the selected team to the URL when a different team is clicked', async () => {
  mockDesktop();
  mockSearch = '';
  const teams = [makeTeam({ id: 2, handle: 'rival_b', displayName: 'B' }), makeTeam()];
  const tendencies = [makeTendency({ teamId: 2, handle: 'rival_b' }), makeTendency()];
  window.history.replaceState(null, '', '/draft/1/teams');
  render(<RosterTracker teams={teams} tendencies={tendencies} ownerHandle="coreschke" />);
  await userEvent.click(screen.getByTestId('dossier-expand-2'));
  expect(window.location.search).toBe('?team=2');
});

it('hydrates the selected team from the URL on mount', () => {
  mockDesktop();
  mockSearch = 'team=2';
  const teams = [makeTeam({ id: 2, handle: 'rival_b', displayName: 'B' }), makeTeam()];
  const tendencies = [makeTendency({ teamId: 2, handle: 'rival_b' }), makeTendency()];
  window.history.replaceState(null, '', '/draft/1/teams?team=2');
  render(<RosterTracker teams={teams} tendencies={tendencies} ownerHandle="coreschke" />);
  expect(screen.getByTestId('team-detail-pane')).toHaveTextContent('rival_b');
});
```

Add the required `next/navigation` mock at the top of the file, after the existing imports and before `const makeTeam = ...` (note the mutable `mockSearch` the two tests above assign to — `window.history.replaceState` alone does not change what the mocked `useSearchParams()` returns, so the mock needs its own settable source of truth):

```ts
let mockSearch = '';

jest.mock('next/navigation', () => ({
  usePathname: () => '/draft/1/teams',
  useSearchParams: () => new URLSearchParams(mockSearch),
}));
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm jest RosterTracker.test`
Expected: FAIL — `useSearchParams` is not called by the component yet, so the URL never updates and hydration never happens

- [ ] **Step 3: Wire the component**

Modify `src/components/RosterTracker/RosterTracker.tsx`.

Change the import block (lines 1-13):

```ts
'use client';

import { useState, useMemo, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import type { TeamWithRoster, StartingSlot } from '@/types';
import { DEFAULT_STARTING_LINEUP } from '@/types';
import type { AppetitePos, ManagerTendency } from '@/lib/tendencies';
import { APPETITE_POSITIONS } from '@/lib/tendencies.constants';
import { POS_COLORS } from '@/lib/posColors';
import { useMediaQuery } from '@/lib/useMediaQuery';
import { useUrlQuerySync } from '@/lib/useUrlQuerySync';
import { formatLineupFormat } from '@/lib/describeDraftSettings';
import {
  parseRosterTrackerSearchParams,
  buildRosterTrackerQueryString,
  type RosterTrackerSortKey,
} from './urlState';
import DossierCard from './DossierCard';
import TeamDetailPane from './TeamDetailPane';
```

Change `type SortKey = 'spend' | 'aggression' | 'buys' | 'age' | AppetitePos;` (line 22) to:

```ts
type SortKey = RosterTrackerSortKey;
```

Change the state declarations (lines 114-116):

```ts
const searchParams = useSearchParams();
const initialUrlState = parseRosterTrackerSearchParams(searchParams);

const [expanded, setExpanded] = useState<Set<number>>(new Set());
const [sortBy, setSortBy] = useState<SortKey>(initialUrlState.sortBy);
const [sortDir, setSortDir] = useState<SortDir>(initialUrlState.sortDir);
```

Change the `selectedTeamId` declaration (lines 153-155, after the `ordered` memo):

```ts
const [selectedTeamId, setSelectedTeamId] = useState<number | null>(() => {
  const fromUrl = initialUrlState.selectedTeamId;
  if (fromUrl !== null && ordered.some(({ team }) => team.id === fromUrl)) return fromUrl;
  return ordered[0]?.team.id ?? null;
});

const urlQuery = useMemo(
  () => buildRosterTrackerQueryString({ sortBy, sortDir, selectedTeamId }),
  [sortBy, sortDir, selectedTeamId],
);
useUrlQuerySync(urlQuery);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm jest RosterTracker.test`
Expected: PASS (all existing tests plus the 2 new ones)

- [ ] **Step 5: Commit**

```bash
git add src/components/RosterTracker/RosterTracker.tsx src/__tests__/RosterTracker.test.tsx
git commit -m "Sync RosterTracker sort and selected team to the URL"
```

---

### Task 8: `NominationHelper` URL-state pure helpers

**Files:**

- Create: `src/components/NominationHelper/urlState.ts`
- Test: `src/__tests__/NominationHelperUrlState.test.ts`

**Interfaces:**

- Consumes: `Position` from `@/types`.
- Produces: `parseNominationPosFilter(params: URLSearchParams): 'ALL' | Position`; `buildNominationQueryString(posFilter: 'ALL' | Position): string`.

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/NominationHelperUrlState.test.ts
import {
  parseNominationPosFilter,
  buildNominationQueryString,
} from '@/components/NominationHelper/urlState';

describe('parseNominationPosFilter', () => {
  it('defaults to ALL for an empty query string', () => {
    expect(parseNominationPosFilter(new URLSearchParams())).toBe('ALL');
  });

  it('reads a recognized position', () => {
    expect(parseNominationPosFilter(new URLSearchParams('pos=RB'))).toBe('RB');
  });

  it('falls back to ALL for an unrecognized value', () => {
    expect(parseNominationPosFilter(new URLSearchParams('pos=nope'))).toBe('ALL');
  });
});

describe('buildNominationQueryString', () => {
  it('returns an empty string for ALL', () => {
    expect(buildNominationQueryString('ALL')).toBe('');
  });

  it('encodes a specific position', () => {
    expect(buildNominationQueryString('TE')).toBe('pos=TE');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm jest NominationHelperUrlState`
Expected: FAIL — module does not exist

- [ ] **Step 3: Implement the helpers**

```ts
// src/components/NominationHelper/urlState.ts
import type { Position } from '@/types';

const VALID_POSITIONS: Array<'ALL' | Position> = ['ALL', 'QB', 'RB', 'WR', 'TE', 'PICK', 'PKG'];

export function parseNominationPosFilter(params: URLSearchParams): 'ALL' | Position {
  const pos = params.get('pos');
  return (VALID_POSITIONS as string[]).includes(pos ?? '') ? (pos as 'ALL' | Position) : 'ALL';
}

export function buildNominationQueryString(posFilter: 'ALL' | Position): string {
  return posFilter === 'ALL' ? '' : `pos=${posFilter}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm jest NominationHelperUrlState`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/NominationHelper/urlState.ts src/__tests__/NominationHelperUrlState.test.ts
git commit -m "Add NominationHelper URL-state parse/serialize helpers"
```

---

### Task 9: Wire URL state into `NominationHelper`

**Files:**

- Modify: `src/components/NominationHelper/NominationHelper.tsx`
- Modify: `src/components/NominationHelper/NominationTable.tsx`
- Modify: `src/__tests__/NominationHelper.ui.test.tsx`
- Modify: `src/__tests__/NominationHelper.onboarding.test.tsx`

**Interfaces:**

- Consumes: `useUrlQuerySync` (Task 1), `parseNominationPosFilter`/`buildNominationQueryString` (Task 8).

- [ ] **Step 1: Add a `data-testid` to the position filter chips**

`NominationTable.tsx` currently has no stable selector for its position filter chips (unlike `FilterControls.tsx`'s `position-filter-${pos}`), which the new interaction test needs. Modify `src/components/NominationHelper/NominationTable.tsx`, in the `POSITIONS.map` block (around line 69-89), adding a `data-testid`:

```tsx
              <ToggleGroupItem
                key={pos}
                value={pos}
                data-testid={`nomination-pos-filter-${pos}`}
                className="font-label rounded-[5px] border border-border px-2.5 py-1 text-[11px] font-semibold tracking-wide text-muted-foreground"
```

- [ ] **Step 2: Write the failing test**

Add to `src/__tests__/NominationHelper.ui.test.tsx` (a new `describe` block at the end of the file). Note it needs its own `beforeEach` mocking `global.fetch` with a non-empty `auctionResults` array — `NominationTable` renders "No auction data yet" instead of the filter chips when `auctionResults` is empty, which is how the fixture data in the existing `'NominationHelper UI'` describe block (line 51-64) is shaped, so it can't be reused as-is:

```tsx
describe('NominationHelper URL state', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        teamStats: [],
        auctionResults: [{ playerId: 999, price: 50 }],
        watchlist: [],
        nominated: [],
        ownerHandle: null,
        targetRoster: { QB: 4, RB: 9, WR: 11, TE: 3 },
      }),
    } as Response);
    mockSearch = '';
    window.history.replaceState(null, '', '/draft/1/nominate');
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('hydrates the position filter from the URL on mount', async () => {
    mockSearch = 'pos=RB';
    render(<NominationHelper draftId={1} players={PLAYERS} />);
    await waitFor(() => expect(screen.getByTestId('nomination-pos-filter-RB')).toBeInTheDocument());
    expect(screen.getByTestId('nomination-pos-filter-RB')).toHaveAttribute('aria-pressed', 'true');
  });

  it('writes the position filter to the URL when changed', async () => {
    const user = userEvent.setup();
    render(<NominationHelper draftId={1} players={PLAYERS} />);
    await waitFor(() => expect(screen.getByTestId('nomination-pos-filter-QB')).toBeInTheDocument());
    await user.click(screen.getByTestId('nomination-pos-filter-QB'));
    expect(window.location.search).toBe('?pos=QB');
  });
});
```

Update the top-of-file mock in `src/__tests__/NominationHelper.ui.test.tsx` from:

```ts
const mockRouter = { replace: jest.fn() };

jest.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
}));
```

to:

```ts
const mockRouter = { replace: jest.fn() };
let mockSearch = '';

jest.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/draft/1/nominate',
  useSearchParams: () => new URLSearchParams(mockSearch),
}));
```

`aria-pressed` is Base UI's `Toggle` primitive's standard ARIA attribute for pressed state (always rendered, `"true"`/`"false"`) — assert on that rather than any internal `data-*` attribute, which isn't part of its public contract.

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm jest NominationHelper.ui`
Expected: FAIL — `useSearchParams` is not called by the component yet

- [ ] **Step 4: Wire the component**

Modify `src/components/NominationHelper/NominationHelper.tsx`.

Change the import block (lines 1-13):

```ts
'use client';

import { useState, useMemo, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Player, Position } from '@/types';
import { computeNominationScores, type ScoredPlayer } from '@/lib/nominationScoring';
import { useOnboarding } from '@/components/Onboarding/OnboardingContext';
import { useUrlQuerySync } from '@/lib/useUrlQuerySync';
import MutationStatus from '@/components/MutationStatus';
import WatchlistSidebar from './WatchlistSidebar';
import NominationTable from './NominationTable';
import DraftReadOnlyBanner from '@/components/DraftReadOnlyBanner';
import { useNominationData, type NominationData } from './useNominationData';
import { parseNominationPosFilter, buildNominationQueryString } from './urlState';
```

Change the `posFilter` state declaration (line 47):

```ts
const searchParams = useSearchParams();
const [posFilter, setPosFilter] = useState<'ALL' | Position>(
  parseNominationPosFilter(searchParams),
);
const urlQuery = useMemo(() => buildNominationQueryString(posFilter), [posFilter]);
useUrlQuerySync(urlQuery);
```

- [ ] **Step 5: Update the remaining navigation mock**

In `src/__tests__/NominationHelper.onboarding.test.tsx`, change:

```ts
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn() }),
}));
```

to:

```ts
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn() }),
  usePathname: () => '/draft/1/nominate',
  useSearchParams: () => new URLSearchParams(),
}));
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm jest NominationHelper`
Expected: PASS across `NominationHelper.ui.test.tsx` and `NominationHelper.onboarding.test.tsx`

- [ ] **Step 7: Commit**

```bash
git add src/components/NominationHelper/NominationHelper.tsx src/components/NominationHelper/NominationTable.tsx src/__tests__/NominationHelper.ui.test.tsx src/__tests__/NominationHelper.onboarding.test.tsx
git commit -m "Sync NominationHelper position filter to the URL"
```

---

### Task 10: Fix remaining cross-cutting navigation mocks

**Files:**

- Modify: `src/__tests__/criticalRouteLandmarks.test.tsx`
- Modify: `src/__tests__/criticalRouteAccessibility.test.tsx`
- Modify: `src/__tests__/OnboardingTargets.test.tsx`
- Modify: `src/__tests__/OnboardingTour.test.tsx`

These four files render `AuctionSheet`, `RosterTracker`, and/or `NominationHelper` (directly, or through `OnboardingTour`) but weren't touched by Tasks 5, 7, or 9 because they mock `next/navigation` independently. Without this task, `pnpm jest` fails with `TypeError: (0 , _navigation.useSearchParams) is not a function` in these files.

- [ ] **Step 1: Update `criticalRouteLandmarks.test.tsx` and `criticalRouteAccessibility.test.tsx`**

Both files currently have:

```ts
jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: jest.fn(), replace: jest.fn() }),
}));
```

Change both to:

```ts
jest.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/draft/1',
  useSearchParams: () => new URLSearchParams(),
}));
```

- [ ] **Step 2: Update `OnboardingTargets.test.tsx`**

Change:

```ts
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn(), refresh: jest.fn() }),
  notFound: jest.fn(),
  redirect: jest.fn(),
}));
```

to:

```ts
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn(), refresh: jest.fn() }),
  usePathname: () => '/draft/1',
  useSearchParams: () => new URLSearchParams(),
  notFound: jest.fn(),
  redirect: jest.fn(),
}));
```

- [ ] **Step 3: Update `OnboardingTour.test.tsx`**

Change:

```ts
jest.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => mockPathname,
}));
```

to:

```ts
jest.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => mockPathname,
  useSearchParams: () => new URLSearchParams(),
}));
```

- [ ] **Step 4: Run the full suite to verify everything passes together**

Run: `pnpm test`
Expected: PASS — all suites, no `useSearchParams is not a function` failures anywhere

- [ ] **Step 5: Commit**

```bash
git add src/__tests__/criticalRouteLandmarks.test.tsx src/__tests__/criticalRouteAccessibility.test.tsx src/__tests__/OnboardingTargets.test.tsx src/__tests__/OnboardingTour.test.tsx
git commit -m "Add useSearchParams to remaining shared navigation test mocks"
```

---

### Task 11: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full quality gate**

Run: `make check`
Expected: typecheck, lint, format check, and the full Jest suite all pass with zero regressions from the pre-implementation baseline (123 suites / 1054 tests plus everything added in Tasks 1-10)

- [ ] **Step 2: Run a production build**

Run: `pnpm build`
Expected: succeeds, confirming every new `loading.tsx`/`not-found.tsx`/`error.tsx` is valid and that `useSearchParams()` usage in `AuctionSheet`/`RosterTracker`/`NominationHelper` doesn't trip the Suspense-boundary check now that each is wrapped by its segment's `loading.tsx`

- [ ] **Step 3: Manual browser verification**

Start the dev server (`make dev`), sign in, open an active draft, and check each acceptance criterion by hand:

1. On `/draft/[id]`: set a position filter, type a search term, change sort, toggle "Available only" — confirm the URL query string updates (search debounces; other controls update immediately). Copy the URL, open it in a new tab — confirm the same filtered/sorted view reproduces exactly.
2. Every filter/sort/search change uses `history.replaceState`, not `pushState` (see the Architecture note above), so it does not create a new back-button stop per click — that's deliberate, to avoid the back button becoming useless after dozens of filter clicks during a live draft. Verify the behavior this design actually produces: set some filters on `/draft/[id]`, navigate to `/draft/[id]/teams`, then hit back — confirm the value sheet reappears with your filters still applied (the last-replaced state), not reset to defaults.
3. On `/draft/[id]/teams` (desktop width): click a different team card — confirm `?team=` appears in the URL and reload reproduces the same selection. Change a sort chip — confirm `?sort=`/`?dir=` update.
4. On `/draft/[id]/nominate`: change the position filter chip — confirm `?pos=` updates and reload reproduces it.
5. Throttle the network (DevTools → Network → Slow 3G) and navigate between `/draft/[id]`, `/teams`, `/budget`, `/nominate` — confirm each shows its loading spinner/label immediately rather than a blank screen.
6. Visit `/draft/999999` (a non-existent draft ID) — confirm the tailored "Draft not found" page renders with a working "Back to Drafts" link, not the framework's generic 404.

Stop the dev server when done (`Ctrl+C` or kill the tracked PID) — do not leave it running.

- [ ] **Step 4: Report results**

Summarize the verification results (pass/fail per item above) before moving to PR/merge.
