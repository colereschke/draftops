# Team Rosters split view (desktop)

Date: 2026-07-10

## Context

The Team Rosters page uses a responsive grid (`grid-cols-1 sm:grid-cols-2 xl:grid-cols-3`) of dossier cards, each expandable in place to show the team's full roster. On mobile (single column) this works well — Cole explicitly wants it left alone. On desktop (2-3 columns), expanding one card stretches its whole grid row to fit it, since CSS Grid rows auto-size to their tallest item — every other card in that row is left with a large awkward gap beneath its own (shorter) content. This spec replaces the desktop-only behavior with a persistent master-detail split view: a list of dossier card faces on the left, a fixed detail pane on the right showing whichever team is selected. Mobile is untouched.

## Breakpoint

`≥1024px` (Tailwind `lg`) switches to split view. Below that, the page is 100% today's behavior: unchanged grid, unchanged per-card inline expand/collapse via the existing `expanded: Set<number>` state.

**This is a JS-driven breakpoint, not a CSS one** — a deliberate deviation from the `hidden md:flex`/`md:hidden` convention used elsewhere in this app's recent mobile work. The detail pane's content is inherently data-driven (whichever team was clicked), so some JS branching is unavoidable regardless of approach; given that, conditionally rendering _one_ tree via a `useMediaQuery` hook is preferable to mounting both the grid and the split view simultaneously and hiding one with CSS, which elsewhere in this app is fine for lightweight table/card swaps but here would mean duplicating a full team list of heavy, stateful, interactive `DossierCard`s. Tradeoff: a JS-driven breakpoint can't know the viewport before first paint, so it defaults to the mobile grid and corrects to split view after mount — a one-frame flash on desktop page loads. Accepted.

## Component design

**`src/lib/useMediaQuery.ts`** (new) — `useMediaQuery(query: string): boolean`. Defaults to `false` before mount (SSR-safe), then syncs to `window.matchMedia(query).matches` in an effect and subscribes to changes. Used as `useMediaQuery('(min-width: 1024px)')` in `RosterTracker`.

**`src/components/RosterTracker/DossierFace.tsx`** (new) — pure presentational component holding exactly the summary content that's inside `DossierCard`'s clickable wrapper today: handle/displayName/pkg-badge row, lean/habit line, aggression/overPct line, buys/spend/top-buy line, avg-age line, appetite chip row. No click handling, no chevron — those stay owned by whichever parent renders it. Props: `team`, `tendency`, `isOwner`, `isSelected?` (default `false` — adds a background-tint highlight, independent of `isOwner`'s left-border treatment, so a card can show both signals at once), `testIdSuffix?` (default `''`, appended to every internal `data-testid` so the same team's face can render twice in the DOM at once — list pane + detail pane — without colliding).

**`src/components/RosterTracker/DossierCard.tsx`** (modified) — now a thin wrapper: the clickable/keyboard-accessible `role="button"` div, the chevron, the conditional inline `TeamRosterDetail` — rendering `DossierFace` inside for the summary content. Gains one new passthrough prop, `isSelected?`, forwarded to `DossierFace`. Default (omitted) behavior — testids, click behavior, expand behavior — is byte-identical to today; used unchanged by the mobile grid, and by the desktop list pane (with `isExpanded` always `false` and `onToggle` wired to select rather than toggle-in-set).

**`src/components/RosterTracker/TeamDetailPane.tsx`** (new) — desktop-only, non-interactive. Renders `<DossierFace ... testIdSuffix="-detail" />` as a header, then `<TeamRosterDetail results={team.results} />` below it. Wrapped in its own container, `data-testid="team-detail-pane"`.

**`src/components/RosterTracker/RosterTracker.tsx`** (modified) — orchestrates both modes:

- Mobile (`useMediaQuery` false): unchanged — today's grid of `DossierCard`s driven by `expanded: Set<number>`.
- Desktop (`useMediaQuery` true): a fixed-width (~360px) scrollable left column of `DossierCard`s (`isExpanded` always `false`, `isSelected={team.id === selectedTeamId}`, `onToggle` sets `selectedTeamId`) and a `sticky` right pane rendering `TeamDetailPane` for the selected team. `selectedTeamId` initializes to the owner's team id (falling back to the first team in sort order if there's no owner match), and is otherwise independent of the `sortBy` control — changing sort re-orders the list but never changes the selection.

## Testing

- `useMediaQuery.test.ts`: mocked `window.matchMedia`, verifies initial `false`, verifies it updates on a simulated `change` event.
- `jest.setup.ts` needs a `window.matchMedia` polyfill (jsdom has none) — a `jest.fn()` returning `{ matches: false, media, addEventListener, removeEventListener, addListener, removeListener }` by default, overridable per test. Without this, every existing `RosterTracker` test breaks the moment the hook is wired in, not just the new ones.
- `DossierCard.test.tsx`: existing tests must keep passing unmodified (output identical). Add a case asserting `isSelected` applies the highlight.
- `TeamDetailPane.test.tsx` (new): renders header info + roster groups for a given team; testids carry the `-detail` suffix.
- `RosterTracker.test.tsx`: split into "mobile" cases (matchMedia mocked false — existing grid/expand tests, unchanged) and "desktop" cases (matchMedia mocked true — list + detail pane render, default selection is the owner's team, clicking a list row updates the detail pane, sorting doesn't change selection).
