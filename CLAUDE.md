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
- **Prisma 7** with PostgreSQL (Neon in prod, local WSL2 Postgres in dev) — see Prisma v7 notes below
- **Auth.js v5 (NextAuth)** — Discord OAuth, JWT session strategy; `src/auth.ts` exports `auth`, `signIn`, `signOut`
- **pnpm 11** — do not use npm or yarn
- **Jest + React Testing Library** — tests in `src/__tests__/` or co-located `*.test.ts`
- **ESLint 9** flat config + Prettier — pre-commit hook enforces both via Husky + lint-staged

## Project Structure

```
src/
├── __tests__/                        # Test files (Jest + React Testing Library)
├── app/
│   ├── api/
│   │   ├── auth/[...nextauth]/route.ts  # Auth.js catch-all route
│   │   ├── nomination-data/route.ts     # GET — returns teamStats, auctionResults, watchlist, nominatedPlayers
│   │   ├── nominated/route.ts           # POST/DELETE — mark/unmark a player as currently in auction
│   │   └── watchlist/route.ts           # POST/DELETE — add/remove from PlayerWatchlist
│   ├── budget/page.tsx               # /budget — buying power view (server component)
│   ├── nominate/page.tsx             # /nominate — nomination helper (server component)
│   ├── sign-in/page.tsx              # /sign-in — Discord OAuth sign-in page
│   ├── teams/page.tsx                # /teams — team roster tracker (server component)
│   ├── error.tsx                     # App-level error boundary
│   ├── globals.css                   # CSS custom properties (design tokens)
│   ├── layout.tsx                    # Font setup + NavBar
│   └── page.tsx                      # / — value sheet (server component)
├── auth.ts                           # Auth.js config: Discord provider, JWT strategy, session callback
├── components/
│   ├── AuctionSheet/                 # Main player value sheet + bid logging
│   ├── BidModal/                     # Log/edit/delete bid modal
│   ├── BudgetPressure/               # Budget pressure table + 20s auto-refresh
│   ├── NavBar/                       # Fixed header with nav links
│   ├── NominationHelper/             # Nomination scorer + watchlist + in-auction sidebar
│   └── RosterTracker/                # Expandable team roster view
├── data/
│   └── players.ts                    # ~267 ETR dynasty players — server-only seed source (NOT imported by client components)
├── lib/
│   ├── actions.ts                    # Server actions: createDraft (seeds Player table), logBid, updateBid, deleteBid
│   ├── budget.ts                     # computeTeamStats for /budget page
│   ├── computeTeamStats.ts           # computeTeamStats(teams, players) for /teams page (players param, no static import)
│   ├── db.ts                         # Prisma singleton using PrismaPg adapter (pg Pool)
│   ├── draft.ts                      # getDraft(userId, draftId) — auth-gated draft lookup
│   ├── nominationScoring.ts          # computeNominationScores — core nomination logic
│   ├── posColors.ts                  # POS_COLORS map (bg, accent, badge, badgeText per position)
│   └── teams.ts                      # LEAGUE_TEAMS, ROSTER_SIZE = 30, TARGET_ROSTER (ROSTER_SIZE used as fallback until #5b)
└── types/
    └── index.ts                      # Player, Position, StartingSlot, ScoringSettings, DEFAULT_* constants,
                                      # TeamStats, AuctionResultEntry, RosterEntry, TeamWithRoster, ClaimedBid, LeagueTeam
middleware.ts                         # Auth.js middleware — redirects unauthenticated users to /sign-in
prisma/
├── schema.prisma                     # Draft + Team + AuctionResult + PlayerWatchlist + NominatedPlayer + Player
├── seed.ts                           # Upserts default draft + 12 teams (idempotent)
├── seed-players.ts                   # Full-seed script: seeds Player rows for drafts with zero players (skips drafts that already have any)
├── sync-players.ts                   # Backfill script: inserts src/data/players.ts entries missing (by name) from each draft's Player table; idempotent, safe to re-run after adding new players
└── migrations/                       # Postgres migration history
prisma.config.ts                      # Prisma v7 config — DATABASE_URL from env
existing_project_docs/                # Original reference files — do not delete
```

## Pages & Routes

| Route       | Purpose                                                                                                |
| ----------- | ------------------------------------------------------------------------------------------------------ |
| `/sign-in`  | Discord OAuth sign-in; redirects to `/` after auth                                                     |
| `/`         | Value sheet — full player list with filters, search, sort, bid logging via modal                       |
| `/teams`    | Team roster tracker — expandable rows showing each player a team has won, with delta vs. target budget |
| `/budget`   | Budget pressure view — teams sorted by buying power with visual bar; auto-refreshes every 20s          |
| `/nominate` | Nomination helper — ranks available players by rival demand score; personal watchlist sidebar          |

All pages are server components that fetch from Prisma directly and pass data down to `'use client'` components. Every route except `/sign-in` and the Auth.js API route is protected by `middleware.ts`.

## Database Schema

Five models — all data scoped to a `Draft`:

- `Draft` — top-level container. `ownerId` = Auth.js userId (Discord snowflake); `ownerTeamId` = which `Team` belongs to the owner (used by nomination scoring instead of the old hardcoded `'coreschke'` handle)
- `Team` — managers within a draft; unique on `(handle, draftId)`
- `AuctionResult` — one row per completed bid (player, position, nflTeam, price, sfRank, notes, teamId, draftId)
- `PlayerWatchlist` — owner's personal watchlist; excluded from nomination suggestions; unique on `(playerName, draftId)`
- `NominatedPlayer` — players currently up for bidding; shown with a teal "LIVE" badge; auto-removed when a bid is logged via `logBid`; unique on `(playerName, draftId)`

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

**`src/lib/draft.ts`**

- `getDraftForUser(userId)` — finds the Draft whose `ownerId` matches the Auth.js userId; returns `DraftWithOwnerTeam | null`

**`src/lib/nominationScoring.ts`** — core nomination intelligence

- `computeNominationScores(players, teamStats, auctionResults, watchlist, nominatedPlayers, myHandle)`
- Filters out won players, watchlist items, and currently nominated players
- For each available player, scores rival demand: `needRatio = (target - currentCount) / target` per position per team
- Nomination score = `totalRivalDemand × player.ceiling` where demand = `sum(rival.buyingPower × needRatio)`
- Returns `ScoredPlayer[]` with top rival contributors

**`src/lib/actions.ts`** — server actions (auth-gated; revalidate `/` on each mutation)

- All actions call `auth()` and `getDraftForUser()` — unauthorized or no-draft throws immediately
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

Prisma 7 changed how connections are configured:

- `datasource` block in `schema.prisma` takes no `url` field — connection config lives in `prisma.config.ts`
- Uses `@prisma/adapter-pg` (pg Pool) — do not instantiate PrismaClient without the adapter
- `db.ts` creates a `Pool` from `DATABASE_URL` and passes a `PrismaPg` adapter to `PrismaClient`
- `prisma.config.ts` loads `.env.local` explicitly via `dotenv` (Prisma CLI does not auto-load it)
- `postinstall` script runs `prisma generate` automatically after `pnpm install`

After any schema change: `pnpm prisma migrate dev --name <description>`
After pulling changes with new migrations: `pnpm prisma migrate dev` (applies pending)

## Environment Variables

Required in `.env.local` (never commit):

```
DATABASE_URL=          # Postgres connection string (Neon or local)
AUTH_SECRET=           # Auth.js secret (generate with: openssl rand -base64 32)
AUTH_DISCORD_ID=       # Discord OAuth app client ID
AUTH_DISCORD_SECRET=   # Discord OAuth app client secret
OWNER_DISCORD_ID=      # Your Discord user ID — seeds ownerId on the default draft
```

## Code Quality Rules

- Single quotes, trailing commas, 2-space indent, 100 char line width (Prettier)
- No unused vars (ESLint errors), no explicit `any` (ESLint warns) — use `unknown` with a type guard if the type is genuinely unknown
- Pre-commit hook runs `pnpm lint-staged` + `pnpm tsc --noEmit` — do not skip with `--no-verify`
- CI runs typecheck + lint + format check + tests on every PR
- **Before any code review** (`/code-review` or otherwise): run `pnpm tsc --noEmit` and `pnpm lint` to surface type errors and lint violations early — these are the same checks the pre-commit hook enforces and they won't run automatically during edit sessions
- Non-null assertions (`!`) only when the value's existence is obvious from context
- Prefer `interface` over `type` for object shapes (props, API responses, domain types) — reserve `type` for unions, intersections, and aliases
- No unhandled promise rejections — every async call must either propagate to an error state the UI renders, or be caught with a visible fallback

## TypeScript & React Standards

- **Functional components only** — no class-based components
- **Typed props interfaces** — every component must have an explicit `interface` for its props; no inline type literals, no `any`
- **Decompose large components** — if a component exceeds ~300 lines or handles more than one concern, split it
- **`useEffect` / `ref` carefully** — only when necessary and as React designs them; overuse is a common source of bugs and unnecessary renders
- **No duplicate components** — check existing components and the codebase before creating a new one

## Testing Standards

- **Select by `data-testid` or `id`** — avoid visible text, role+name, or CSS class selectors; they're brittle. Add a `data-testid` to the component under test if one doesn't exist.
- **Typed mock data** — annotate test fixtures with the real source type (e.g. `const MOCK_TEAM: Team[]`). Reuse types from `src/types/` rather than redefining shapes locally.

## What's Built

- **Auth** — Discord OAuth via Auth.js v5; JWT sessions; middleware protects all routes; `/sign-in` page
- **PostgreSQL** — migrated from SQLite; Neon in prod, local WSL2 Postgres in dev; `@prisma/adapter-pg`
- **Multi-draft schema** — `Draft` model with `ownerId` + `ownerTeamId`; all data scoped to `draftId`; expand/contract migration complete (non-nullable, composite uniques)
- **League settings** — `Draft` stores `teamCount`, `rosterSize`, `budget`, `startingLineup Json?`, `scoringSettings Json?`, `targetRoster Json?`; form has Roster Settings, Starting Lineup builder, and Scoring sections; QB/SUPER_FLEX lineup validation (PR #20)
- **Per-draft Player table** — `Player` model scoped to `draftId`, seeded from ETR base values at draft creation; `age Float?`; `@@unique([name, draftId])`; `prisma/seed-players.ts` backfills existing drafts (PR #20)
- `/` — Value sheet with full player list (from DB), filters, search, sort, bid logging modal, budget tracker
- `/teams` — Team roster tracker with expandable rows, spend/remaining/buying power per team, delta vs. target per player (players from DB)
- `/budget` — Budget pressure view sorted by buying power with auto-refresh
- `/nominate` — Nomination helper that ranks available players by rival demand; personal watchlist persisted to DB; "Nom" button tracks players currently in auction; full server-component with auth gate (PR #20)

## Player Data

Source: ETR dynasty rankings CSV (~267 players). Values scaled ×5 for $1,000 budget; TE premium applied post-import. Lives in `src/data/players.ts` as server-only seed data — **never import this in client components**. Will be replaced by custom rankings upload (#7) when that lands.

`ScoringSettings` is a `type` alias (not `interface`) — Prisma's `InputJsonValue` requires implicit string index signature that only type aliases provide.

## What's Next

**Deploy Milestone** (Vercel + Neon) — #5a League Settings + Player Table is done (PR #20). `prisma migrate deploy` is already wired into the Vercel build command — Neon migration applies on deploy. Run `pnpm tsx prisma/seed-players.ts` against prod DB after PR #20 merges (before deploying) to backfill existing drafts.

**Longer term** (see `ROADMAP.md`):

- #5b Value adjustment algorithm — tunes player budget/ceiling/floor based on league settings delta from baseline. `rosterSize` is stored on `Draft` but `computeTeamStats` still uses the `ROSTER_SIZE` constant — #5b wires those together.
- #5c Sleeper league import — auto-populate draft settings from a Sleeper league ID
- #6 UI redesign (Linear/Vercel aesthetic, shadcn/ui shortlisted) — after deploy milestone
- #7 Custom rankings upload CSV — adds upload UI on top of the Player model from #5a

## Global Rules

**Read before touching.** Before making any change in the repo, read the repo's `CLAUDE.md`. It contains the stack, layout, conventions, and repo-specific constraints that take precedence over general intuition.

**Don't commit trivial superpowers docs.** Design specs and implementation plans generated during a superpowers workflow should only be committed when the work is non-trivial enough that future-you would want to understand why a design decision was made. For simple, self-evident work, clean up generated spec/plan files at the end of the workflow — don't commit them.

**Keep PRs clean.** Don't let extraneous files (scratch notes, generated docs, debug artifacts, unrelated changes) into PRs. This can be overridden if explicitly requested, but the default is a clean diff that contains only what the PR describes.

**No author attribution in commits.** Do not add `Co-Authored-By`, `Author:`, or any other authorship lines to commit messages.

**Don't be a sycophant!** The last thing I want in development is a yes man. If you agree with me on something that's fine, but please please think critically about my choices in development and if you have questions or concerns bring them up and challenge me if need be.

**Always pull main before branching or creating a worktree.** Before creating any new branch or worktree, run `git pull origin main` (or `git fetch && git merge origin/main`) in the main repo first. A branch created from a stale main silently excludes in-flight work and forces the implementer to either duplicate it or rebase later. One pull prevents both.
