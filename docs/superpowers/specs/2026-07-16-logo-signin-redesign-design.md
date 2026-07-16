# Logo & Sign-In Redesign — Design

## Purpose

DraftOps is approaching public release with no visual identity: `public/` only has the Next.js
boilerplate SVGs, `src/app/favicon.ico` is the default Next.js icon, and `src/app/sign-in/page.tsx`
is a raw inline-styled card (wordmark text + a single Discord button) that predates the roadmap #6
UI redesign — none of that redesign's phases (Foundation → 4c, all shipped) touched it. This design
gives the product a real mark and turns the sign-in page into an actual first impression, without
scope-creeping into the rest of the app.

## Scope and decisions

- **Icon concept**: a gavel, built from simple SVG geometry (no illustration) — a rotated
  perpendicular head-and-handle assembly over a flat sounding block. Single-color fill using the
  app's real `--primary` token (`--color-primary`, currently `#d7ded2`, a pale sage/cream).
  **Correction from brainstorming:** every mockup during design used a placeholder violet
  (`#7c6ff0`), based on a stale memory of an earlier accent-color decision that was apparently
  never actually shipped — `globals.css` was checked directly during self-review and `--primary`
  is `#d7ded2`, not violet. Confirmed with Cole to use the real token rather than either
  introducing a new brand-only color or changing `--primary` sitewide (that's a bigger change than
  this design's scope — see Out of scope).
- **Wordmark**: "DraftOps" set in the existing Barlow Condensed 700 uppercase treatment already
  used in `NavBar`. No new typography introduced.
- **Lockup**: icon left of wordmark (validated over icon-right during brainstorming — reads
  naturally left-to-right).
- **Sign-in page**: full split-layout redesign (brand panel + live value ticker), not just a
  reskin of the existing centered card. Reflows to a stacked layout on mobile rather than hiding
  either half.
- **NavBar**: swap the current plain-text wordmark for the same lockup component, wrapped in a
  link back to `/`. Kept in scope alongside the sign-in work rather than deferred, since shipping
  two different brand treatments (icon+wordmark on sign-in, bare text in the nav) on the same day
  would look unfinished.
- **Favicon**: a static `src/app/icon.svg` using the same shape geometry as the icon component.
  Explicitly **out of scope**: `apple-icon`/PWA manifest icons — that's "add to home screen"
  polish, a different problem than "we have no logo," and an easy fast-follow later if wanted.
- **Ticker data**: a static, hardcoded curated list of recognizable dynasty player names with
  flavor values and up/down deltas. This is explicitly decorative marketing chrome, not real data
  — `/sign-in` is pre-auth with no draft/session context, and wiring it to `src/data/players.ts` or
  a live DB query was considered and rejected (fabricated deltas either way, and a DB round-trip on
  an unauthenticated page for a decorative element isn't worth the coupling). The curated list
  needs enough entries (~50) that a 5+ second glance never sees an obvious repeat of the loop.

## Components

New `src/components/Brand/` folder:

- **`LogoMark.tsx`** — the icon only. Props: `size?: number` (default 24), `className?: string`.
  Renders the gavel as three shapes in a `viewBox="0 0 32 32"`:
  - a `<g transform="rotate(-40 16 16)">` containing the handle (`rect x=14.8 y=9 width=2.4
height=19 rx=1.2`) and the head (`rect x=9.5 y=5 width=13 height=7 rx=2`), perpendicular to
    each other before rotation — this crossing is what makes it read as a mallet rather than a
    tapered bar (the bug caught during brainstorming: a first attempt stacked head and handle on
    the same axis and it read as an abstract bar, not a gavel).
  - the sounding block, unrotated (`rect x=5 y=24 width=11 height=4.5 rx=1.5`).
  - All shapes fill `var(--primary)` (or `currentColor` if that proves more flexible during
    implementation — implementer's call, not load-bearing).
- **`LogoLockup.tsx`** — `<LogoMark size={..} />` + a `<span>` wordmark, flex row, icon-left, gap
  matching the existing `NavBar` label spacing conventions. Props: `size?`, `className?` (no
  `href`/link behavior baked in — callers wrap it in `Link` themselves, since sign-in and NavBar
  want different wrapping).
- **`index.ts`** — barrel export of both.

New `src/components/SignIn/` folder:

- **`SignInScreen.tsx`** — server component (no `'use client'`; all motion is CSS). Renders the
  split layout described below. Accepts the rendered Discord sign-in form as a child/prop so
  `page.tsx` keeps owning the `'use server'` action, matching the existing pattern.
- **`ValueTicker.tsx`** — server component. Renders the curated list twice back-to-back inside a
  vertically scrolling container (CSS `@keyframes` translating by `-50%`, `animation: ... linear
infinite`) so the loop is seamless, with a `linear-gradient` fade mask on the top and bottom
  edges. Wrapped in `@media (prefers-reduced-motion: reduce)` to disable the animation (static
  list, no motion) for users who've asked for it.
- **`tickerPlayers.ts`** — `interface TickerEntry { name: string; value: number; delta: number }`
  and an exported `TICKER_PLAYERS: TickerEntry[]` of ~50 curated entries (recognizable dynasty
  skill-position names, flavor budget values, positive/negative delta for the ▲/▼ indicator).
  Purely decorative UI data — lives with the component, not in `src/data/` (which is reserved for
  the real server-only seed pool per existing convention).

## UI flow — sign-in page

**Note on color:** the brainstorming mockups (built in a throwaway HTML visual-companion tool, not
the app itself) used approximate, illustrative hex values for backgrounds/borders/text to validate
layout and composition — they don't map 1:1 to this repo's tokens. The implementation must use the
real `globals.css` custom properties throughout: `--bg-base`/`--bg-surface`/`--bg-elevated` for
panel backgrounds, `--border-subtle`/`--border-default` for the panel divider and ticker row
rules, `--text-primary`/`--text-secondary`/`--text-muted` for text, and `--primary` for the one
accent (icon, eyebrow label, ticker values — see the corrected color note above). The green/red
up/down ticker deltas reuse the app's existing positive/negative convention rather than inventing
a new one: `spreadColor` (`src/lib/valueSpread.ts:131`) already maps positive → `var(--age-young)`
and negative → `var(--age-old)` for this exact purpose.

`src/app/sign-in/page.tsx` keeps its existing responsibilities unchanged: `auth()` check,
`redirect('/')` if already signed in, `callbackUrl` resolution, and the `'use server'` form action
calling `signIn('discord', ...)`. It renders `<SignInScreen>` and passes the Discord button (or the
callback URL, implementer's call on the exact prop boundary) through instead of building the whole
card inline.

**Desktop (`md:` and up)** — split layout, roughly 40/60:

- Left panel (brand): `LogoLockup`, then an eyebrow label ("Dynasty Auction Draft Tool" — small,
  uppercase, accent-colored, existing label type scale), then a bold 3-line headline ("Every
  dollar." / "Every rival." / "One room." — split across lines at the periods), then the Discord
  sign-in button. Content is vertically centered with generous surrounding negative space — no
  filler content added just to occupy the empty area above/below (validated explicitly during
  brainstorming: Linear/Vercel-style login screens lean into negative space rather than filling
  it).
- Right panel: `ValueTicker` filling the full panel height, fade-masked top and bottom.

**Mobile (below `md:`)** — stacked, reusing the same two components, no new variant:

- Brand block (lockup, eyebrow, headline, button) renders full-width at the top, sized so it and
  the button sit above the fold on real device sizes (iPhone SE and up). Headline drops to a
  smaller size than desktop to fit comfortably.
- `ValueTicker` renders below at a shorter fixed height (~150px) instead of filling half the
  screen — reflowed, not hidden, consistent with how this app already treats mobile for
  functional controls (filters/data controls always reflow rather than disappear); the same
  principle extends here even though the ticker itself is decorative.
- Implemented via Tailwind responsive classes on the same two components (container height,
  padding, font sizes) — not a second ticker implementation.

## NavBar integration

`src/components/NavBar/NavBar.tsx:20` — replace the plain `<span>DraftOps</span>` with:

```tsx
<Link href="/">
  <LogoLockup />
</Link>
```

`/` (`src/app/page.tsx`) already resolves correctly as a "home" target: redirects to the user's
single active draft's value sheet, or to `/drafts` if they have more than one — distinct from the
"Value Sheet" `NavLinks` entry, which only appears once already inside a specific draft and always
points at that draft rather than home broadly. No change to `src/app/page.tsx` needed.

## Favicon

`src/app/icon.svg` — a static file using the same three shapes as `LogoMark`, sized to the same
`viewBox="0 0 32 32"`. Next.js's App Router file convention picks this up automatically and wires
the appropriate `<head>` tags — no change to `layout.tsx` metadata needed. This is a second copy of
the shape geometry (Next requires a literal static file here, not JSX), so a short comment in both
`LogoMark.tsx` and `icon.svg` cross-references the other — acceptable given it's only three shapes,
not worth a build-time codegen step to unify.

## Accessibility

- `ValueTicker`'s scroll animation is disabled under `prefers-reduced-motion: reduce`.
- Icon-only usage (`LogoMark` alone, e.g. if ever used standalone) is decorative and should be
  `aria-hidden` where it appears without the wordmark; the `LogoLockup`'s text span already
  provides an accessible name.

## Tests

- `LogoMark`/`LogoLockup` are simple presentational SVG/markup — no dedicated unit test beyond
  existing lint/type coverage, consistent with how other purely-presentational components in this
  repo (e.g. `POS_COLORS`-driven badges) aren't separately unit tested.
- `ValueTicker`: a test asserting the curated list renders (via `data-testid`) and that the
  reduced-motion media query is present in the emitted styles, if that's feasible to assert
  cleanly; otherwise a visual/manual check is acceptable for a decorative component per this
  repo's existing precedent (Phase 4a/4b/4c of the #6 redesign shipped without inventing new test
  coverage for cosmetic-only surfaces).
- `NavBar`: existing tests (if any target the wordmark) get updated to look for the new lockup via
  `data-testid` rather than text content, per repository testing standards.
- `SignInScreen`: no existing test file for the sign-in page today; none added for the same reason
  as `ValueTicker` — this is a cosmetic/marketing surface, not application logic.

## Out of scope

- Changing the shared `--primary`/`--color-primary` token itself — this design uses the app's
  real accent as-is, however muted, rather than reintroducing a different brand color sitewide.
- `apple-icon`/PWA manifest icons (see Scope and decisions above).
- Live or DB-backed ticker data.
- Any change to `src/app/page.tsx`'s redirect logic.
- Any change to the Discord OAuth flow itself (`src/auth.ts`, the `signIn` server action) beyond
  where its rendered button sits in the new layout.
- Rebranding any other page — this is sign-in + NavBar + favicon only.
