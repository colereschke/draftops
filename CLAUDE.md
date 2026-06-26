# DraftOps — Claude Context

Fantasy football dynasty auction draft tool built for a 12-team Superflex Sleeper league. The owner (Cole, handle: `coreschke`) is using this during a live slow auction and plans to share it with the Establish The Run dynasty Discord for feedback.

## Quick Commands

```bash
make setup       # First-time: install + migrate + seed
make dev         # Dev server at http://localhost:3000
make check       # Full quality gate: typecheck + lint + format + test
make test        # Jest only
make db-studio   # Visual DB browser (Prisma Studio)
make db-reset    # Wipe DB and re-seed (destructive)
```

## Tech Stack

- **Next.js 16** with App Router, `src/` directory, `@/*` import alias
- **TypeScript 5** — strict mode, no explicit `any` warnings
- **Tailwind CSS 4** — used for layout utilities; dynamic/computed styles (position colors, age colors) stay as inline styles
- **Prisma 7** with SQLite — see Prisma v7 notes below
- **pnpm 11** — do not use npm or yarn
- **Jest + React Testing Library** — tests in `src/__tests__/` or co-located `*.test.ts`
- **ESLint 9** flat config + Prettier — pre-commit hook enforces both via Husky + lint-staged

## Project Structure

```
src/
├── __tests__/                        # Test files (Jest + React Testing Library)
├── app/
│   ├── api/
│   │   ├── nomination-data/route.ts  # GET — returns teamStats, auctionResults, watchlist, nominatedPlayers
│   │   ├── nominated/route.ts        # POST/DELETE — mark/unmark a player as currently in auction
│   │   └── watchlist/route.ts        # POST/DELETE — add/remove from PlayerWatchlist
│   ├── budget/page.tsx               # /budget — buying power view (server component)
│   ├── nominate/page.tsx             # /nominate — nomination helper (server component)
│   ├── teams/page.tsx                # /teams — team roster tracker (server component)
│   ├── error.tsx                     # App-level error boundary
│   ├── globals.css                   # CSS custom properties (design tokens)
│   ├── layout.tsx                    # Font setup + NavBar
│   └── page.tsx                      # / — value sheet (server component)
├── components/
│   ├── AuctionSheet/                 # Main player value sheet + bid logging
│   ├── BidModal/                     # Log/edit/delete bid modal
│   ├── BudgetPressure/               # Budget pressure table + 20s auto-refresh
│   ├── NavBar/                       # Fixed header with nav links
│   ├── NominationHelper/             # Nomination scorer + watchlist + in-auction sidebar
│   └── RosterTracker/                # Expandable team roster view
├── data/
│   └── players.ts                    # ~270 players, fully processed (budget/ceiling/floor)
├── lib/
│   ├── actions.ts                    # Server actions: logBid, updateBid, deleteBid
│   ├── budget.ts                     # computeTeamStats for /budget page
│   ├── computeTeamStats.ts           # computeTeamStats for /teams page (includes roster + delta)
│   ├── db.ts                         # Prisma singleton (required for Next.js dev hot reload)
│   ├── nominationScoring.ts          # computeNominationScores — core nomination logic
│   ├── posColors.ts                  # POS_COLORS map (bg, accent, badge, badgeText per position)
│   └── teams.ts                      # LEAGUE_TEAMS, ROSTER_SIZE = 30, TARGET_ROSTER
└── types/
    └── index.ts                      # Player, Position, TeamStats, AuctionResultEntry,
                                      # RosterEntry, TeamWithRoster, ClaimedBid, LeagueTeam
prisma/
├── schema.prisma                     # Team + AuctionResult + PlayerWatchlist + NominatedPlayer models
├── seed.ts                           # Upserts all 12 teams (idempotent)
└── dev.db                            # Local SQLite DB (gitignored)
prisma.config.ts                      # Prisma v7 config (replaces datasource url in schema)
existing_project_docs/                # Original reference files — do not delete
```

## Pages & Routes

| Route       | Purpose                                                                                                |
| ----------- | ------------------------------------------------------------------------------------------------------ |
| `/`         | Value sheet — full player list with filters, search, sort, bid logging via modal                       |
| `/teams`    | Team roster tracker — expandable rows showing each player a team has won, with delta vs. target budget |
| `/budget`   | Budget pressure view — teams sorted by buying power with visual bar; auto-refreshes every 20s          |
| `/nominate` | Nomination helper — ranks available players by rival demand score; personal watchlist sidebar          |

All pages are server components that fetch from Prisma directly and pass data down to `'use client'` components.

## Database Schema

Four models:

- `Team` — 12 managers with $1,000 budgets
- `AuctionResult` — one row per completed bid (player, position, nflTeam, price, sfRank, notes, teamId)
- `PlayerWatchlist` — Cole's personal watchlist; players here are excluded from nomination suggestions
- `NominatedPlayer` — players currently up for bidding in the live auction; excluded from nomination suggestions and shown with a teal "LIVE" badge + row tint in the value sheet; auto-removed when a bid is logged via `logBid`

Derived values (computed at query time, not stored):

- `spent = SUM(results.price)`
- `remaining = budget - spent`
- `rosterCount = COUNT(results)`
- `buyingPower = remaining - (ROSTER_SIZE - rosterCount)` — classic auction math
- `delta = result.price - player.budget` — on each roster entry, how much over/under target

## Key Library Files

**`src/lib/teams.ts`**

- `LEAGUE_TEAMS` — 12 teams with handles + display names
- `ROSTER_SIZE = 30`
- `TARGET_ROSTER = { QB: 4, RB: 9, WR: 11, TE: 3 }` — used by nomination scoring

**`src/lib/nominationScoring.ts`** — core nomination intelligence

- `computeNominationScores(players, teamStats, auctionResults, watchlist, nominatedPlayers, myHandle)`
- Filters out won players, watchlist items, and currently nominated players
- For each available player, scores rival demand: `needRatio = (target - currentCount) / target` per position per team
- Nomination score = `totalRivalDemand × player.ceiling` where demand = `sum(rival.buyingPower × needRatio)`
- Returns `ScoredPlayer[]` with top rival contributors

**`src/lib/actions.ts`** — server actions (revalidate `/` on each mutation)

- `logBid({ player, position, nflTeam, price, teamId, sfRank?, notes? })`
- `updateBid({ id, price, teamId })`
- `deleteBid({ id })`

**`src/lib/posColors.ts`** — `POS_COLORS` maps position → `{ bg, accent, badge, badgeText }`

## Design System

Defined as CSS custom properties in `src/app/globals.css`. Key values:

```
--bg-base: #0a0d14       background
--bg-surface: #141824    cards, header
--text-primary: #e8eaf0

Position accents:
--pos-qb: #4f83e8   --pos-rb: #4caf6e   --pos-wr: #e8a030
--pos-te: #c060d0   --pos-pick: #40b0b0  --pos-pkg: #f0c040

Age colors:
--age-young: #4caf6e (≤24)  --age-prime: #e8eaf0 (25–27)
--age-aging: #e8a030 (28–30) --age-old: #e05050 (31+)
```

Fonts: `var(--font-barlow)` (Barlow Condensed 700) for headers/labels, `var(--font-inter)` for body, `var(--font-mono)` (JetBrains Mono) for all numbers and dollar values.

Signature design element: 3px left border on each player row in their position accent color.

## Player Data & Valuation

Values come from `src/data/players.ts`. All processing is done at build time — the exported `players` array is ready to use.

Key logic:

- Source: `2QBAuction` column from the FantasyCalc CSV (Superflex format, $200 budget)
- Scale: `× 5` to convert to $1,000 budget
- TE premium: `× 1.18` on all TE values (extra PPR + first down scoring)
- 2027 kicker pick packages: one entry per team (kicker name maps to manager handle); all hardcoded to `budget=109, ceiling=131, floor=75`
- 2028 pick package: hardcoded to `budget=72, ceiling=86, floor=50`
- `ceiling = round(budget × 1.15)`, `floor = max(5, round(budget × 0.87))`
- PKG values live in a `PKG_VALUES` record keyed by player name (kicker name for 2027, `'2028 Pick Package'` for 2028)

## League-Specific Rules

- **12 teams**, $1,000 budget, 30-man rosters
- **Kicker = pick package**: Winning a kicker bid nets you that team's entire 2027 1st+2nd+3rd picks. Cole's picks = Matt Gay.
- **2028 picks NOT in startup pool**
- Scoring: Full PPR + TE premium (+1 PPR, +0.25 first down for TEs), Superflex

## Prisma v7 Notes

Prisma 7 changed how SQLite connections are configured:

- `datasource` block in `schema.prisma` no longer takes a `url` field
- Connection config lives in `prisma.config.ts` (root-level)
- Requires the `@prisma/adapter-better-sqlite3` adapter in the PrismaClient constructor
- The `db.ts` singleton passes the adapter explicitly — do not instantiate PrismaClient without it
- `postinstall` script runs `prisma generate` automatically after `pnpm install`

After any schema change: `pnpm prisma migrate dev --name <description>`
After pulling changes with new migrations: `pnpm prisma migrate dev` (applies pending)

## Code Quality Rules

- Single quotes, trailing commas, 2-space indent, 100 char line width (Prettier)
- No unused vars (ESLint errors), no explicit `any` (ESLint warns)
- Pre-commit hook runs `pnpm lint-staged` + `pnpm tsc --noEmit` — do not skip with `--no-verify`
- CI runs typecheck + lint + format check + tests on every PR

## What's Built

- `/` — Value sheet with full player list, filters, search, sort, bid logging modal, budget tracker
- `/teams` — Team roster tracker with expandable rows, spend/remaining/buying power per team, delta vs. target per player
- `/budget` — Budget pressure view sorted by buying power with auto-refresh
- `/nominate` — Nomination helper that ranks available players by rival demand; personal watchlist persisted to DB excludes players Cole wants; "Nom" button tracks players currently in auction (persisted to DB, auto-clears on bid completion)

## What's Next

**Generalize and make configurable** — DraftOps is currently hardcoded to Cole's league. The next major initiative is making it a proper multi-draft tool:

- Create/manage multiple drafts
- Upload custom rankings (e.g., FantasyCalc CSV) per draft
- Configure scoring settings, league size, roster size, budget per draft
- Support any number of teams (not just 12)
- Remove all hardcoded league assumptions (handles, `LEAGUE_TEAMS`, kicker-PKG rules, etc.)

Design decisions (e.g., dropdowns over quick-pick grids for team selection) should already account for this — keep that in mind when touching anything.

## Global Rules

**Read before touching.** Before making any change in the repo, read the repo's `CLAUDE.md`. It contains the stack, layout, conventions, and repo-specific constraints that take precedence over general intuition.

**Don't commit trivial superpowers docs.** Design specs and implementation plans generated during a superpowers workflow should only be committed when the work is non-trivial enough that future-you would want to understand why a design decision was made. For simple, self-evident work, clean up generated spec/plan files at the end of the workflow — don't commit them.

**Keep PRs clean.** Don't let extraneous files (scratch notes, generated docs, debug artifacts, unrelated changes) into PRs. This can be overridden if explicitly requested, but the default is a clean diff that contains only what the PR describes.

**No author attribution in commits.** Do not add `Co-Authored-By`, `Author:`, or any other authorship lines to commit messages.

**Don't be a sycophant!** The last thing I want in development is a yes man. If you agree with me on something that's fine, but please please think critically about my choices in development and if you have questions or concerns bring them up and challenge me if need be.
