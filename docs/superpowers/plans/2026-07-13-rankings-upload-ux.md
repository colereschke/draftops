# Rankings Upload UX Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/rankings` clearer for any rankings source (not just ETR), give users a template CSV, add a way to navigate off the page, and warn users when their upload doesn't cover a player the curated ETR pool would.

**Architecture:** Four additive, independent changes layered onto the existing `/rankings` page: (1) copy changes in `RankingsUploadForm`, (2) a static template file plus a download link, (3) a back-navigation link in the page, (4) a new pure `computeMissingFromEtr` lib function feeding both an extended summary line and a new `MissingFromEtrList` component. No changes to the CSV parsing contract (`rankingsImport.ts`), the upload server action, or the Prisma schema.

**Tech Stack:** Next.js 16 App Router (server components), React 'use client' components with inline styles + CSS custom properties (existing convention in `RankingsUpload/`), Jest + React Testing Library, `data-testid` selectors.

## Global Constraints

- Single quotes, trailing commas, 2-space indent, 100-char line width (Prettier) — formatting is auto-applied by the pre-commit hook, but write code that already conforms.
- No explicit `any`; prefer `interface` over `type` for object shapes.
- Select test elements by `data-testid`, never visible text or CSS class.
- No CSV header renaming and no alias/synonym header matching — the parser's required/optional column names (`Player`, `Team`, `Position`, `Age`, `2QBAuction`, `SF/TE Prem`, `Notes`) are unchanged.
- No new persisted field tracking "which optional columns were detected" on `UserRankingSet` — that idea is explicitly out of scope for this round.
- The ETR-coverage diff compares against the curated `src/data/players.ts` pool filtered to `QB`/`RB`/`WR`/`TE` only (never the full `SleeperPlayer` table, never `PICK`/`PKG` entries).
- No auto-fill of missing players — this plan only surfaces the gap, never fills it.
- Run `pnpm tsc --noEmit` and `pnpm lint` before considering any task done; do not commit with `--no-verify`.

---

### Task 1: Generalize the upload copy and document optional columns

**Files:**

- Modify: `src/components/RankingsUpload/RankingsUploadForm.tsx:70-82` (the empty-state `<p>` block)
- Test: `src/__tests__/RankingsUploadForm.test.tsx`

**Interfaces:**

- Consumes: nothing new.
- Produces: `data-testid="rankings-column-legend"` element in the empty-state branch, used by no other task but asserted in this task's test.

- [ ] **Step 1: Add a failing test for the new legend copy**

Add this test inside the existing `describe('RankingsUploadForm', ...)` block in `src/__tests__/RankingsUploadForm.test.tsx`, right after the `'shows upload prompt with no existing summary'` test:

```tsx
it('documents required and optional columns in the empty state', () => {
  render(<RankingsUploadForm summary={null} />);
  const legend = screen.getByTestId('rankings-column-legend');
  expect(legend).toHaveTextContent('Player, Team');
  expect(legend).toHaveTextContent('2QBAuction');
  expect(screen.getByText(/SF\/TE Prem/)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- RankingsUploadForm.test.tsx`
Expected: FAIL — `Unable to find an element by: [data-testid="rankings-column-legend"]`

- [ ] **Step 3: Replace the empty-state copy**

In `src/components/RankingsUpload/RankingsUploadForm.tsx`, replace the entire `) : ( ... )` empty-state branch (currently a single `<p>` reading "Upload an ETR dynasty rankings export...") with:

```tsx
      ) : (
        <div style={{ marginBottom: '0.75rem' }}>
          <p
            style={{
              margin: '0 0 0.5rem',
              color: 'var(--text-secondary)',
              fontFamily: 'var(--font-barlow)',
              fontSize: '0.875rem',
            }}
          >
            Upload a custom rankings CSV to use your own player pool at draft creation — works
            with an ETR export or any spreadsheet matching the format below.
          </p>
          <p
            data-testid="rankings-column-legend"
            style={{
              margin: '0 0 0.25rem',
              color: 'var(--text-secondary)',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.75rem',
            }}
          >
            <strong style={{ color: 'var(--text-primary)' }}>Required:</strong> Player, Team,
            Position (QB/RB/WR/TE/Pick), Age, 2QBAuction (dollar value)
          </p>
          <p
            style={{
              margin: 0,
              color: 'var(--text-secondary)',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.75rem',
            }}
          >
            <strong style={{ color: 'var(--text-primary)' }}>Optional:</strong> SF/TE Prem
            (explicit rank — used instead of deriving rank from value), Notes
          </p>
        </div>
      )}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test -- RankingsUploadForm.test.tsx`
Expected: PASS (all tests in the file, including the new one)

- [ ] **Step 5: Typecheck and lint**

Run: `pnpm tsc --noEmit && pnpm lint`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/components/RankingsUpload/RankingsUploadForm.tsx src/__tests__/RankingsUploadForm.test.tsx
git commit -m "feat: generalize rankings upload copy and document optional columns"
```

---

### Task 2: Downloadable template CSV

**Files:**

- Create: `public/rankings-template.csv`
- Modify: `src/components/RankingsUpload/RankingsUploadForm.tsx` (add download link inside the empty-state `<div>` added in Task 1)
- Test: `src/__tests__/RankingsUploadForm.test.tsx`, `src/__tests__/rankings-template.test.ts`

**Interfaces:**

- Consumes: the empty-state `<div>` from Task 1.
- Produces: `public/rankings-template.csv` at URL path `/rankings-template.csv`; `data-testid="rankings-template-link"`.

- [ ] **Step 1: Create the template CSV**

Create `public/rankings-template.csv`:

```
Player,Team,Position,Age,2QBAuction,SF/TE Prem,Notes
Josh Allen,BUF,QB,30.1,$51,2,
Bijan Robinson,ATL,RB,24.2,$68,1,
Ja'Marr Chase,CIN,WR,26.0,$72,3,
Brock Bowers,LV,TE,23.4,$44,4,
2027 1st Round Pick,NFL,PICK,,$12,5,Future pick
```

- [ ] **Step 2: Write a failing test that the template parses successfully**

Create `src/__tests__/rankings-template.test.ts`:

```ts
import fs from 'fs';
import path from 'path';
import { parseRankingsCsv } from '@/lib/rankingsImport';

describe('rankings-template.csv', () => {
  function readTemplate(): string {
    const csvPath = path.join(process.cwd(), 'public', 'rankings-template.csv');
    return fs.readFileSync(csvPath, 'utf-8');
  }

  it('is a valid rankings CSV that parses without errors', () => {
    const result = parseRankingsCsv(readTemplate());
    expect(result.ok).toBe(true);
  });

  it('includes one example row for each of QB, RB, WR, TE, and PICK', () => {
    const result = parseRankingsCsv(readTemplate());
    if (!result.ok) throw new Error('expected template to parse successfully');
    const positions = result.rows.map((r) => r.pos).sort();
    expect(positions).toEqual(['PICK', 'QB', 'RB', 'TE', 'WR']);
  });
});
```

This test already passes against the file created in Step 1 (there's no separate "implementation" step for the CSV itself — the file _is_ the implementation). Run it now to confirm the template is valid before moving on.

Run: `pnpm test -- rankings-template.test.ts`
Expected: PASS

- [ ] **Step 3: Write a failing test for the download link**

Add to `src/__tests__/RankingsUploadForm.test.tsx`, in the same test added in Task 1 (extend it) or as a new test — add a new one for clarity:

```tsx
it('links to the downloadable template CSV', () => {
  render(<RankingsUploadForm summary={null} />);
  const link = screen.getByTestId('rankings-template-link');
  expect(link).toHaveAttribute('href', '/rankings-template.csv');
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `pnpm test -- RankingsUploadForm.test.tsx`
Expected: FAIL — `Unable to find an element by: [data-testid="rankings-template-link"]`

- [ ] **Step 5: Add the download link**

In `src/components/RankingsUpload/RankingsUploadForm.tsx`, inside the empty-state `<div>` added in Task 1, add this directly after the "Optional" `<p>` and before the closing `</div>`:

```tsx
<a
  href="/rankings-template.csv"
  download
  data-testid="rankings-template-link"
  style={{
    display: 'inline-block',
    marginTop: '0.5rem',
    color: 'var(--pos-te)',
    fontFamily: 'var(--font-barlow)',
    fontSize: '0.8rem',
    fontWeight: 700,
  }}
>
  Download template CSV
</a>
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm test -- RankingsUploadForm.test.tsx rankings-template.test.ts`
Expected: PASS

- [ ] **Step 7: Typecheck and lint**

Run: `pnpm tsc --noEmit && pnpm lint`
Expected: no errors

- [ ] **Step 8: Commit**

```bash
git add public/rankings-template.csv src/components/RankingsUpload/RankingsUploadForm.tsx src/__tests__/RankingsUploadForm.test.tsx src/__tests__/rankings-template.test.ts
git commit -m "feat: add downloadable rankings template CSV"
```

---

### Task 3: Back navigation link

**Files:**

- Modify: `src/app/rankings/page.tsx`

**Interfaces:**

- Consumes: nothing new.
- Produces: nothing consumed by later tasks (this task only touches the top of the returned JSX; Tasks 5 and 6 touch the body further down and do not depend on this change).

There is no existing precedent in this repo for unit-testing `app/**/page.tsx` server components directly (no test file targets any page.tsx today — see `src/__tests__/`), so this task is verified manually rather than with an automated test, consistent with that convention.

- [ ] **Step 1: Add the back link**

In `src/app/rankings/page.tsx`, add the import and the link:

```tsx
import Link from 'next/link';
import { redirect } from 'next/navigation';
```

(add `import Link from 'next/link';` above the existing `import { redirect } from 'next/navigation';` line)

Then, inside the returned `<main>`, insert this immediately before the `<h1>Custom Rankings</h1>` element:

```tsx
<Link
  href="/drafts"
  style={{
    display: 'inline-block',
    marginBottom: '1rem',
    color: 'var(--text-secondary)',
    fontFamily: 'var(--font-barlow)',
    fontSize: '0.8rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  }}
>
  ← All Drafts
</Link>
```

- [ ] **Step 2: Manually verify**

Run: `pnpm dev`
Navigate to `http://localhost:3000/rankings` while signed in. Confirm:

- A "← All Drafts" link renders above the "Custom Rankings" heading.
- Clicking it navigates to `/drafts`.

Stop the dev server when done (`Ctrl+C` or kill the background process).

- [ ] **Step 3: Typecheck and lint**

Run: `pnpm tsc --noEmit && pnpm lint`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/app/rankings/page.tsx
git commit -m "feat: add back navigation link to rankings page"
```

---

### Task 4: ETR-coverage diff (pure lib function)

**Files:**

- Create: `src/lib/rankingsCoverage.ts`
- Test: `src/__tests__/rankingsCoverage.test.ts`

**Interfaces:**

- Consumes: `players` from `@/data/players` (`Player[]`, field `player: string`, `pos: Position`), `normalizeName` from `@/lib/sleeperNormalize`.
- Produces: `ETR_SKILL_PLAYERS: Player[]` and `computeMissingFromEtr(uploadedNames: string[]): Player[]`, both consumed by Task 5 and Task 6.

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/rankingsCoverage.test.ts`:

```ts
import { computeMissingFromEtr, ETR_SKILL_PLAYERS } from '@/lib/rankingsCoverage';

describe('ETR_SKILL_PLAYERS', () => {
  it('excludes PICK and PKG entries', () => {
    expect(ETR_SKILL_PLAYERS.every((p) => ['QB', 'RB', 'WR', 'TE'].includes(p.pos))).toBe(true);
  });
});

describe('computeMissingFromEtr', () => {
  it('returns every ETR skill player when nothing is uploaded', () => {
    const missing = computeMissingFromEtr([]);
    expect(missing.length).toBe(ETR_SKILL_PLAYERS.length);
  });

  it('excludes players present in the uploaded set', () => {
    const someName = ETR_SKILL_PLAYERS[0].player;
    const missing = computeMissingFromEtr([someName]);
    expect(missing.find((p) => p.player === someName)).toBeUndefined();
    expect(missing.length).toBe(ETR_SKILL_PLAYERS.length - 1);
  });

  it('matches names via normalizeName (case, punctuation insensitive)', () => {
    const missing = computeMissingFromEtr(['JAMARR CHASE']);
    expect(missing.find((p) => p.player === "Ja'Marr Chase")).toBeUndefined();
  });

  it('returns an empty array when every ETR skill player is uploaded', () => {
    const allNames = ETR_SKILL_PLAYERS.map((p) => p.player);
    expect(computeMissingFromEtr(allNames)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test -- rankingsCoverage.test.ts`
Expected: FAIL — `Cannot find module '@/lib/rankingsCoverage'`

- [ ] **Step 3: Implement `rankingsCoverage.ts`**

Create `src/lib/rankingsCoverage.ts`:

```ts
import { players as ETR_PLAYERS } from '@/data/players';
import { normalizeName } from '@/lib/sleeperNormalize';
import type { Player, Position } from '@/types';

const SKILL_POSITIONS = new Set<Position>(['QB', 'RB', 'WR', 'TE']);

export const ETR_SKILL_PLAYERS: Player[] = ETR_PLAYERS.filter((p) => SKILL_POSITIONS.has(p.pos));

export function computeMissingFromEtr(uploadedNames: string[]): Player[] {
  const uploaded = new Set(uploadedNames.map(normalizeName));
  return ETR_SKILL_PLAYERS.filter((p) => !uploaded.has(normalizeName(p.player)));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test -- rankingsCoverage.test.ts`
Expected: PASS

- [ ] **Step 5: Typecheck and lint**

Run: `pnpm tsc --noEmit && pnpm lint`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/lib/rankingsCoverage.ts src/__tests__/rankingsCoverage.test.ts
git commit -m "feat: add computeMissingFromEtr coverage diff"
```

---

### Task 5: Coverage summary line

**Files:**

- Modify: `src/components/RankingsUpload/RankingsUploadForm.tsx` (extend `RankingSummaryView`, render coverage line)
- Modify: `src/app/rankings/page.tsx` (compute coverage, pass to `RankingsUploadForm`)
- Test: `src/__tests__/RankingsUploadForm.test.tsx`

**Interfaces:**

- Consumes: `computeMissingFromEtr`, `ETR_SKILL_PLAYERS` from `@/lib/rankingsCoverage` (Task 4).
- Produces: `RankingSummaryView.etrCoverage: { covered: number; total: number }`, `data-testid="rankings-etr-coverage"`. The `missingFromEtr` array computed in `page.tsx` is also consumed by Task 6.

- [ ] **Step 1: Write the failing test**

Update the existing `'shows the summary card when a ranking set exists'` test in `src/__tests__/RankingsUploadForm.test.tsx` — add `etrCoverage` to the passed summary and assert on the new line:

```tsx
it('shows the summary card when a ranking set exists', () => {
  render(
    <RankingsUploadForm
      summary={{
        fileName: 'my_rankings.csv',
        uploadedAt: '2026-07-01T00:00:00.000Z',
        totalCount: 267,
        matchedCount: 260,
        unmatchedCount: 7,
        etrCoverage: { covered: 300, total: 327 },
      }}
    />,
  );
  expect(screen.getByTestId('rankings-summary')).toHaveTextContent('267');
  expect(screen.getByTestId('rankings-upload-button')).toHaveTextContent('Re-upload CSV');
  expect(screen.getByTestId('rankings-etr-coverage')).toHaveTextContent(
    'Covers 300 of 327 ETR-ranked players',
  );
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- RankingsUploadForm.test.tsx`
Expected: FAIL — missing `data-testid="rankings-etr-coverage"` element. (This repo's Jest config transforms TypeScript via SWC without type-checking, so the missing `etrCoverage` field on the type won't surface here — `pnpm tsc --noEmit` catches that separately in Step 6.)

- [ ] **Step 3: Extend `RankingSummaryView` and render the coverage line**

In `src/components/RankingsUpload/RankingsUploadForm.tsx`, update the interface:

```tsx
export interface RankingSummaryView {
  fileName: string | null;
  uploadedAt: string;
  totalCount: number;
  matchedCount: number;
  unmatchedCount: number;
  etrCoverage: { covered: number; total: number };
}
```

Then, inside the `summary ? (...)` branch, add this `<p>` immediately after the "matched to Sleeper" `<p>`:

```tsx
<p
  data-testid="rankings-etr-coverage"
  style={{
    margin: '0.25rem 0 0',
    fontFamily: 'var(--font-mono)',
    color: 'var(--text-secondary)',
    fontSize: '0.8rem',
  }}
>
  Covers {summary.etrCoverage.covered} of {summary.etrCoverage.total} ETR-ranked players
</p>
```

- [ ] **Step 4: Wire coverage computation into `page.tsx`**

In `src/app/rankings/page.tsx`, add the import:

```tsx
import { computeMissingFromEtr, ETR_SKILL_PLAYERS } from '@/lib/rankingsCoverage';
```

Inside `RankingsPage`, after the `unmatched`/`sleeperPlayers` block, add:

```tsx
const missingFromEtr = rankingSet
  ? computeMissingFromEtr(rankingSet.players.map((p) => p.name))
  : [];
```

Then update the `summary={...}` prop passed to `<RankingsUploadForm />` to include the new field:

```tsx
<RankingsUploadForm
  summary={
    rankingSet
      ? {
          fileName: rankingSet.fileName,
          uploadedAt: rankingSet.uploadedAt.toISOString(),
          totalCount: rankingSet.players.length,
          matchedCount: rankingSet.players.filter(
            (p) => p.matchStatus === 'matched' || p.matchStatus === 'manual',
          ).length,
          unmatchedCount: unmatched.length,
          etrCoverage: {
            covered: ETR_SKILL_PLAYERS.length - missingFromEtr.length,
            total: ETR_SKILL_PLAYERS.length,
          },
        }
      : null
  }
/>
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm test -- RankingsUploadForm.test.tsx`
Expected: PASS

- [ ] **Step 6: Typecheck and lint**

Run: `pnpm tsc --noEmit && pnpm lint`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add src/components/RankingsUpload/RankingsUploadForm.tsx src/app/rankings/page.tsx src/__tests__/RankingsUploadForm.test.tsx
git commit -m "feat: show ETR coverage line in rankings summary"
```

---

### Task 6: Missing-players list component

**Files:**

- Create: `src/components/RankingsUpload/MissingFromEtrList.tsx`
- Modify: `src/app/rankings/page.tsx` (render the component)
- Test: `src/__tests__/MissingFromEtrList.test.tsx`

**Interfaces:**

- Consumes: `missingFromEtr` (`Player[]`) computed in `page.tsx` by Task 5's `computeMissingFromEtr`.
- Produces: `MissingFromEtrList({ names: string[] })` — a default export React component. `data-testid`s: `missing-from-etr-list`, `missing-from-etr-toggle`, `missing-from-etr-search`, `missing-from-etr-items`.

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/MissingFromEtrList.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MissingFromEtrList from '@/components/RankingsUpload/MissingFromEtrList';

describe('MissingFromEtrList', () => {
  it('renders nothing when there are no missing players', () => {
    const { container } = render(<MissingFromEtrList names={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('is collapsed by default', () => {
    render(<MissingFromEtrList names={['Josh Allen', 'Bijan Robinson']} />);
    expect(screen.getByTestId('missing-from-etr-toggle')).toHaveTextContent('2');
    expect(screen.queryByTestId('missing-from-etr-items')).not.toBeInTheDocument();
  });

  it('expands to show the list and filters by search text', async () => {
    const user = userEvent.setup();
    render(<MissingFromEtrList names={['Josh Allen', 'Bijan Robinson']} />);

    await user.click(screen.getByTestId('missing-from-etr-toggle'));
    expect(screen.getByTestId('missing-from-etr-items')).toHaveTextContent('Josh Allen');
    expect(screen.getByTestId('missing-from-etr-items')).toHaveTextContent('Bijan Robinson');

    await user.type(screen.getByTestId('missing-from-etr-search'), 'bijan');
    expect(screen.getByTestId('missing-from-etr-items')).toHaveTextContent('Bijan Robinson');
    expect(screen.getByTestId('missing-from-etr-items')).not.toHaveTextContent('Josh Allen');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test -- MissingFromEtrList.test.tsx`
Expected: FAIL — `Cannot find module '@/components/RankingsUpload/MissingFromEtrList'`

- [ ] **Step 3: Implement the component**

Create `src/components/RankingsUpload/MissingFromEtrList.tsx`:

```tsx
'use client';

import { useMemo, useState } from 'react';
import { normalizeName } from '@/lib/sleeperNormalize';

interface MissingFromEtrListProps {
  names: string[];
}

export default function MissingFromEtrList({ names }: MissingFromEtrListProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return names;
    const q = normalizeName(search);
    return names.filter((name) => normalizeName(name).includes(q));
  }, [names, search]);

  if (names.length === 0) return null;

  return (
    <div
      data-testid="missing-from-etr-list"
      style={{
        background: 'var(--bg-surface)',
        borderRadius: '6px',
        padding: '1.25rem',
        marginTop: '1rem',
      }}
    >
      <button
        type="button"
        data-testid="missing-from-etr-toggle"
        onClick={() => setOpen((prev) => !prev)}
        style={{
          background: 'none',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          fontFamily: 'var(--font-barlow)',
          fontSize: '0.8rem',
          color: 'var(--text-secondary)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        {open ? '▾' : '▸'} Missing from ETR pool ({names.length})
      </button>
      {open && (
        <div style={{ marginTop: '0.75rem' }}>
          <input
            type="text"
            data-testid="missing-from-etr-search"
            placeholder="Filter…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%',
              background: 'var(--bg-base)',
              border: '1px solid #2a2f3e',
              borderRadius: '4px',
              padding: '0.4rem 0.6rem',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.8rem',
              marginBottom: '0.5rem',
            }}
          />
          <ul
            data-testid="missing-from-etr-items"
            style={{
              listStyle: 'none',
              margin: 0,
              padding: 0,
              maxHeight: '240px',
              overflowY: 'auto',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.8rem',
              color: 'var(--text-primary)',
            }}
          >
            {filtered.map((name, i) => (
              <li key={`${name}-${i}`} style={{ padding: '0.2rem 0' }}>
                {name}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test -- MissingFromEtrList.test.tsx`
Expected: PASS

- [ ] **Step 5: Render it from `page.tsx`**

In `src/app/rankings/page.tsx`, add the import:

```tsx
import MissingFromEtrList from '@/components/RankingsUpload/MissingFromEtrList';
```

Then add this as the last element inside `<main>`, after the `{unmatched.length > 0 && (...)}` block:

```tsx
{
  rankingSet && <MissingFromEtrList names={missingFromEtr.map((p) => p.player)} />;
}
```

- [ ] **Step 6: Manually verify end-to-end**

Run: `pnpm dev`
Sign in, go to `/rankings`, upload a small custom CSV (e.g. the template from Task 2, or a real ETR export). Confirm:

- The summary card shows the "Covers X of 327 ETR-ranked players" line.
- Below any unmatched-resolution list, a collapsed "Missing from ETR pool (N)" section appears (skip if you happen to upload the exact full ETR pool with zero gaps).
- Expanding it shows a scrollable list of names, filterable by typing in the search box.

Stop the dev server when done.

- [ ] **Step 7: Typecheck and lint**

Run: `pnpm tsc --noEmit && pnpm lint`
Expected: no errors

- [ ] **Step 8: Run the full test suite**

Run: `pnpm test`
Expected: PASS (all tests, including the pre-existing rankings suite)

- [ ] **Step 9: Commit**

```bash
git add src/components/RankingsUpload/MissingFromEtrList.tsx src/app/rankings/page.tsx src/__tests__/MissingFromEtrList.test.tsx
git commit -m "feat: add missing-from-ETR-pool list to rankings page"
```
