# DraftOps — Claude Context

Fantasy football dynasty auction draft tool built for a 12-team Superflex Sleeper league. The owner (Cole, handle: `coreschke`) is using this during a live slow auction and plans to share it with the Establish The Run dynasty Discord for feedback.

## Quick Commands

```bash
make setup       # First-time: install + migrate + seed
make dev         # Dev server at http://localhost:3000
make check       # Full quality gate: typecheck + lint + format + test
make test        # Jest only
make test-e2e    # Playwright smoke tests (use a disposable database)
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
│   │   ├── draft/[draftId]/             # Per-draft info, nomination, nominated, and watchlist routes
│   │   ├── drafts/route.ts              # GET/POST draft collection
│   │   └── log-error/route.ts           # Client error reporting
│   ├── draft/[draftId]/              # Value sheet plus budget, nominate, and teams subpages
│   ├── drafts/                       # Draft list and validated draft-creation form
│   ├── rankings/page.tsx             # /rankings — upload + resolve a custom ranking set (server component, profile-level, not draft-scoped)
│   ├── sign-in/page.tsx              # /sign-in — split-layout sign-in screen (brand panel + live value ticker), Discord OAuth
│   ├── error.tsx                     # App-level error boundary
│   ├── global-error.tsx               # Root error boundary
│   ├── globals.css                   # CSS custom properties (design tokens)
│   ├── icon.svg                      # Static favicon (gavel mark) — Next.js App Router file convention, auto-wired
│   ├── layout.tsx                    # Font setup + NavBar
│   └── page.tsx                      # Redirects to the sole active draft or /drafts
├── auth.ts                           # Auth.js config: Discord provider, JWT strategy, session callback
├── components/
│   ├── AuctionSheet/                 # Main player value sheet + bid logging
│   ├── BidModal/                     # Log/edit/delete bid modal
│   ├── Brand/                        # LogoMark (gavel icon SVG) + LogoLockup (icon+"DraftOps" wordmark), used in NavBar and /sign-in
│   ├── BudgetPressure/               # Live threat board (ThreatBoard) — position selector + threat ranking (maxBid × revealed appetite) + 20s auto-refresh
│   ├── NavBar/                       # Fixed header with nav links
│   ├── NominationHelper/             # Nomination scorer + watchlist + in-auction sidebar
│   ├── RankingsUpload/                # RankingsUploadForm (upload/re-upload + summary), ResolveUnmatchedList (cmdk search-and-pick for unmatched rows)
│   ├── RosterTracker/                # Manager dossier grid (DossierCard) — per-team scouting cards (lean/appetite/aggression), expandable grouped roster drawer
│   ├── SignIn/                       # SignInScreen (split desktop / stacked mobile layout) + ValueTicker (scrolling curated-data marquee) + tickerPlayers.ts (static decorative data)
│   ├── SleeperRosterSync/            # SleeperRosterSyncDialog — Sleeper league/roster mapping + catch-up batch preview, opened from AuctionSheet
│   └── Onboarding/                   # First-draft welcome and active-draft feature tour
├── data/
│   └── players.ts                    # ~267 ETR dynasty players — server-only seed source (NOT imported by client components); exports `players` (BASE_PLAYERS) + `PKG_PLAYERS` (pick-package subset)
├── lib/
│   ├── actions.ts                    # Auth-gated draft lifecycle and bid mutations; createDraft returns DraftMutationResult
│   ├── activeDraftPlayers.ts         # Canonical loader that overlays only the active projection value set
│   ├── computeDraftTeamStats.ts      # Per-draft team stats for the budget, teams, and nomination views
│   ├── csv.ts                        # parseCsv/parseCsvLine — shared quoted-field CSV parser (rankings upload + prisma/apply-projection-values.ts)
│   ├── db.ts                         # Prisma singleton using PrismaPg adapter (pg Pool)
│   ├── draft.ts                      # getDraft(userId, draftId) — auth-gated draft lookup
│   ├── nominationScoring.ts          # computeNominationScores(..., targetRoster) — core nomination logic
│   ├── posColors.ts                  # POS_COLORS map (bg, accent, badge, badgeText per position)
│   ├── rankingsImport.ts             # parseRankingsCsv — validates + scales an uploaded ETR rankings CSV into ParsedRankingRow[]
│   ├── rankings-actions.ts           # Server actions: uploadRankingsCsv, resolveRankingMatch, getRankingSummary (profile-level custom rankings)
│   ├── scaleRankingValue.ts          # budget/ceiling/floor scaling formula (×5, TE premium) — shared by players.ts and rankingsImport.ts
│   ├── sleeperMatch.ts               # matchToSleeper — name/team/position matching against SleeperPlayer, with manual-alias fallback
│   ├── sleeperNormalize.ts           # normalizeName/normalizeTeam/normalizePosition — TS port of the Python projection-pipeline normalizer
│   ├── sleeperRosterSync.ts          # reconcileSleeperRosters — pure join of Sleeper rosters ↔ mapped teams ↔ Player.sleeperId; no Prisma/fetch/React
│   ├── sleeper-roster-actions.ts     # Server actions: saveSleeperRosterMapping, previewSleeperRosterSync, logSleeperRosterCatchUp (#9b)
│   ├── tendencies.ts                 # computeTendencies — per-manager behavioral engine (lean/appetite/aggression); feeds /teams + /budget
│   ├── tendencies.constants.ts       # tunable thresholds + appetite multipliers for the tendency engine (backend-only)
│   ├── threat.ts                     # maxBid, appetiteMultiplier, threatScore — Budget Pressure threat ranking
│   ├── projectionScoring.ts          # league-specific fantasy points from normalized projections
│   ├── projectionVor.ts              # replacement level, VOR, projection auction values
│   ├── projectionApplication.ts      # Stage, validate, and activate projection value sets transactionally
│   ├── valueAdjustment.ts            # adjustPlayerValues — #5b algorithm (scoring/scarcity/concentration multipliers)
│   ├── valueAdjustment.constants.ts  # tunable calibration constants for the value adjustment algorithm (backend-only)
│   └── teams.ts                      # LEAGUE_TEAMS — seed default only (prisma/seed.ts); runtime reads per-draft settings (#5b)
└── types/
    └── index.ts                      # Player, Position, StartingSlot, ScoringSettings, DEFAULT_* constants,
                                      # TeamStats, AuctionResultEntry, RosterEntry, TeamWithRoster, ClaimedBid, LeagueTeam
middleware.ts                         # Auth.js middleware — redirects unauthenticated users to /sign-in
prisma/
├── schema.prisma                     # Draft, player, auction, projection, rankings, Sleeper identity, and onboarding models
├── apply-projection-values.ts        # Joins generated projections to draft Players and stores VOR outputs
├── seed.ts                           # Upserts default draft + 12 teams (idempotent)
├── seed-players.ts                   # Full-seed script: seeds Player rows for drafts with zero players (skips drafts that already have any)
├── sync-players.ts                   # Backfill script: inserts src/data/players.ts entries missing (by name) from each draft's Player table; idempotent, safe to re-run after adding new players
├── sync-sleeper-players.ts           # Upserts SleeperPlayer identity rows from generated local CSV data
├── backfill-budget-scaled-values.ts  # Dry-run/apply fallback-value backfill for existing drafts
└── migrations/                       # Postgres migration history
prisma.config.ts                      # Prisma v7 config — DATABASE_URL from env
existing_project_docs/                # Original reference files — do not delete
```

## Pages & Routes

| Route                       | Purpose                                                                                                           |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `/`                         | Redirects an authenticated user to their sole active draft, otherwise `/drafts`.                                  |
| `/drafts`                   | Lists active/completed drafts and provides the first-run welcome.                                                 |
| `/drafts/new`               | Creates a draft using the shared client/server Zod schema.                                                        |
| `/draft/[draftId]`          | Value sheet — filters, search, sorting, bid logging, live nominations, catch-up sync, and advisory Value Spreads. |
| `/draft/[draftId]/teams`    | Manager dossier board; expandable, position-grouped roster detail.                                                |
| `/draft/[draftId]/budget`   | Live threat board, position-anchored to the nomination unless manually overridden.                                |
| `/draft/[draftId]/nominate` | Rival-demand nomination helper with a persisted personal watchlist.                                               |
| `/rankings`                 | Profile-level custom rankings upload and Sleeper-match resolution.                                                |
| `/sign-in`                  | Branded Discord OAuth sign-in with a decorative scrolling `ValueTicker`.                                          |

All pages are server components that fetch from Prisma directly and pass data down to `'use client'` components. Every route except `/sign-in` and the Auth.js API route is protected by `middleware.ts`.

## Database Schema

Draft-scoped auction, projection, and onboarding models plus global/profile-level identity and rankings models:

- `Draft` — top-level container with owner, `ACTIVE`/`COMPLETE` status, league settings, the owner team, optional Sleeper league mapping, and the sole active projection-value-set pointer.
- `OnboardingProgress` — one per user; records first-draft welcome/feature-tour progress and its associated draft.
- `Team` — managers within a draft; unique on `(handle, draftId)`; `sleeperRosterId Int?` — this team's Sleeper roster ID once mapped; unique on `(draftId, sleeperRosterId)`
- `AuctionResult` — one row per completed bid (player, position, nflTeam, price, sfRank, notes, teamId, draftId); unique on `(draftId, playerId)`
- `PlayerWatchlist` / `NominatedPlayer` — persist player identity with a same-draft composite relation, preventing cross-draft references.
- `Player` — per-draft value row. Stores fallback ETR-derived values and optional Sleeper identity. Projection data and projection-derived values live in separate tables.
- `ProjectionSource` / `PlayerProjection` / `DraftProjectionValueSet` / `DraftPlayerValue` — source metadata, normalized projections, atomic staged/active value sets, and draft-specific valuation outputs.
- `SleeperPlayer` — global identity reference (name, normalizedName, team, pos, age; no valuation fields), synced from Sleeper via `prisma/sync-sleeper-players.ts`. Used to match uploaded rankings rows to a stable Sleeper ID.
- `UserRankingSet` / `UserRankingPlayer` — a signed-in user's single active custom rankings upload (unique on `userId`) and its player rows (budget/ceiling/floor pre-scaled, `matchStatus`: `matched`/`manual`/`unmatched`/`n_a`). Seeds `Player` rows at draft creation when `createDraft` is called with `playerSource: 'custom'`; independent of any `Draft`.

Derived values (computed at query time, not stored):

- `spent = SUM(results.price)`
- `remaining = budget - spent`
- `rosterCount = COUNT(results)`
- `buyingPower = remaining - (draft.rosterSize - rosterCount)` — classic auction math
- `delta = result.price - player.budget` — on each roster entry, how much over/under target

## Key Library Files

**`src/lib/teams.ts`**

- `LEAGUE_TEAMS` — 12 teams with handles + display names; used only by `prisma/seed.ts` to seed the default draft. Runtime roster size / position targets come from `draft.rosterSize` and `draft.targetRoster` (see `DEFAULT_TARGET_ROSTER` in `src/types`).

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

**`src/lib/valueSpread.ts`** — Value Spreads engine

- `computeSpreads(players)` → returns players annotated with `spread` (= `projPct − dynPct`), `strategyTag`, `spreadDynRank`/`spreadProjRank`, and `spreadDynPct`/`spreadProjPct` (the percentiles, so the modal reconciles); `strategyTagReason(tag)` for the modal copy; `ordinal(n)` for percentile display; shared `formatSpread`/`spreadColor` display helpers
- Age → lean: `young` → YOUNGER, `aging`+`old` → OLDER, `prime` → no tag. Gate is age-scaled: `SPREAD_GATE` (15) for young/aging, `SPREAD_GATE_OLD` (10) for old. Calibration in `src/lib/valueSpread.constants.ts` (backend-only, TUNABLE)

**`src/lib/ageBands.ts`** — `ageBand(age, pos?)` → `'young' | 'prime' | 'aging' | 'old' | null`; per-position cutoffs in `src/lib/ageBands.constants.ts` (backend-only, TUNABLE). Consumed by both `valueSpread.ts` (tag age gating) and `ageColor.ts` (per-position age coloring); position-less callers fall back to global bands.

**`src/lib/tendencies.ts`** — shared behavioral engine feeding the draft-scoped teams and budget pages

- `computeTendencies(teams, players)` → `ManagerTendency[]`
- Per manager, per position (QB/RB/WR/TE only; PICK/PKG count toward activity, not appetite): `buys`, `spend`, `deltaSum`, `overPct`, `spendShare`, and an `appetite` of `overpays`/`neutral`/`thrifty`/`no-read`
- Derived labels: `appetite` (gated `no-read` until `MIN_BUYS_FOR_READ`), `lean` (top spend-share position, else `balanced`), `aggression` (from overall over% vs value)
- The `no-read` sample-size gate lives ONLY here, so both pages inherit the same honesty. Calibration in `src/lib/tendencies.constants.ts` (backend-only, TUNABLE)

**`src/lib/threat.ts`** — Budget Pressure threat ranking

- `maxBid(team)` = `buyingPower + 1` when a slot remains, else 0 (clamped ≥ 0)
- `appetiteMultiplier(appetite)` — `overpays` > 1, `thrifty` < 1, `neutral`/`no-read` = 1.0 (so cold start ranks by max bid)
- `threatScore(team, appetite)` = `maxBid × appetiteMultiplier`

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

`src/data/players.ts` supplies the built-in ETR source pool; it is server-only and is never a runtime dependency for a deployed draft. The surfaced target is draft-specific:

- Source values come from FantasyCalc's Superflex `2QBAuction` column, normalized ×5 into a $1,000 source economy. TE seeds receive the legacy 1.18 premium; `ceiling`/`floor` derive from the budget. Custom ranking sets persist their own `sourceBudget`.
- At creation, `createDraft` builds the selected built-in or custom pool, adds generated future assets, then scales by `Draft.budget / Draft.playerValueSourceBudget` before applying scoring, scarcity, and concentration multipliers. `Player.base*` preserves source-denominated values; `Player.budget`/`ceiling`/`floor` are the draft-denominated fallback values. PICK/PKG assets scale to the draft budget but bypass the multipliers.
- Projection application stages a fresh `DraftProjectionValueSet` under the per-draft advisory lock, validates it, then atomically switches `Draft.activeProjectionValueSetId`. The canonical loader overlays values only from that active set. A failed or partial application leaves the prior active set untouched.
- `activeAuctionValue` stays anchored to the fallback value; projections only shape the market value by relative lift. Projection/VOR data is context, not raw surfaced auction dollars. Players without an active projected row fall back to `Player.budget`.
- `pnpm tsx prisma/apply-projection-values.ts --draft-id <id>` reapplies values to one draft. `pnpm db:backfill-budget-values` is dry-run by default; use `-- --apply` only after retaining the generated snapshot.

## League-Specific Rules

- **12 teams**, $1,000 budget, 30-man rosters
- **Kicker = pick package**: Winning a kicker bid nets you that team's entire 2027 1st+2nd+3rd picks. Cole's picks = Matt Gay.
- Future-pick availability and package handling are configured per draft; do not assume a static startup-pool year when changing pick behavior.
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
- CI runs quality (typecheck/lint/format/unit), production build, clean-Postgres migrations plus integration tests, Python projection checks, and Playwright smoke tests on every PR.
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
- **E2E isolation** — Playwright uses `e2e/seed.ts` to create data from scratch. Run it only against a disposable database; never point it at a real dev or production database.

## What's Built

- **Auth** — Discord OAuth via Auth.js v5; JWT sessions; middleware protects all routes; `/sign-in` page
- **Logo & sign-in redesign** — DraftOps' first real brand mark: `LogoMark` (`src/components/Brand/LogoMark.tsx`) is a gavel built from plain SVG geometry (a perpendicular head-and-handle assembly over a sounding block, single-color `var(--primary)` fill), paired with a "DraftOps" wordmark via `LogoLockup`. Used in the `NavBar` (wrapped in a `Link` back to `/`, replacing the old plain-text wordmark) and on a redesigned `/sign-in` (`SignInScreen`): a split brand-panel/`ValueTicker` layout on desktop (`md:` and up), reflowing to a stacked layout on mobile (ticker shrinks to a fixed-height band rather than disappearing). `ValueTicker` is a decorative, CSS-only (no client JS) scrolling marquee of a static curated `TICKER_PLAYERS` list (`src/components/SignIn/tickerPlayers.ts`, ~50 entries — not real/live data), respecting `prefers-reduced-motion`. The favicon (`src/app/icon.svg`, Next.js App Router file convention) uses the same gavel geometry with a literal hex fill (a standalone SVG has no access to CSS custom properties). Spec: `docs/superpowers/specs/2026-07-16-logo-signin-redesign-design.md`.
- **PostgreSQL** — migrated from SQLite; Neon in prod, local WSL2 Postgres in dev; `@prisma/adapter-pg`
- **Multi-draft schema** — `Draft` model with `ownerId` + `ownerTeamId`; all data scoped to `draftId`; expand/contract migration complete (non-nullable, composite uniques)
- **League settings** — `Draft` stores `teamCount`, `rosterSize`, `budget`, `startingLineup Json?`, `scoringSettings Json?`, `targetRoster Json?`; form has Roster Settings, Starting Lineup builder, and Scoring sections; QB/SUPER_FLEX lineup validation (PR #20)
- **Per-draft Player table** — `Player` model scoped to `draftId`, seeded from ETR base values at draft creation; `age Float?`; `@@unique([name, draftId])`; `prisma/seed-players.ts` backfills existing drafts (PR #20)
- **Value adjustment algorithm (#5b Phase 1)** — at draft creation, `adjustPlayerValues` (`src/lib/valueAdjustment.ts`) tunes each player's `budget`/`ceiling`/`floor` from base ETR values via three multipliers: per-position **scoring** (TE-premium is the dominant case; TE band widened), per-position **lineup-scarcity** (FLEX/SF demand flows to the scoring-favored position), and rank-based **concentration** tilt (teamCount × lineup size). `Player` now stores `baseBudget`/`baseCeiling`/`baseFloor` (untouched) alongside the adjusted trio. Only new drafts are adjusted — existing/live drafts keep `base = adjusted`, no recompute trigger yet. Runtime now reads `draft.rosterSize`/`draft.targetRoster` instead of the `ROSTER_SIZE`/`TARGET_ROSTER` constants. Calibration lives in `src/lib/valueAdjustment.constants.ts` (backend-only, TUNABLE). Phase 2 (Mike Clay projection dual-scoring, first-down historical rates, VOR concentration) is the fast-follow.
- **Projection-aware VOR engine (#5e initial)** — generated Mike Clay projections can be joined to Sleeper-linked ETR values and applied to a draft with `pnpm tsx prisma/apply-projection-values.ts --draft-id <id>`. The script stores `Player.sleeperId`, source stats in `PlayerProjection`, and league-specific projected points/VOR/auction outputs in `DraftPlayerValue`. Projection values are written as a parallel value source; `activeAuctionValue` remains fallback by default. Rookie handling is asymmetric: low rookie projections do not reduce active value, but strong rookie projections can lift it when projection values are explicitly activated.
- `/` — Value sheet with full player list (from DB), filters, search, sort, bid logging modal, budget tracker
- **Secondary-pages divergence** — draft-scoped `/draft/[draftId]/teams` and `/draft/[draftId]/budget` answer distinct questions via `src/lib/tendencies.ts`; neither uses count-vs-target need framing. The teams page renders manager dossiers, while the budget page ranks position-specific threats by `maxBid × appetite`.
- **Nomination helper** — draft-scoped `/draft/[draftId]/nominate` ranks available players by rival demand and persists personal watchlist/live-nomination state.
- **Custom rankings upload (#7)** — profile-level, not per-draft: `/rankings` lets a signed-in user upload an ETR dynasty CSV export once (`src/lib/rankingsImport.ts` validates required columns, filters to QB/RB/WR/TE/Pick, scales values via `src/lib/scaleRankingValue.ts`, derives or reads `sfRank`), matched against a synced `SleeperPlayer` identity table (`src/lib/sleeperMatch.ts`/`sleeperNormalize.ts`, TS ports of the Python projection pipeline's matcher — run `pnpm tsx prisma/sync-sleeper-players.ts` to (re)populate `SleeperPlayer` from `data/generated/normalized_sleeper_players.csv`). Unmatched rows get a `cmdk`-based resolve-by-search UI (`ResolveUnmatchedList`). One active `UserRankingSet` per user (full replace on re-upload). At draft creation, `/drafts/new` shows a "Player Pool" selector (ETR default vs. custom) only when a set exists; `createDraft({ playerSource: 'custom' })` seeds `Player` from the set's rows + the existing hardcoded `PKG_PLAYERS` instead of the bundled ETR pool. No replace-on-an-existing-draft flow — a ranking set only seeds new drafts. Spec: `docs/superpowers/specs/2026-07-10-custom-rankings-upload-design.md`.
- **Sleeper roster catch-up (#9b)** — lets an operator who fell behind on manual bid logging reconcile against their real Sleeper league in one batch instead of re-entering everything by hand. A draft maps to a Sleeper league (`Draft.sleeperLeagueId`) and each `Team` maps to a Sleeper roster (`Team.sleeperRosterId`, unique per draft); import from Sleeper league setup carries these through automatically, and manual/legacy drafts map once via the same dialog. `src/lib/sleeperRosterSync.ts` (`reconcileSleeperRosters`) is a pure join of current Sleeper rosters, mapped teams, `Player.sleeperId`, and already-logged `AuctionResult.playerId`s into actionable/unresolved/diagnostic buckets — no Prisma, fetch, or React. `src/lib/sleeper-roster-actions.ts` owns auth, current-Sleeper verification, and the transactional batch write (`logSleeperRosterCatchUp`): re-validates each entry's team/roster assignment against Sleeper at submit time, treats a unique-constraint hit on `(draftId, playerId)` as a per-row `already_logged` conflict rather than failing the batch, and clears matching `NominatedPlayer` rows for whatever it creates. `SleeperRosterSyncDialog` (opened via "Catch up from Sleeper" on the value sheet) renders configuration, preview, and error states from these typed responses; Sleeper-derived winner/team assignments are locked, only price is operator-entered, blank rows are silently omitted from the batch, and a successful submit always triggers `router.refresh()` (even when every row conflicted) so the authoritative server state — including changes made concurrently by something else — is reflected. Sync is on-demand and additive only; it never edits or removes existing `AuctionResult` rows. The configuration step auto-matches Sleeper rosters to DraftOps teams wherever a `Team.handle` exactly (case-insensitively) equals the roster owner's Sleeper `display_name` — `matchSleeperRostersToTeams` (`src/lib/sleeper.ts`) exposed via the read-only `previewSleeperRosterMatch` action; a roster/team pair with a working saved mapping is always kept over a coincidental handle match, and anything left over still requires a manual pick. The league ID field is pre-filled from `draft.sleeperLeagueId` (threaded through `AuctionSheet`) instead of always starting blank. Spec: `docs/superpowers/specs/2026-07-14-sleeper-roster-catchup-design.md`, `docs/superpowers/specs/2026-07-15-sleeper-roster-sync-match-design.md`.
- **Draft-creation validation and transaction shortening (HARD-007)** — `createDraft` (`src/lib/actions.ts`) now validates its full input against one shared Zod schema (`src/lib/draftInputSchema.ts`, also consumed client-side by `drafts/new/page.tsx`) covering name/budget/roster-size/target-roster/starting-lineup/scoring-range/team bounds, case-insensitive handle uniqueness, exactly-one-owner-team, and per-submission Sleeper-roster-ID uniqueness. It returns `DraftMutationResult<{ draftId }>` (matching every other mutation in `src/lib/draftMutation.ts`) instead of throwing strings and self-redirecting; the page checks the result and navigates itself. Pure calculations and read-only lookups (custom ranking-set fetch, future-pick generation, value adjustment) now run before the transaction opens; team creation is one batched `createManyAndReturn` call correlated by handle (not row position); the remaining interactive transaction has an explicit timeout with per-stage `console.info` duration logging.
- **Resilient optimistic mutations (HARD-010)** — `BidModal` is now a semantic `<form>` (Enter in the price field submits) with a two-step Remove/Confirm Remove destructive-action guard (a `Keep` button reverts) and an `isSubmitting`-disabled state on every control while a save is in flight. `AuctionSheet` now consumes the `isPending` flag `useTransition` already returned (previously discarded), passing it to `BidModal` to block duplicate bid submits, and calls `router.refresh()` on any rejected bid/nomination mutation to resync canonical server state after a conflict (e.g. a concurrently-claimed player). `AuctionSheet.handleNominate`'s fetch previously had no `.catch`, so a thrown network error produced an unhandled rejection and left the optimistic "LIVE" badge stuck — it now rolls back and refreshes on both thrown errors and non-2xx responses. `NominationHelper`'s four watchlist/nomination handlers (`addToWatchlist`/`removeFromWatchlist`/`nominatePlayer`/`unNominatePlayer`) share one `runPlayerMutation` helper (`src/components/NominationHelper/NominationHelper.tsx`) wrapping every request in `try/catch/finally`, tracking a per-player `pendingIds` set, restoring the prior snapshot on failure, and refetching canonical nomination data (`fetchData`, extracted from the 30s polling effect) instead of trusting a possibly-stale snapshot; only `nominatePlayer` had a catch before this. Note: `pendingIds`-driven disabling on the Watch/Nominate/remove controls is defense-in-depth rather than the primary duplicate-click guard — `computeNominationScores` excludes watchlisted/nominated players from nomination targets, so the optimistic update removes a row's entire control from view in the same render as the click, which is the actual (stronger) protection. A shared `MutationStatus` component (`src/components/MutationStatus.tsx`, a visually hidden `aria-live="polite"` region) announces pending/success/failure text on both the value sheet and the nomination workbench.
- **Value Spreads** — advisory overlay on the value sheet (successor to the removed strategy "Lens", which was pulled for mutating auction values). Never mutates values. `computeSpreads` (`src/lib/valueSpread.ts`) runs server-side in `src/app/draft/[draftId]/page.tsx`, annotating each `Player` with a position-relative percentile **rank gap** (`spread = pctProj − pctDyn` over the above-replacement common set, `vor > 0`) between projection value and dynasty value, plus an **age-aware archetype tag** (`WIN-NOW`/`BARGAIN`/`FUTURE`/`FADE`). Tag rules: `young` → BARGAIN/FUTURE, `aging`+`old` → OLDER → WIN-NOW/FADE (the dynasty market discounts age from the aging years on, so that whole range carries the win-now/fade signal); **only `prime` never tags**. The gate is **age-scaled** (`valueSpread.constants.ts`): young/aging need `|spread| ≥ SPREAD_GATE` (15), old needs `≥ SPREAD_GATE_OLD` (10) — older players need a smaller edge because the market already discounts them. Surfaced as: a sortable "Spread" column (nulls sort last) + archetype filter chips (pure view filter, hidden when no player has a tag) on `/` (value sheet), and a label in the bid modal's Price-context panel that shows the two ranks as **percentiles** (`Dyn 76th (#28) · Proj 91st (#11) · Spread +15`) so `spread = projPct − dynPct` reconciles on screen. No-read (spread `—`, no tag) for below-replacement / no-projection / non-QBRWTE players; prime shows the number but no tag. Gracefully dormant when a draft has no projections applied. Introduced `src/lib/ageBands.ts` (per-position age bands) and retrofitted `src/lib/ageColor.ts` onto it — a position-less caller (team avg age in `DossierFace`) keeps the global fallback. Spec: `docs/superpowers/specs/2026-07-14-value-spreads-design.md`.
- **Dependency security auditing (HARD-013)** — `.github/dependabot.yml` opens weekly version-update PRs for the npm (grouped: next-and-react, prisma, eslint-and-prettier, testing), github-actions, and uv ecosystems. `.github/workflows/security-audit.yml` runs `pnpm audit --prod` on a weekly cron + manual dispatch (no install step needed — `pnpm audit` resolves off the lockfile alone). Known transitive-dependency advisories are pinned via `pnpm-workspace.yaml`'s `overrides:` block (pnpm 11 moved this off `package.json`'s `pnpm.overrides`, which is no longer read) — each override is capped to its current major (e.g. `>=1.19.13 <2.0.0`) so a routine `pnpm install` can't silently take an unreviewed major bump, and is commented with its GHSA ID and removal condition (parent package bumping its own pin past the vulnerable version).

## Player Data

Source: ETR dynasty rankings CSV (~267 players). Values scaled ×5 for $1,000 budget; TE premium applied post-import. Lives in `src/data/players.ts` as server-only seed data — **never import this in client components**. Users can now upload their own rankings via `/rankings` (#7, above) as an alternative to this default pool at draft creation.

`ScoringSettings` is a `type` alias (not `interface`) — Prisma's `InputJsonValue` requires implicit string index signature that only type aliases provide.

## What's Next

**Deploy Milestone** (Vercel + Neon) — done. `prisma migrate deploy` is wired into the Vercel build command — Neon migration applies on deploy. Prod `SleeperPlayer` is populated (3,035 rows, synced via `pnpm tsx prisma/sync-sleeper-players.ts` run locally against the Neon `DATABASE_URL`) — re-run that script against prod whenever `data/generated/normalized_sleeper_players.csv` is regenerated from the Python pipeline, since that file is gitignored and never deployed. `createDraft`'s default (ETR) path resolves `Player.sleeperId` via a live `SleeperPlayer` query (`src/lib/actions.ts`'s `resolveEtrSleeperMatches`), not a filesystem read — no other runtime code path may depend on `data/generated/*` files existing in the deployed app; those files are for local/CLI scripts only (`prisma/seed-players.ts`, `prisma/sync-players.ts`, `prisma/apply-projection-values.ts`).

**Longer term** (see `ROADMAP.md`):

- #5b Value adjustment algorithm — **Phase 1 (position-level) done**: settings→value plumbing + scoring/scarcity/concentration multipliers + `rosterSize`/`targetRoster` rewiring. Spec: `docs/superpowers/specs/2026-07-06-value-adjustment-algorithm-design.md`. **Phase 2** (fast-follow) layers per-player Mike Clay projection dual-scoring on top, adds first-down historical rates, and swaps the concentration median pivot for value-over-replacement.
- #5c Sleeper league import — auto-populate draft settings from a Sleeper league ID
- #6 UI redesign (Linear/Vercel aesthetic, shadcn/ui shortlisted) — after deploy milestone
- #7 Custom rankings upload CSV — **done**, see What's Built above. Deferred: kicker/PKG naming + team-assignment UI (tracked under #8), re-upload/replace flow on an already-created draft, multiple named ranking sets per user, flexible CSV column mapping (headers are locked to the ETR export format).

## Global Rules

**Read before touching.** Before making any change in the repo, read the repo's `CLAUDE.md`. It contains the stack, layout, conventions, and repo-specific constraints that take precedence over general intuition.

**Don't commit trivial superpowers docs.** Design specs and implementation plans generated during a superpowers workflow should only be committed when the work is non-trivial enough that future-you would want to understand why a design decision was made. For simple, self-evident work, clean up generated spec/plan files at the end of the workflow — don't commit them.

**Keep PRs clean.** Don't let extraneous files (scratch notes, generated docs, debug artifacts, unrelated changes) into PRs. This can be overridden if explicitly requested, but the default is a clean diff that contains only what the PR describes.

**No author attribution in commits.** Do not add `Co-Authored-By`, `Author:`, or any other authorship lines to commit messages.

**Don't be a sycophant!** The last thing I want in development is a yes man. If you agree with me on something that's fine, but please please think critically about my choices in development and if you have questions or concerns bring them up and challenge me if need be.

**Always pull main before branching or creating a worktree.** Before creating any new branch or worktree, run `git pull origin main` (or `git fetch && git merge origin/main`) in the main repo first. A branch created from a stale main silently excludes in-flight work and forces the implementer to either duplicate it or rebase later. One pull prevents both.
