# Secondary Pages Redesign Design

## Purpose

This spec guides the redesign of DraftOps pages beyond the Value Sheet:

- Budget Pressure
- Team Rosters
- Nomination Helper
- Draft list and New Draft form where relevant

The Value Sheet visual pass establishes the direction. The remaining pages should
adopt that system through page composition and component redesign, not just by
inheriting global color tokens.

## Current Baseline

The Value Sheet now has the strongest visual system:

- Graphite shell with restrained contrast.
- Darker DraftOps position accents.
- Neutral gray treatment for `PICK` and `PKG`.
- Dark muted red for negative/low-value indicators.
- Separated top modules instead of one long header slab.
- Data color has a job: position, money, roster/draft asset, positive/negative,
  or live/open state.

The secondary pages still mostly use the old structure:

- Thin page header with small metadata line, title, and helper copy.
- Table-first layout with little page-level composition.
- Some stale hardcoded colors like `#141824`, `#0a0c10`, `#141e2e`,
  `#4f83e8`, `#e05050`, and `#2a2010`.
- Useful data, but not enough hierarchy or page-specific identity.

## Design Direction

Use the same product identity across all pages:

**Professional graphite draft room with semantic fantasy-auction accents.**

The app should feel serious and operational, but not generic. Personality should
come from draft-specific modules: buying power, roster shape, live nominations,
watchlists, and positional construction.

Avoid:

- Neon or synthetic code-theme colors.
- Broad blue-slate surfaces.
- Emoji in core data UI.
- Decorative sports graphics.
- Overlarge marketing-style sections.
- Cards inside cards.

Use:

- Graphite surfaces and crisp low-contrast borders.
- Warm money accent for target/value emphasis.
- Position accents for player/roster semantics only.
- Neutral gray for pick/package assets.
- Dark muted red/green for over-under and danger/safe indicators.
- Compact labels, tabular numeric values, and clear grouping.

## Shared Page System

Each secondary page should use a page shell modeled after the Value Sheet, but
scaled to its job.

### Page Intro

Replace the old full-width header slab with a compact intro band:

- Left: page title, league context, one-line purpose.
- Right: one to three page-specific metric blocks if useful.
- Below: optional page-specific module, not generic summary text.

The intro should generally fit in 120-180px of vertical space. Dense operational
screens should preserve table space.

### Metrics

Metric cards should be small, bordered, and data-first:

- Label: condensed uppercase.
- Value: mono, tabular, clear emphasis.
- Supporting note only if it clarifies a decision.

Use red/green sparingly. A negative metric should be visible, not alarming.

### Tables

All tables should share Value Sheet principles:

- Header labels are plain text, no emoji.
- Numeric columns use `font-mono` and `tabular-nums`.
- Row striping is subtle graphite, not blue-black.
- Owner/current-user rows get a left rail and slightly stronger text, not a
  bright selected row.
- Expanded/detail rows should feel like drawers connected to their parent row.
- Asset colors follow `POS_COLORS`; avoid old hardcoded color literals.

## Budget Pressure

### Job

Show who can still hurt you financially in the room.

### Redesign Goals

Budget Pressure should become a ranked pressure board, not just a table.

Top modules:

- `Most Dangerous`: team with highest buying power.
- `Your Rank`: owner’s buying-power rank and buying power.
- `Room Liquidity`: sum of all teams’ buying power, or active budget remaining
  if more useful.
- Optional `Low Power`: count of teams below a threshold.

Table:

- Keep ranking and buying-power bar.
- Make buying power the hero column.
- Use a calmer bar treatment: graphite track, semantic fill color, no glow.
- Keep red/amber/green thresholds, but use the current global tokens:
  `var(--age-young)`, `var(--primary)` or `var(--pos-wr)`, `var(--age-old)`.
- Owner row: left rail using `var(--primary)` or a neutral owner accent; avoid
  blue hardcoding.

Suggested copy:

- Title: `Budget Pressure`
- Description: `Teams ranked by live buying power after roster obligations.`
- Buying power explainer: `Remaining dollars minus open roster spots.`

### Component Notes

Current `BudgetPressureView.tsx` should be split if it grows:

- `BudgetPressureHeader`
- `PressureSummary`
- `PressureTable`

At minimum, remove hardcoded old palette values from `buyingPowerColor` and row
styling.

## Team Rosters

### Job

Inspect roster construction and identify team needs, spending patterns, and pick
package exposure.

### Redesign Goals

This page already has the best product-specific shape because expanded rows
create roster drawers. Lean into that.

Top modules:

- `Teams`: count of teams.
- `Open Slots`: total unfilled roster spots.
- `Most Flexible`: team with highest buying power.
- Optional `Packages Held`: total package assets won.

Table:

- Keep expandable rows.
- Parent rows should show roster count, spent, remaining, buying power, package
  count, and a compact position composition preview if possible.
- Expanded drawer should group won players by position with position rails/chips.
- The package count chip should use the neutral `PICK/PKG` gray treatment.
- Owner row should feel owned but not selected: left rail + stronger team text.

Expanded drawer:

- Use a connected graphite drawer below the parent row.
- Avoid old dark-blue drawer background.
- Player rows inside the drawer should use the same target/delta conventions as
  the Value Sheet.

Suggested copy:

- Title: `Team Rosters`
- Description: `Roster construction, spend, and leverage by team.`

### Component Notes

`RosterTable.tsx` currently has stale hardcoded values and should be updated:

- Replace `#141824`, `#0a0c10`, `#141e2e`, `#4f83e8`, `#2a3048`.
- Replace package badge `#2a2010` with `POS_COLORS.PKG`.
- Use current dark red token through `var(--age-old)` instead of `#e05050`.

## Nomination Helper

### Job

Help decide who to nominate by surfacing players who create rival budget pressure
while protecting personal targets.

### Redesign Goals

Nomination Helper should feel like a live room workbench:

- Left rail: live nominations and watchlist.
- Main panel: ranked nomination candidates.
- Rival demand visualization should be compact and legible.

Top/main modules:

- `Best Nomination`: current top score and player.
- `Live Nominations`: count of active nominations.
- `Watchlist`: count of protected players.
- Optional `Rival Pressure`: total or max demand among visible candidates.

Sidebar:

- Treat as a `Live Rail`, not a generic card.
- Separate `In Auction` from `Watchlist`.
- `PICK/PKG` assets use neutral gray.
- Nominated/live state should use a restrained live treatment; avoid bright teal
  row backgrounds unless the state is truly urgent.

Table:

- Rename abstract `Score` if possible, or pair it with clearer support text.
  Good options: `Pressure`, `Drain`, or `Room Pull`.
- Candidate row hierarchy:
  1. Player name and position.
  2. Target/ceiling or score.
  3. Top rival demand contributors.
  4. Actions.
- Buttons should be confident but compact: `Watch`, `Nominate`, `Remove`.
- Rival demand bars should use neutral tracks and semantic fills, not multiple
  competing colors.

Suggested copy:

- Title: `Nomination Helper`
- Description: `Find nominations that pull money from rival builds.`

### Component Notes

Likely files:

- `NominationHelper.tsx`: page shell and top metrics.
- `WatchlistSidebar.tsx`: live rail treatment.
- `NominationTable.tsx`: row hierarchy and action treatment.
- `RivalDemandBar.tsx`: compact demand visualization.

## Draft List And New Draft

These pages do not need the full dashboard treatment, but they should no longer
feel like legacy inline-style forms.

Draft list:

- Use graphite list rows with borders.
- Primary action: `Create Draft`.
- Draft rows should show status, team count, created date, and `Open`.
- Status should use muted semantic badges.

New Draft:

- Keep the explicit `Cancel` links added in the Value Sheet pass.
- Convert each section into clean graphite form groups:
  `Import from Sleeper`, `Draft Settings`, `Roster Settings`,
  `Starting Lineup`, `Scoring`, `Teams`.
- Use shadcn `Input`, `Button`, `Select` where practical.
- Avoid massive visual redesign unless the form becomes a frequent workflow.

## Color And Token Rules

Use existing tokens first:

- Background: `bg-background`
- Surfaces: `bg-card`, `bg-muted`, `bg-accent` only when semantically correct
- Borders: `border-border`, `border-border-subtle`
- Text: `text-foreground`, `text-secondary-fg`, `text-muted-foreground`
- Money/target emphasis: `var(--primary)` or `var(--pos-wr)` depending context
- Positive: `var(--age-young)`
- Negative/low/over: `var(--age-old)`
- Position semantics: `POS_COLORS`

Do not introduce new color tokens unless a recurring semantic need appears on at
least two pages. If a value is one-off but semantic, prefer inline CSS variables
over hardcoded hex.

## Implementation Order

1. Budget Pressure
   - Smallest page and easiest to align with Value Sheet.
   - Good place to prove summary metric cards and pressure bars.

2. Team Rosters
   - Most product-specific secondary page.
   - Highest value from better expanded drawer design.

3. Nomination Helper
   - More complex interaction surface.
   - Should borrow table/rail/demand patterns proven by first two pages.

4. Draft list / New Draft
   - Cleanup pass after core draft-room pages are coherent.

## Acceptance Criteria

- No old blue-slate hardcoded row/background colors remain in redesigned page
  components.
- No emoji are used in core data labels.
- All numbers that compare or align use tabular numeric styling.
- Each page has a clear top composition beyond a plain title strip.
- Color is semantic and restrained.
- Page remains dense enough for live draft usage.
- `pnpm typecheck`, `pnpm lint`, and `pnpm test` pass after each page pass.
