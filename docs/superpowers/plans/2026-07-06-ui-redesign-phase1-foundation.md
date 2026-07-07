# UI Redesign — Phase 1: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the existing dark-mode CSS custom properties into Tailwind's `@theme`, establish a named type/spacing/radius scale, initialize shadcn/ui, and rebuild `NavBar`/`NavLinks` on top of it — proving the whole pipeline (tokens → Tailwind theme → shadcn primitive → real component) on one small, real, interactive surface before later phases (BidModal, AuctionSheet, remaining pages) repeat the pattern.

**Architecture:** `globals.css` gains a reconciled `@theme` block that maps shadcn/ui's canonical semantic token names (`--primary`, `--muted-foreground`, `--ring`, etc.) directly onto the app's existing hex palette, rather than inventing a parallel naming scheme — this is what lets shadcn-generated components (`Button`, `DropdownMenu`) pick up the app's colors with zero per-component overrides. `NavLinks.tsx`'s hand-rolled dropdown (`useState`/`useRef`/click-outside listener) is replaced by shadcn's `DropdownMenu`, and `NavBar.tsx`'s sign-out control becomes a shadcn `Button`.

**Tech Stack:** Next.js 16 (App Router), Tailwind CSS v4 (`@theme`, CSS-first config, no `tailwind.config.ts`), shadcn/ui CLI v4 (uses `@base-ui/react` as the primitive library by default — **not** Radix; verified via a live dry run of this exact CLI version against this repo), pnpm.

## Global Constraints

- **Dark-mode only.** No light theme, no `.dark` class toggle, no `next-themes`. One value set in `:root`.
- **Keep the existing 3-font system** — Barlow Condensed (labels/headers), Inter (body), JetBrains Mono (numbers). Do **not** let shadcn's Geist font auto-injection survive — the CLI adds it automatically during `init`; it must be reverted.
- **shadcn/ui CLI v4 defaults to Base UI** (`@base-ui/react`), not Radix. Use the CLI's plain defaults (`-d` flag) — no `--base radix` override. This was confirmed by actually running `npx shadcn@latest init -d` against this repo in a throwaway worktree.
- **The new brand/interactive color fills shadcn's own `--primary` / `--ring` roles** — it is _not_ given a separately-invented name. shadcn already has a token called `--accent`, but that role means "subtle hover background" (used by `DropdownMenuItem` on focus), a different concept from "brand CTA color." Naming the brand color `--primary` avoids this collision and means `Button`'s default variant, focus rings, etc. automatically pick it up.
- **No new automated tests for `NavBar`/`NavLinks`.** They are presentational navigation chrome with no existing test coverage — consistent with this repo's convention that `data-testid`-based tests are reserved for logic-bearing components (see the approved spec's Testing/Verification section). Verification here is `pnpm tsc --noEmit`, `pnpm lint`, and a manual dev-server QA pass.
- **Elevation via borders, not shadows.** No `box-shadow` on any new/modified surface. shadcn's default `DropdownMenuContent` ships with `shadow-md`; it must be removed.
- Package manager is **pnpm** only — never `npm`/`yarn`.
- Work happens in an isolated worktree (created via `superpowers:using-git-worktrees` before task execution begins), not directly on `main`.

---

### Task 1: Initialize shadcn/ui, add Button + DropdownMenu, reconcile design tokens

**Files:**

- Modify: `package.json`, `pnpm-lock.yaml` (via CLI + pnpm, not hand-edited)
- Create: `components.json`
- Create: `src/lib/utils.ts`
- Create: `src/components/ui/button.tsx`
- Create: `src/components/ui/dropdown-menu.tsx`
- Modify: `src/app/globals.css`
- Modify: `src/app/layout.tsx` (revert the CLI's automatic Geist font injection)

**Interfaces:**

- Produces: `cn(...)` from `@/lib/utils` — the standard shadcn className-merge helper (`clsx` + `tailwind-merge`), used by every later task that touches these components.
- Produces: `Button` from `@/components/ui/button` — accepts `variant` (`"default" | "outline" | "secondary" | "ghost" | "destructive" | "link"`) and `size` (`"default" | "xs" | "sm" | "lg" | "icon" | ...`), plus a `render` prop (Base UI composition — pass a React element to have `Button` clone it instead of rendering its own root).
- Produces: `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuItem`, `DropdownMenuSeparator` from `@/components/ui/dropdown-menu`. `DropdownMenuTrigger` and `DropdownMenuItem` both accept a `render` prop for composing with `Button` / `next/link`'s `Link` respectively (Base UI's composition pattern — verified against Base UI's own docs).
- Produces: Tailwind utility classes `bg-card`, `bg-popover`, `bg-secondary`, `bg-primary`, `text-foreground`, `text-muted-foreground`, `text-primary`, `border-border`, `ring-ring`, plus app-specific `font-label`, `text-label-xs|sm|md|lg`, and named spacing `gap-xs|sm|md|lg|xl` / `p-xs|sm|md|lg|xl` etc.

- [ ] **Step 1: Run `npx shadcn@latest init -d`**

  Run: `npx shadcn@latest init -d`

  Expected output: detects Next.js and Tailwind v4 automatically, writes `components.json`, creates `src/lib/utils.ts` and `src/components/ui/button.tsx`, modifies `src/app/globals.css` and `src/app/layout.tsx`, and adds these dependencies to `package.json`: `@base-ui/react`, `class-variance-authority`, `clsx`, `lucide-react`, `shadcn`, `tailwind-merge`, `tw-animate-css`.

  This is non-interactive (`-d` skips all prompts) — do not add `-y` alone, and do not pass `--base radix` (verified: this CLI version's actual default is Base UI, not Radix, and there's no reason to deviate from it here).

- [ ] **Step 2: Run `npx shadcn@latest add dropdown-menu`**

  Run: `npx shadcn@latest add dropdown-menu`

  Expected output: creates `src/components/ui/dropdown-menu.tsx`. (`button` is skipped/already present from Step 1.)

- [ ] **Step 3: Replace the generated token block in `src/app/globals.css`**

  The CLI's auto-generated `:root`/`.dark`/`@theme inline` block (light-mode oklch defaults, unused `sidebar-*`/`chart-*` tokens, a `font-sans`/`font-heading` pair wired to Geist) needs to be replaced with a version that (a) is dark-only with no `.dark` class split, (b) maps shadcn's canonical token names onto this app's existing hex palette instead of inventing new colors, and (c) adds the label/body/mono type scale and named spacing scale from the approved spec.

  Replace the entire file with:

  ```css
  @import 'tailwindcss';
  @import 'tw-animate-css';
  @import 'shadcn/tailwind.css';

  @custom-variant dark (&:is(.dark *));

  :root {
    --bg-base: #0a0d14;
    --bg-surface: #141824;
    --bg-elevated: #1a1f2e;
    --border-subtle: #1e2434;
    --border-default: #2a3048;
    --text-primary: #e8eaf0;
    --text-secondary: #8892a4;
    --text-muted: #4a5168;

    --pos-qb: #4f83e8;
    --pos-rb: #4caf6e;
    --pos-wr: #e8a030;
    --pos-te: #c060d0;
    --pos-pick: #40b0b0;
    --pos-pkg: #f0c040;

    --age-young: #4caf6e;
    --age-prime: #e8eaf0;
    --age-aging: #e8a030;
    --age-old: #e05050;

    /* shadcn/ui canonical tokens, mapped onto the palette above.
       Dark-only app: one value set, no .dark class toggle. */
    --background: var(--bg-base);
    --foreground: var(--text-primary);
    --card: var(--bg-surface);
    --card-foreground: var(--text-primary);
    --popover: var(--bg-elevated);
    --popover-foreground: var(--text-primary);
    --primary: #7c6ff0;
    --primary-foreground: var(--text-primary);
    --secondary: var(--bg-elevated);
    --secondary-foreground: var(--text-primary);
    --muted: var(--bg-elevated);
    --muted-foreground: var(--text-muted);
    --accent: #232a3d;
    --accent-foreground: var(--text-primary);
    --destructive: var(--age-old);
    --border: var(--border-default);
    --input: var(--border-default);
    --ring: #7c6ff0;
    --radius: 0.5rem;
  }

  @theme inline {
    --color-background: var(--background);
    --color-foreground: var(--foreground);
    --color-card: var(--card);
    --color-card-foreground: var(--card-foreground);
    --color-popover: var(--popover);
    --color-popover-foreground: var(--popover-foreground);
    --color-primary: var(--primary);
    --color-primary-foreground: var(--primary-foreground);
    --color-secondary: var(--secondary);
    --color-secondary-foreground: var(--secondary-foreground);
    --color-muted: var(--muted);
    --color-muted-foreground: var(--muted-foreground);
    --color-accent: var(--accent);
    --color-accent-foreground: var(--accent-foreground);
    --color-destructive: var(--destructive);
    --color-border: var(--border);
    --color-input: var(--input);
    --color-ring: var(--ring);

    --radius-sm: calc(var(--radius) * 0.6);
    --radius-md: calc(var(--radius) * 0.8);
    --radius-lg: var(--radius);
    --radius-xl: calc(var(--radius) * 1.4);

    --font-label: var(--font-barlow), sans-serif;

    --text-label-xs: 11px;
    --text-label-sm: 12px;
    --text-label-md: 13px;
    --text-label-lg: 15px;

    --text-body-sm: 12px;
    --text-body-md: 14px;
    --text-body-lg: 16px;

    --text-mono-sm: 12px;
    --text-mono-md: 13px;
    --text-mono-lg: 16px;

    --spacing-xs: 4px;
    --spacing-sm: 8px;
    --spacing-md: 12px;
    --spacing-lg: 20px;
    --spacing-xl: 32px;
  }

  @layer base {
    * {
      @apply border-border outline-ring/50;
    }
  }

  * {
    box-sizing: border-box;
  }

  .nav-link {
    transition: color 0.15s ease;
  }

  .nav-link:hover {
    color: var(--text-primary) !important;
  }

  body {
    background-color: var(--bg-base);
    color: var(--text-primary);
    -webkit-font-smoothing: antialiased;
    margin: 0;
  }
  ```

  Notes on choices an implementer might question:
  - `--pos-*` / `--age-*` are deliberately **not** given `--color-*` theme aliases — they stay runtime inline-style values (existing, unchanged exception).
  - `--muted-foreground` maps to `--text-muted` (the _dimmest_ app gray, `#4a5168`), not `--text-secondary` (`#8892a4`, a mid gray). This matches what `NavLinks`/`NavBar` actually use today for de-emphasized text. `--text-secondary` isn't wired into the shadcn theme yet — no current Phase 1 component needs it as a utility class; a later phase can map it once a component that actually uses it gets converted.
  - `--radius: 0.5rem` (8px) rather than the flat `sm/md/lg = 4/6/8` scale sketched in the spec doc — shadcn's generated components (`Button`, `DropdownMenu`) hardcode references to `--radius-md` etc. via the `calc()` pattern shown above, not flat literals, so the calc-based scale is what actually reaches the components. With this base, `radius-sm≈4.8px`, `radius-md≈6.4px`, `radius-lg=8px` — matches the spec's intent closely enough that it isn't worth fighting the generator's own convention.
  - `font-variant-numeric: tabular-nums` for the mono token is **deferred to Phase 3** (AuctionSheet) — no component touched in this phase renders any numbers, so there's nothing to apply it to or verify yet.

- [ ] **Step 4: Remove `shadow-md`/`shadow-lg` from `src/components/ui/dropdown-menu.tsx`**

  Two occurrences to strip — this project's "elevation via borders, not shadows" rule applies to the whole shared primitive file, not just the parts Phase 1 happens to use.

  In `DropdownMenuContent`, find:

  ```tsx
  className={cn("z-50 max-h-(--available-height) w-(--anchor-width) min-w-32 origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 outline-none data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:overflow-hidden data-closed:fade-out-0 data-closed:zoom-out-95", className )}
  ```

  Remove ` shadow-md` (right after `text-popover-foreground`), leaving the rest of the class string unchanged.

  In `DropdownMenuSubContent` (unused by this phase — no submenu in `NavLinks` — but part of the same shared file), find:

  ```tsx
  className={cn("w-auto min-w-[96px] rounded-lg bg-popover p-1 text-popover-foreground shadow-lg ring-1 ring-foreground/10 duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95", className )}
  ```

  Remove ` shadow-lg` (right after `text-popover-foreground`), leaving the rest unchanged.

  Both leave `ring-1 ring-foreground/10` as the sole boundary treatment, consistent with `DropdownMenuContent`.

- [ ] **Step 5: Revert `src/app/layout.tsx`'s Geist font auto-injection**

  `shadcn init` unconditionally adds a Geist font and rewires the `<html>` className. This app is keeping its existing 3-font system, so undo it — replace the full file with (i.e., its pre-Step-1 content, unchanged):

  ```tsx
  import type { Metadata } from 'next';
  import { Barlow_Condensed, Inter, JetBrains_Mono } from 'next/font/google';
  import { auth } from '@/auth';
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

  export default async function RootLayout({ children }: { children: React.ReactNode }) {
    const session = await auth();

    return (
      <html
        lang="en"
        className={`${inter.variable} ${barlowCondensed.variable} ${jetbrainsMono.variable}`}
      >
        <body style={{ fontFamily: 'var(--font-inter), sans-serif' }}>
          <NavBar session={session} />
          {children}
        </body>
      </html>
    );
  }
  ```

- [ ] **Step 6: Verify**

  Run: `pnpm tsc --noEmit`
  Expected: no errors.

  Run: `pnpm lint`
  Expected: only the 4 pre-existing `react-hooks/exhaustive-deps` warnings in `AuctionSheet.tsx` / `NominationHelper.tsx` (unrelated to this change) — zero new warnings or errors.

- [ ] **Step 7: Commit**

  ```bash
  git add package.json pnpm-lock.yaml components.json src/lib/utils.ts src/components/ui/button.tsx src/components/ui/dropdown-menu.tsx src/app/globals.css src/app/layout.tsx
  git commit -m "feat: init shadcn/ui, add Button + DropdownMenu, wire design tokens"
  ```

---

### Task 2: Rebuild `NavLinks.tsx` on Tailwind classes + shadcn `DropdownMenu`

**Files:**

- Modify: `src/components/NavBar/NavLinks.tsx`

**Interfaces:**

- Consumes: `Button` from `@/components/ui/button`; `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuItem`, `DropdownMenuSeparator` from `@/components/ui/dropdown-menu`; `cn` from `@/lib/utils` (all produced by Task 1).
- Produces: `NavLinks` — no props, same as before. Behavior unchanged: fetches `/api/drafts` and (if the current draft isn't in that list) `/api/draft/${draftId}/info` to resolve `currentDraftName`; renders the 4 route links when a `draftId` param is present; renders a team-switcher dropdown when `currentDraftName` is resolved.

- [ ] **Step 1: Replace `src/components/NavBar/NavLinks.tsx`**

  ```tsx
  'use client';

  import Link from 'next/link';
  import { useParams, usePathname } from 'next/navigation';
  import { useEffect, useState } from 'react';
  import { ChevronDownIcon } from 'lucide-react';
  import { Button } from '@/components/ui/button';
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
  } from '@/components/ui/dropdown-menu';
  import { cn } from '@/lib/utils';

  interface DraftInfo {
    id: number;
    name: string;
  }

  export default function NavLinks() {
    const pathname = usePathname();
    const params = useParams();
    const draftIdParam = params?.draftId;
    const draftId = typeof draftIdParam === 'string' ? parseInt(draftIdParam, 10) : null;
    const hasDraftId = draftId !== null && !isNaN(draftId);

    const [activeDrafts, setActiveDrafts] = useState<DraftInfo[]>([]);
    const [currentDraftName, setCurrentDraftName] = useState<string | null>(null);

    useEffect(() => {
      if (!hasDraftId) return;
      void (async () => {
        const r = await fetch('/api/drafts');
        if (!r.ok) return;
        const drafts: DraftInfo[] = await r.json();
        setActiveDrafts(drafts);
        const current = drafts.find((d) => d.id === draftId);
        if (current) {
          setCurrentDraftName(current.name);
        } else {
          // Current draft not in active list (e.g. COMPLETE) — fetch its name directly.
          const r2 = await fetch(`/api/draft/${draftId}/info`);
          if (!r2.ok) return;
          const info: { name: string } = await r2.json();
          setCurrentDraftName(info.name);
        }
      })();
    }, [draftId, hasDraftId]);

    const LINKS = hasDraftId
      ? [
          { href: `/draft/${draftId}`, label: 'Value Sheet' },
          { href: `/draft/${draftId}/teams`, label: 'Team Rosters' },
          { href: `/draft/${draftId}/budget`, label: 'Budget Pressure' },
          { href: `/draft/${draftId}/nominate`, label: 'Nominate' },
        ]
      : [];

    const otherDrafts = activeDrafts.filter((d) => d.id !== draftId);

    return (
      <nav className="gap-lg flex flex-wrap items-center">
        {LINKS.map(({ href, label }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'nav-link font-label text-label-md px-1 font-bold tracking-wide uppercase no-underline',
                active ? 'text-foreground' : 'text-muted-foreground',
              )}
            >
              {label}
            </Link>
          );
        })}

        {hasDraftId && currentDraftName && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="secondary"
                  size="sm"
                  className="font-label text-label-sm border-border gap-1 border font-bold tracking-wide uppercase"
                />
              }
            >
              {currentDraftName}
              <ChevronDownIcon className="size-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-40">
              {otherDrafts.map((d) => (
                <DropdownMenuItem
                  key={d.id}
                  render={<Link href={`/draft/${d.id}`} />}
                  className="font-label text-label-sm"
                >
                  {d.name}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                render={<Link href="/drafts" />}
                className="font-label text-label-sm text-muted-foreground"
              >
                All Drafts
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </nav>
    );
  }
  ```

  This removes the hand-rolled `dropdownOpen` state, the `dropdownRef`, and the `mousedown` click-outside listener entirely — Base UI's `Menu` handles outside-click-to-close, `Escape`-to-close, and keyboard arrow navigation internally.

- [ ] **Step 2: Verify**

  Run: `pnpm tsc --noEmit`
  Expected: no errors. (If `render` prop typing errors on `DropdownMenuTrigger`/`DropdownMenuItem`, check that Task 1's `dropdown-menu.tsx` was generated by the CLI unmodified aside from the Step 4 `shadow-md` removal — the `render` prop comes from Base UI's own prop types, not something added by hand.)

  Run: `pnpm lint`
  Expected: same baseline as Task 1 (4 pre-existing warnings, 0 new).

- [ ] **Step 3: Manual verification**

  Run: `pnpm dev`, then in a browser on a page with a `draftId` (e.g. `/draft/1`):
  - Confirm the 4 nav links render, the current page's link is visibly brighter (`text-foreground`) than the others (`text-muted-foreground`)
  - Click the team-switcher dropdown trigger — it opens, showing other active drafts + a separator + "All Drafts"
  - Click outside the open dropdown — it closes
  - Open it again and press `Escape` — it closes
  - Open it again and use arrow keys — focus moves between items; `Enter` on an item navigates there (client-side, no full page reload)
  - Tab through the nav links and the dropdown trigger with keyboard only — focus rings are visible on each

- [ ] **Step 4: Commit**

  ```bash
  git add src/components/NavBar/NavLinks.tsx
  git commit -m "refactor: rebuild NavLinks on Tailwind classes + shadcn DropdownMenu"
  ```

---

### Task 3: Rebuild `NavBar.tsx` on Tailwind classes + shadcn `Button`

**Files:**

- Modify: `src/components/NavBar/NavBar.tsx`

**Interfaces:**

- Consumes: `Button` from `@/components/ui/button` (Task 1); `NavLinks` from `./NavLinks` (Task 2's rebuilt version, same import, no signature change).
- Produces: `NavBar` — same props (`{ session: Session | null }`), same rendered structure (brand mark, `NavLinks`, feedback link, session name + sign-out when signed in).

- [ ] **Step 1: Replace `src/components/NavBar/NavBar.tsx`**

  ```tsx
  import type { Session } from 'next-auth';
  import { signOut } from '@/auth';
  import { Button } from '@/components/ui/button';
  import NavLinks from './NavLinks';

  export default function NavBar({ session }: { session: Session | null }) {
    return (
      <div className="bg-card gap-x-lg gap-y-xs px-lg py-sm sticky top-0 z-50 flex flex-wrap items-center justify-between">
        <span className="font-label text-label-lg text-foreground font-bold tracking-wide uppercase">
          DraftOps
        </span>
        <div className="gap-lg flex items-center">
          <NavLinks />
          <a
            href="https://github.com/colereschke/draftops/issues/new?template=feedback.yml"
            target="_blank"
            rel="noopener noreferrer"
            className="font-label text-label-md text-muted-foreground font-bold tracking-wide uppercase no-underline"
          >
            Feedback
          </a>
          {session && (
            <div className="gap-md flex items-center">
              <span className="font-label text-label-md text-muted-foreground font-bold tracking-wide uppercase">
                {session.user?.name}
              </span>
              <form
                action={async () => {
                  'use server';
                  await signOut({ redirectTo: '/sign-in' });
                }}
              >
                <Button
                  type="submit"
                  variant="ghost"
                  size="sm"
                  className="font-label text-label-md text-muted-foreground h-auto p-0 font-bold tracking-wide uppercase"
                >
                  Sign out
                </Button>
              </form>
            </div>
          )}
        </div>
      </div>
    );
  }
  ```

- [ ] **Step 2: Verify**

  Run: `pnpm tsc --noEmit`
  Expected: no errors.

  Run: `pnpm lint`
  Expected: same baseline as prior tasks.

- [ ] **Step 3: Manual verification**

  With `pnpm dev` still running:
  - Confirm the brand mark, nav links, feedback link, session name, and sign-out control all render with the same visual hierarchy as before (brand + sign-out slightly muted, feedback link muted, active elements calling out)
  - Click "Feedback" — opens `https://github.com/colereschke/draftops/issues/new?template=feedback.yml` in a new tab
  - Click "Sign out" — signs out and redirects to `/sign-in`
  - Tab through every interactive element — visible focus ring on each, in the new accent violet (`--ring`)
  - Resize the window narrow enough to wrap — the bar wraps without overlapping content (`flex-wrap` + the `gap-x-lg gap-y-xs` combo)

- [ ] **Step 4: Commit**

  ```bash
  git add src/components/NavBar/NavBar.tsx
  git commit -m "refactor: rebuild NavBar on Tailwind classes + shadcn Button"
  ```

---

### Task 4: Full verification pass

**Files:** none (verification only; fixes if anything surfaces)

- [ ] **Step 1: Run the full quality gate**

  Run: `make check`
  Expected: typecheck, lint, format, and test all pass (same 4 pre-existing lint warnings, 0 new; format clean on all files touched by this plan — pre-existing untracked docs files are not part of this change and may still show as unformatted, that's expected and unrelated).

- [ ] **Step 2: Production build sanity check**

  Run: `pnpm build`
  Expected: builds successfully with no Tailwind/CSS errors. This is worth doing explicitly since Task 1 touched `globals.css` and `layout.tsx` directly — dev mode's on-demand CSS generation can occasionally hide issues a production build surfaces.

- [ ] **Step 3: Manual QA across every page**

  With `pnpm dev` running, visit `/`, `/draft/[id]`, `/draft/[id]/teams`, `/draft/[id]/budget`, `/draft/[id]/nominate`, and `/sign-in` — confirm the nav bar renders and behaves identically on all of them (it's shared via `layout.tsx`), and that no other page's content shifted or broke (this phase touches shared chrome, not page content, but the nav bar is present on every page so it's worth a quick look everywhere).

- [ ] **Step 4: Fix anything found, otherwise done**

  If Steps 1–3 surface an issue, fix it and re-run the relevant check before proceeding. If everything passes clean, this task requires no commit — Tasks 1–3 already committed the actual changes.
