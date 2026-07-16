# Logo & Sign-In Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give DraftOps a real visual identity (a gavel icon + wordmark lockup) and replace the barebones single-button sign-in page with a split-layout first impression, ahead of public release.

**Architecture:** Two new component folders — `src/components/Brand/` (the icon + lockup, reused in both NavBar and sign-in) and `src/components/SignIn/` (the new split/stacked sign-in layout + a decorative scrolling value ticker with curated static data). `src/app/sign-in/page.tsx` becomes a thin wrapper around the new `SignInScreen`. `src/components/NavBar/NavBar.tsx` swaps its plain-text wordmark for the same lockup, wrapped in a link to `/`. A static `src/app/icon.svg` supplies the favicon via Next.js's App Router file convention.

**Tech Stack:** Next.js 16 App Router, React server components (no client JS needed — all motion is CSS), Tailwind CSS 4 (existing `globals.css` design tokens), TypeScript 5 strict, Jest + React Testing Library.

## Global Constraints

- pnpm only — never npm or yarn.
- TypeScript strict mode; no explicit `any`; `interface` (not `type`) for all prop shapes.
- Functional components only.
- Single quotes, trailing commas, 2-space indent, 100 char line width (Prettier enforces this via lint-staged — don't hand-format against it).
- New test code selects by `data-testid`/`id`, never visible text/role+name/CSS class (existing tests that already use text selectors and still pass are left alone — see Task 4 and Task 7).
- No `Co-Authored-By` or other authorship lines in commit messages.
- Pre-commit hook runs `pnpm lint-staged` + `pnpm tsc --noEmit` — never bypass with `--no-verify`.
- **Accent color is the app's real `--primary` token** (`#d7ded2`, pale sage/cream) — not the violet `#7c6ff0` used in throwaway brainstorming mockups. Do not introduce a new brand-only color and do not change the shared `--primary` token itself.
- All colors/spacing come from the existing `globals.css` custom properties (`--bg-base`/`--bg-surface`, `--border-subtle`/`--border-default`, `--text-primary`/`--text-secondary`/`--text-muted`, `--primary`, `--age-young`/`--age-old`) via their mapped Tailwind utilities (`bg-background`, `bg-card`, `border-border-subtle`, `border-border`, `text-foreground`, `text-secondary-fg`, `text-muted-foreground`) or, for genuinely dynamic/computed colors (the ticker's up/down delta), inline `style={{ color: 'var(--age-young)' }}` — matching the existing convention in `src/components/AuctionSheet/PlayerTable.tsx` (e.g. `style={{ color: spreadColor(p.spread) }}`).
- `src/app/icon.svg` is a standalone static file with no access to the page's CSS custom properties — it must use the literal hex `#d7ded2`, not `var(--primary)`.
- Out of scope for this plan: `apple-icon`/PWA manifest icons, live/DB-backed ticker data, any change to `src/app/page.tsx` or the Discord OAuth flow itself, rebranding any page other than sign-in/NavBar/favicon.

---

### Task 1: Ticker animation CSS + curated player data

**Files:**

- Modify: `src/app/globals.css`
- Create: `src/components/SignIn/tickerPlayers.ts`
- Test: none (pure CSS + a plain data module; covered indirectly by Task 5's `ValueTicker` test)

**Interfaces:**

- Produces: `.ticker-scroll` CSS class (applies the scrolling animation, disabled under `prefers-reduced-motion: reduce`); `TickerEntry` interface and `TICKER_PLAYERS: TickerEntry[]` (50 entries) exported from `src/components/SignIn/tickerPlayers.ts`.

- [ ] **Step 1: Add the ticker keyframes and utility class to `globals.css`**

Append to the end of `src/app/globals.css` (after the existing `body { ... }` block):

```css
@keyframes ticker-scroll {
  from {
    transform: translateY(0);
  }
  to {
    transform: translateY(-50%);
  }
}

.ticker-scroll {
  animation: ticker-scroll 90s linear infinite;
}

@media (prefers-reduced-motion: reduce) {
  .ticker-scroll {
    animation: none;
  }
}
```

- [ ] **Step 2: Create the curated ticker data file**

Create `src/components/SignIn/tickerPlayers.ts`:

```ts
export interface TickerEntry {
  name: string;
  value: number;
  delta: number;
}

// Decorative marketing data only — not real/live player values. Sized at 50
// entries so a several-second glance at the sign-in page never sees an
// obvious repeat of the scroll loop.
export const TICKER_PLAYERS: TickerEntry[] = [
  { name: "Ja'Marr Chase", value: 187, delta: 2 },
  { name: 'Bijan Robinson', value: 174, delta: -1 },
  { name: 'CeeDee Lamb', value: 166, delta: 4 },
  { name: 'Justin Jefferson', value: 163, delta: 1 },
  { name: 'Jahmyr Gibbs', value: 168, delta: 2 },
  { name: 'Amon-Ra St. Brown', value: 158, delta: 3 },
  { name: 'Ashton Jeanty', value: 152, delta: 8 },
  { name: 'Malik Nabers', value: 151, delta: -3 },
  { name: 'Brian Thomas Jr.', value: 144, delta: 6 },
  { name: 'Saquon Barkley', value: 141, delta: 3 },
  { name: 'Puka Nacua', value: 139, delta: -2 },
  { name: "De'Von Achane", value: 133, delta: -2 },
  { name: 'Christian McCaffrey', value: 128, delta: -6 },
  { name: 'Drake London', value: 121, delta: 5 },
  { name: 'Brock Bowers', value: 121, delta: 7 },
  { name: 'Nico Collins', value: 119, delta: -1 },
  { name: 'Breece Hall', value: 118, delta: -4 },
  { name: 'Garrett Wilson', value: 114, delta: -1 },
  { name: 'Marvin Harrison Jr.', value: 112, delta: -3 },
  { name: 'Jonathan Taylor', value: 109, delta: 1 },
  { name: 'Jayden Daniels', value: 105, delta: 9 },
  { name: 'Bucky Irving', value: 102, delta: 5 },
  { name: 'Ladd McConkey', value: 97, delta: 6 },
  { name: 'Josh Jacobs', value: 96, delta: -1 },
  { name: 'Trey McBride', value: 94, delta: 5 },
  { name: 'Jaxon Smith-Njigba', value: 92, delta: 3 },
  { name: 'Chris Olave', value: 89, delta: 2 },
  { name: 'Sam LaPorta', value: 88, delta: -2 },
  { name: 'Derrick Henry', value: 88, delta: -2 },
  { name: 'Rome Odunze', value: 84, delta: 4 },
  { name: 'Lamar Jackson', value: 82, delta: -1 },
  { name: 'DeVonta Smith', value: 81, delta: -1 },
  { name: 'Tee Higgins', value: 79, delta: 1 },
  { name: 'Josh Allen', value: 78, delta: -2 },
  { name: 'Xavier Worthy', value: 77, delta: 6 },
  { name: 'Terry McLaurin', value: 76, delta: 3 },
  { name: 'Caleb Williams', value: 73, delta: 4 },
  { name: 'DK Metcalf', value: 72, delta: -2 },
  { name: 'Zay Flowers', value: 71, delta: 1 },
  { name: 'Patrick Mahomes', value: 71, delta: 1 },
  { name: 'Jalen Hurts', value: 68, delta: -1 },
  { name: 'Rashee Rice', value: 68, delta: -2 },
  { name: 'Joe Burrow', value: 69, delta: 2 },
  { name: 'C.J. Stroud', value: 64, delta: -1 },
  { name: 'George Kittle', value: 66, delta: -1 },
  { name: 'Tank Dell', value: 61, delta: -1 },
  { name: 'Jordan Addison', value: 59, delta: -1 },
  { name: 'Mark Andrews', value: 58, delta: -3 },
  { name: 'Anthony Richardson', value: 51, delta: -5 },
  { name: 'Kyler Murray', value: 47, delta: 2 },
];
```

- [ ] **Step 3: Verify the project still builds**

Run: `pnpm tsc --noEmit`
Expected: no errors (this file has no consumers yet, but must type-check on its own).

- [ ] **Step 4: Commit**

```bash
git add src/app/globals.css src/components/SignIn/tickerPlayers.ts
git commit -m "feat: add ticker animation styles and curated sign-in ticker data"
```

---

### Task 2: `LogoMark` icon component

**Files:**

- Create: `src/components/Brand/LogoMark.tsx`
- Test: none (pure presentational SVG — no dedicated unit test, consistent with other purely-presentational pieces in this repo, e.g. `POS_COLORS`-driven badges)

**Interfaces:**

- Produces: `export default function LogoMark(props: { size?: number; className?: string })` — a gavel-shaped SVG icon, `viewBox="0 0 32 32"`, filled with `var(--primary)`.

- [ ] **Step 1: Create the component**

Create `src/components/Brand/LogoMark.tsx`:

```tsx
interface LogoMarkProps {
  size?: number;
  className?: string;
}

export default function LogoMark({ size = 24, className }: LogoMarkProps) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} className={className} aria-hidden="true">
      {/* Head crosses the handle perpendicularly before rotation — that crossing
          is what reads as a mallet rather than a tapered diagonal bar. */}
      <g transform="rotate(-40 16 16)">
        <rect x="14.8" y="9" width="2.4" height="19" rx="1.2" fill="var(--primary)" />
        <rect x="9.5" y="5" width="13" height="7" rx="2" fill="var(--primary)" />
      </g>
      <rect x="5" y="24" width="11" height="4.5" rx="1.5" fill="var(--primary)" />
    </svg>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/Brand/LogoMark.tsx
git commit -m "feat: add LogoMark gavel icon component"
```

---

### Task 3: `LogoLockup` icon + wordmark component

**Files:**

- Create: `src/components/Brand/LogoLockup.tsx`
- Test: none (pure presentational markup, same rationale as Task 2)

**Interfaces:**

- Consumes: `LogoMark` (default export, `{ size?, className? }`) from Task 2.
- Produces: `export default function LogoLockup(props: { size?: number; textClassName?: string; className?: string })` — icon-left lockup rendering `LogoMark` + a "DraftOps" wordmark span.

- [ ] **Step 1: Create the component**

Create `src/components/Brand/LogoLockup.tsx`:

```tsx
import { cn } from '@/lib/utils';
import LogoMark from './LogoMark';

interface LogoLockupProps {
  size?: number;
  textClassName?: string;
  className?: string;
}

export default function LogoLockup({
  size = 20,
  textClassName = 'text-label-lg',
  className,
}: LogoLockupProps) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <LogoMark size={size} />
      <span
        className={cn(
          'font-label text-foreground font-bold tracking-wide uppercase',
          textClassName,
        )}
      >
        DraftOps
      </span>
    </span>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/Brand/LogoLockup.tsx
git commit -m "feat: add LogoLockup icon+wordmark component"
```

---

### Task 4: Wire `LogoLockup` into NavBar with a home link

**Files:**

- Modify: `src/components/NavBar/NavBar.tsx:1-22`
- Modify: `src/__tests__/NavBar.test.tsx`

**Interfaces:**

- Consumes: `LogoLockup` (default export) from Task 3.

- [ ] **Step 1: Write the new failing test**

In `src/__tests__/NavBar.test.tsx`, add this test inside the existing `describe('NavBar', ...)` block (after the last test, before the closing `});`):

```tsx
it('links the logo back to home', () => {
  render(<NavBar session={null} />);
  expect(screen.getByTestId('nav-logo-link')).toHaveAttribute('href', '/');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- NavBar.test.tsx -t "links the logo back to home"`
Expected: FAIL — `Unable to find an element by: [data-testid="nav-logo-link"]`

- [ ] **Step 3: Update `NavBar.tsx`**

In `src/components/NavBar/NavBar.tsx`, `Link` from `next/link` is already imported (line 2) — add only the `LogoLockup` import, after the existing `lucide-react` import:

```tsx
import LogoLockup from '@/components/Brand/LogoLockup';
```

Replace the wordmark span (lines 20-22):

```tsx
<span className="font-label text-label-lg text-foreground font-bold tracking-wide uppercase">
  DraftOps
</span>
```

with:

```tsx
<Link href="/" data-testid="nav-logo-link">
  <LogoLockup />
</Link>
```

- [ ] **Step 4: Run the full NavBar test file**

Run: `pnpm test -- NavBar.test.tsx`
Expected: PASS — all existing tests (including the `getByText('DraftOps')` ones, since the wordmark text is still rendered inside `LogoLockup`) plus the new home-link test.

- [ ] **Step 5: Type-check and lint**

Run: `pnpm tsc --noEmit && pnpm lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/NavBar/NavBar.tsx src/__tests__/NavBar.test.tsx
git commit -m "feat: link NavBar logo lockup to home"
```

---

### Task 5: `ValueTicker` scrolling component

**Files:**

- Create: `src/components/SignIn/ValueTicker.tsx`
- Test: `src/__tests__/ValueTicker.test.tsx`

**Interfaces:**

- Consumes: `TICKER_PLAYERS`, `TickerEntry` from `src/components/SignIn/tickerPlayers.ts` (Task 1); `.ticker-scroll` CSS class (Task 1).
- Produces: `export default function ValueTicker(props: { className?: string })` — renders the curated list twice back-to-back inside a scrolling, fade-masked container. Each row carries `data-testid="ticker-row"`.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/ValueTicker.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import ValueTicker from '@/components/SignIn/ValueTicker';
import { TICKER_PLAYERS } from '@/components/SignIn/tickerPlayers';

describe('ValueTicker', () => {
  it('renders the curated list twice for a seamless scroll loop', () => {
    render(<ValueTicker />);
    expect(screen.getAllByTestId('ticker-row')).toHaveLength(TICKER_PLAYERS.length * 2);
  });

  it('renders the first curated player name', () => {
    render(<ValueTicker />);
    expect(screen.getAllByText(TICKER_PLAYERS[0].name).length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- ValueTicker.test.tsx`
Expected: FAIL — `Cannot find module '@/components/SignIn/ValueTicker'`

- [ ] **Step 3: Create the component**

Create `src/components/SignIn/ValueTicker.tsx`:

```tsx
import { ArrowUp, ArrowDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TICKER_PLAYERS, type TickerEntry } from './tickerPlayers';

function TickerRow({ name, value, delta }: TickerEntry) {
  const Arrow = delta > 0 ? ArrowUp : ArrowDown;
  const deltaColor = delta > 0 ? 'var(--age-young)' : 'var(--age-old)';

  return (
    <div
      data-testid="ticker-row"
      className="border-border-subtle flex items-center gap-3 border-b px-6 py-2.5 text-sm"
    >
      <span className="text-secondary-fg flex-1 truncate">{name}</span>
      <span className="font-mono text-foreground tabular-nums">${value}</span>
      <span
        className="flex items-center gap-0.5 font-mono text-xs tabular-nums"
        style={{ color: deltaColor }}
      >
        <Arrow className="size-3" />
        {Math.abs(delta)}
      </span>
    </div>
  );
}

interface ValueTickerProps {
  className?: string;
}

export default function ValueTicker({ className }: ValueTickerProps) {
  return (
    <div className={cn('relative overflow-hidden', className)}>
      <div className="from-background pointer-events-none absolute inset-x-0 top-0 z-10 h-14 bg-gradient-to-b to-transparent" />
      <div className="ticker-scroll">
        {TICKER_PLAYERS.map((p) => (
          <TickerRow key={`a-${p.name}`} {...p} />
        ))}
        {TICKER_PLAYERS.map((p) => (
          <TickerRow key={`b-${p.name}`} {...p} />
        ))}
      </div>
      <div className="from-background pointer-events-none absolute inset-x-0 bottom-0 z-10 h-14 bg-gradient-to-t to-transparent" />
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test -- ValueTicker.test.tsx`
Expected: PASS

- [ ] **Step 5: Type-check and lint**

Run: `pnpm tsc --noEmit && pnpm lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/SignIn/ValueTicker.tsx src/__tests__/ValueTicker.test.tsx
git commit -m "feat: add ValueTicker scrolling component"
```

---

### Task 6: `SignInScreen` split/stacked layout

**Files:**

- Create: `src/components/SignIn/SignInScreen.tsx`
- Test: none new (covered by the existing `src/__tests__/sign-in.test.tsx`, updated in Task 7 to render through this component — see that task)

**Interfaces:**

- Consumes: `LogoLockup` (Task 3), `ValueTicker` (Task 5), `signIn` from `@/auth` (existing).
- Produces: `export default function SignInScreen(props: { callbackUrl: string })` — full sign-in page body (brand panel + Discord form + ticker), split on `md:` and up, stacked below it.

- [ ] **Step 1: Create the component**

Create `src/components/SignIn/SignInScreen.tsx`:

```tsx
import { signIn } from '@/auth';
import LogoLockup from '@/components/Brand/LogoLockup';
import ValueTicker from './ValueTicker';

interface SignInScreenProps {
  callbackUrl: string;
}

export default function SignInScreen({ callbackUrl }: SignInScreenProps) {
  return (
    <div className="bg-background flex min-h-screen flex-col md:flex-row">
      <div className="bg-card border-border flex flex-col items-center justify-center gap-6 border-b px-8 py-16 text-center md:w-[40%] md:items-start md:border-r md:border-b-0 md:px-14 md:py-0 md:text-left">
        <LogoLockup size={26} textClassName="text-[19px] md:text-[21px]" />
        <div className="flex flex-col items-center md:items-start">
          <span
            className="text-[10px] font-bold tracking-[0.15em] uppercase md:text-[10.5px]"
            style={{ color: 'var(--primary)' }}
          >
            Dynasty Auction Draft Tool
          </span>
          <h1 className="text-foreground mt-2 text-[21px] leading-snug font-extrabold md:text-[27px]">
            Every dollar.
            <br />
            Every rival.
            <br />
            One room.
          </h1>
        </div>
        <form
          action={async () => {
            'use server';
            await signIn('discord', { redirectTo: callbackUrl });
          }}
        >
          <button
            type="submit"
            className="rounded-md bg-[#5865F2] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#4752c4]"
          >
            Sign in with Discord
          </button>
        </form>
      </div>
      <ValueTicker className="h-[150px] md:h-auto md:flex-1" />
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/SignIn/SignInScreen.tsx
git commit -m "feat: add SignInScreen split-layout component"
```

---

### Task 7: Wire `SignInScreen` into `/sign-in`

**Files:**

- Modify: `src/app/sign-in/page.tsx`
- Test: `src/__tests__/sign-in.test.tsx` (existing — must keep passing unmodified)

**Interfaces:**

- Consumes: `SignInScreen` (Task 6).

- [ ] **Step 1: Replace the page body**

Replace the full contents of `src/app/sign-in/page.tsx`:

```tsx
import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import SignInScreen from '@/components/SignIn/SignInScreen';

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const [session, params] = await Promise.all([auth(), searchParams]);
  if (session) redirect('/');

  const raw = params.callbackUrl ?? '/';
  const callbackUrl = raw.startsWith('/') ? raw : '/';

  return <SignInScreen callbackUrl={callbackUrl} />;
}
```

- [ ] **Step 2: Run the existing sign-in tests to confirm they still pass unmodified**

Run: `pnpm test -- sign-in.test.tsx`
Expected: PASS — all three existing tests (`renders the Discord sign-in button...`, `renders the DraftOps wordmark`, `redirects to / when already authenticated`) pass with no changes to the test file, since `SignInScreen` still renders a submit button reading "Sign in with Discord" and a "DraftOps" text node.

- [ ] **Step 3: Type-check and lint**

Run: `pnpm tsc --noEmit && pnpm lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/sign-in/page.tsx
git commit -m "feat: render sign-in page through SignInScreen"
```

---

### Task 8: Static favicon

**Files:**

- Create: `src/app/icon.svg`

**Interfaces:**

- None (standalone static file; Next.js's App Router file convention wires this into page `<head>` metadata automatically — no change to `src/app/layout.tsx` needed).

- [ ] **Step 1: Create the favicon**

Create `src/app/icon.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <!-- Same geometry as src/components/Brand/LogoMark.tsx. Kept in sync by hand
       (only three shapes) — this file can't use var(--primary) since a
       standalone favicon SVG has no access to the page's CSS custom
       properties, so the color is the literal hex instead. -->
  <g transform="rotate(-40 16 16)">
    <rect x="14.8" y="9" width="2.4" height="19" rx="1.2" fill="#d7ded2" />
    <rect x="9.5" y="5" width="13" height="7" rx="2" fill="#d7ded2" />
  </g>
  <rect x="5" y="24" width="11" height="4.5" rx="1.5" fill="#d7ded2" />
</svg>
```

- [ ] **Step 2: Verify the dev server picks it up**

Run: `pnpm dev` (in the background, or in a separate terminal), then load `http://localhost:3000/icon.svg` directly in a browser or via:

Run: `curl -sf http://localhost:3000/icon.svg | head -c 200`
Expected: the SVG markup above is returned (confirms Next.js is serving the file). Stop the dev server afterward.

- [ ] **Step 3: Commit**

```bash
git add src/app/icon.svg
git commit -m "feat: add gavel favicon"
```

---

### Task 9: Full quality gate

**Files:** none (verification only)

- [ ] **Step 1: Run the complete quality gate**

Run: `make check`
Expected: all pass (typecheck, lint, format check, full test suite) — this mirrors the pre-commit hook and CI checks.

- [ ] **Step 2: Build the production bundle**

Run: `pnpm build`
Expected: build succeeds with no errors. Confirms `src/app/icon.svg` and the new sign-in page compose correctly under the real Next.js build pipeline, not just `tsc`.

- [ ] **Step 3: Manual browser check (not automatable)**

Start the dev server (`pnpm dev`), visit `/sign-in` at both a desktop width and a narrow (~375px) width, and confirm:

- the gavel + "DraftOps" lockup, tagline, and Discord button render correctly at both sizes
- the ticker scrolls smoothly and is fade-masked top/bottom
- the browser tab shows the new gavel favicon
- visiting any authenticated page (e.g. `/`) shows the same lockup, now linked, in the NavBar

Kill the dev server when done (`kill` the backgrounded PID, or Ctrl-C in its terminal).
