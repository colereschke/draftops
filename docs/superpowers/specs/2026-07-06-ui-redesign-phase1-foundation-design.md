# UI Redesign — Phase 1: Foundation (roadmap #6)

## Context

Roadmap #6 targets a Linear/Vercel-style visual redesign of DraftOps. The app currently has ~3,000 lines across 9 components spanning 5 pages, is entirely inline-style-driven (zero Tailwind utility usage), and has no component library. This is too large for a single spec/plan, so the redesign is split into phases, each independently spec'd and shipped:

1. **Foundation** (this spec) — Tailwind theme wiring, type/spacing/radius scale, shadcn/ui init (Button + DropdownMenu only), piloted on `NavBar`
2. `BidModal` → shadcn `Dialog`
3. `AuctionSheet` (main value-sheet page)
4. `NominationHelper`, `RosterTracker`, `BudgetPressure`

Dark-mode only — no light theme planned. The existing CSS custom property token layer (`globals.css`) is extended, not replaced.

## Goals

- Make the existing design tokens usable as Tailwind utility classes, not just inline `style={{}}`
- Establish a named type scale and spacing scale so later phases reuse values instead of re-guessing pixel numbers
- Introduce shadcn/ui with the minimum primitives Phase 1 actually needs (Button, DropdownMenu) — no speculative components
- Prove the whole pipeline (tokens → Tailwind theme → shadcn primitive → real component) on one small, real, interactive surface: `NavBar` / `NavLinks`
- Fix token drift already present (`NavLinks.tsx` hardcodes `#1e2433` / `#2a2f3e`, near-duplicates of `--bg-elevated` / `--border-default`)

## Non-goals

- Any other component (`BidModal`, `AuctionSheet`, `NominationHelper`, `RosterTracker`, `BudgetPressure`) — future phases
- Badge, Dialog, or other shadcn primitives not needed by `NavBar`
- Font changes — keep Barlow Condensed (labels/headers), Inter (body), JetBrains Mono (numbers). Reconsidered explicitly (not just inertia): Barlow Condensed's condensed-uppercase scoreboard feel fits a draft tool, JetBrains Mono for dollar figures mirrors real finance-terminal convention, Inter as body face is intentionally neutral. All three stay.
- Light mode
- Touching `--pos-*` / `--age-*` tokens or their inline-style usage — these are dynamic, per-row/per-team runtime values and intentionally stay as inline styles

## Design tokens (`globals.css` `@theme` block)

```css
@theme {
  --color-bg-base: var(--bg-base);
  --color-bg-surface: var(--bg-surface);
  --color-bg-elevated: var(--bg-elevated);
  --color-border-subtle: var(--border-subtle);
  --color-border-default: var(--border-default);
  --color-text-primary: var(--text-primary);
  --color-text-secondary: var(--text-secondary);
  --color-text-muted: var(--text-muted);

  --color-accent: #7c6ff0;
  --color-accent-hover: #9089f5;

  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;

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
```

`--pos-*` and `--age-*` tokens are **not** ported into `@theme` — unchanged exception, consumed via inline styles since they're runtime-computed per player/team.

**New design rules for all future phases:**

- One accent color (`--color-accent`), used sparingly: primary buttons, active nav state, focus rings. Everywhere else stays neutral gray + the existing semantic position/age colors.
- Elevation via hairline 1px borders + the `bg-base` → `bg-surface` → `bg-elevated` luminance steps — no box-shadows.
- The mono font utility applies `font-variant-numeric: tabular-nums` so dollar columns stay digit-aligned as bids update live.

## shadcn/ui setup

- `npx shadcn@latest init`, configured to write generated primitives into `src/components/ui/`, reading the `@theme` tokens above (no separate shadcn theme — same source of truth)
- `npx shadcn@latest add button dropdown-menu`
- These are added to the repo (per shadcn convention) and become the base for all later phases' interactive elements

## `NavBar` / `NavLinks` rebuild

- Replace all inline `style={{}}` in `NavBar.tsx` and `NavLinks.tsx` with Tailwind utility classes built on the new tokens
- Team-switcher dropdown → shadcn `DropdownMenu` (replaces the hand-rolled `useState`/`useRef`/click-outside implementation in `NavLinks.tsx`)
- Sign-out control → shadcn `Button variant="ghost"` (still wraps the existing `signOut` server action)
- Feedback link stays a plain anchor (external link, not an in-app action) but adopts the new label typography token
- Active nav link and the dropdown trigger's open/focus state use `--color-accent`
- Fix the `#1e2433` / `#2a2f3e` drift by using the consolidated `bg-elevated` / `border-default` tokens

## Testing / verification

No unit tests exist for `NavBar` today — it's purely presentational navigation chrome, consistent with existing convention that `data-testid`-based tests are reserved for logic-bearing components. Verification is manual: run the dev server, confirm nav links, dropdown open/close + keyboard nav (via Radix, free with shadcn), sign-out, and feedback link all work, and that focus rings / active states render as expected. `pnpm tsc --noEmit` and `pnpm lint` must pass (existing pre-commit gate).

## Rollout

Ships as one PR: token/theme changes + shadcn init + `NavBar`/`NavLinks` rebuild. No feature flag needed — this is a visual/internal refactor with no behavior change to nav functionality.
