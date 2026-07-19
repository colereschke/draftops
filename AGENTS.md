# DraftOps — Codex Context

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
│   ├── rankings/page.tsx             # Profile-level custom rankings upload and match resolution
│   ├── sign-in/page.tsx              # Branded Discord OAuth sign-in screen
│   ├── error.tsx                     # App-level error boundary
│   ├── global-error.tsx               # Root error boundary
│   ├── globals.css                   # CSS custom properties (design tokens)
│   ├── icon.svg                      # Gavel favicon (Next.js App Router file convention)
│   ├── layout.tsx                    # Font setup + NavBar
│   └── page.tsx                      # Redirects to the sole active draft or /drafts
├── auth.ts                           # Auth.js config: Discord provider, JWT strategy, session callback
├── components/
│   ├── AuctionSheet/                 # Main player value sheet + bid logging
│   ├── BidModal/                     # Log/edit/delete bid modal
│   ├── Brand/                        # Gavel logo mark and wordmark lockup
│   ├── BudgetPressure/               # Live threat board + 20s auto-refresh
│   ├── NavBar/                       # Fixed header with nav links
│   ├── NominationHelper/             # Nomination scorer + watchlist + in-auction sidebar
│   ├── Onboarding/                   # First-draft welcome and active-draft feature tour
│   ├── RankingsUpload/               # CSV upload and unmatched Sleeper-player resolution
│   ├── RosterTracker/                # Manager dossiers and expandable grouped rosters
│   ├── SignIn/                       # Branded sign-in screen and decorative value ticker
│   └── SleeperRosterSync/            # Sleeper mapping and catch-up batch dialog
├── data/
│   └── players.ts                    # ~267 ETR dynasty players — server-only seed source (NOT imported by client components)
├── lib/
│   ├── actions.ts                    # Auth-gated draft lifecycle and bid mutations; createDraft returns DraftMutationResult
│   ├── activeDraftPlayers.ts         # Canonical loader that overlays only the active projection value set
│   ├── computeDraftTeamStats.ts      # Per-draft team stats for all draft views
│   ├── db.ts                         # Prisma singleton using PrismaPg adapter (pg Pool)
│   ├── draft.ts                      # getDraft(userId, draftId) — auth-gated draft lookup
│   ├── nominationScoring.ts          # computeNominationScores(..., targetRoster) — core nomination logic
│   ├── posColors.ts                  # POS_COLORS map (bg, accent, badge, badgeText per position)
│   ├── projectionApplication.ts      # Stage, validate, and atomically activate projection value sets
│   ├── tendencies.ts                 # Shared manager behavior engine for /teams and /budget
│   ├── threat.ts                     # Position-specific budget threat ranking
│   ├── valueAdjustment.ts            # Draft-settings fallback-value adjustment
│   ├── valueSpread.ts                # Advisory dynasty-versus-projection spread tags
│   └── teams.ts                      # Default seed teams only; runtime reads draft settings
└── types/
    └── index.ts                      # Player, Position, StartingSlot, ScoringSettings, DEFAULT_* constants,
                                      # TeamStats, AuctionResultEntry, RosterEntry, TeamWithRoster, ClaimedBid, LeagueTeam
middleware.ts                         # Auth.js middleware — redirects unauthenticated users to /sign-in
prisma/
├── schema.prisma                     # Draft, player, auction, projection, rankings, Sleeper identity, and onboarding models
├── seed.ts                           # Upserts default draft + 12 teams (idempotent)
├── seed-players.ts                   # Full-seed script: seeds Player rows for drafts with zero players (skips drafts that already have any)
├── sync-players.ts                   # Backfill script: inserts src/data/players.ts entries missing (by name) from each draft's Player table; idempotent, safe to re-run after adding new players
├── sync-sleeper-players.ts           # Upserts generated Sleeper identity data for ranking/projection matching
├── backfill-budget-scaled-values.ts  # Dry-run/apply fallback-value backfill for existing drafts
└── migrations/                       # Postgres migration history
prisma.config.ts                      # Prisma v7 config — DATABASE_URL from env
existing_project_docs/                # Original reference files — do not delete
```

## Pages & Routes

| Route                       | Purpose                                                                                                   |
| --------------------------- | --------------------------------------------------------------------------------------------------------- |
| `/`                         | Redirects an authenticated user to their sole active draft, otherwise `/drafts`.                          |
| `/drafts`                   | Lists active/completed drafts and offers validated draft creation at `/drafts/new`.                       |
| `/draft/[draftId]`          | Value sheet — filters, sorting, bid logging, live nominations, catch-up sync, and advisory Value Spreads. |
| `/draft/[draftId]/teams`    | Manager dossier board with expandable, position-grouped roster detail.                                    |
| `/draft/[draftId]/budget`   | Live threat board, position-anchored to the nomination unless manually overridden.                        |
| `/draft/[draftId]/nominate` | Rival-demand nomination helper with persisted watchlist.                                                  |
| `/rankings`                 | Profile-level custom rankings upload and Sleeper-match resolution.                                        |
| `/sign-in`                  | Branded Discord OAuth sign-in with a decorative scrolling `ValueTicker`.                                  |

All pages are server components that fetch from Prisma directly and pass data down to `'use client'` components. Every route except `/sign-in` and the Auth.js API route is protected by `middleware.ts`.

## Database Schema

Draft-scoped auction, projection, and onboarding models plus global/profile-level identity and rankings models:

- `Draft` — top-level container with owner, `ACTIVE`/`COMPLETE` status, league settings, the owner team, optional Sleeper league mapping, and the sole active projection-value-set pointer.
- `OnboardingProgress` — one per user; records first-draft welcome/feature-tour progress and its associated draft.
- `Team` / `AuctionResult` / `PlayerWatchlist` / `NominatedPlayer` — draft-scoped operational data. Player-facing references use composite same-draft relations, so cross-draft associations cannot be persisted.
- `Player` — per-draft fallback-value row with optional Sleeper/custom identity and generated future-asset metadata.
- `ProjectionSource` / `PlayerProjection` / `DraftProjectionValueSet` / `DraftPlayerValue` — source metadata, normalized projections, atomic staged/active value sets, and draft-specific valuation outputs.
- `SleeperPlayer` — global identity reference for custom-ranking and projection matching.
- `UserRankingSet` / `UserRankingPlayer` — one signed-in user's active custom-ranking set and its rows; it can seed new drafts but does not modify existing ones.

Derived values (computed at query time, not stored):

- `spent = SUM(results.price)`
- `remaining = budget - spent`
- `rosterCount = COUNT(results)`
- `buyingPower = remaining - (draft.rosterSize - rosterCount)` — classic auction math
- `delta = result.price - player.budget` — on each roster entry, how much over/under target

## Key Library Files

**`src/lib/teams.ts`**

- `LEAGUE_TEAMS` — 12 teams with handles + display names; used only to seed the default draft. Runtime roster size and targets come from draft settings.

**`src/lib/draft.ts`**

- `getDraftForUser(userId)` — finds the Draft whose `ownerId` matches the Auth.js userId; returns `DraftWithOwnerTeam | null`

**`src/lib/nominationScoring.ts`** — core nomination intelligence

- `computeNominationScores(players, teamStats, auctionResults, watchlist, nominatedPlayers, myHandle, targetRoster)`
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

Values start in `src/data/players.ts`, but the surfaced auction target is now a layered,
draft-specific value.

Source value logic:

- Source: `2QBAuction` column from the FantasyCalc CSV (Superflex format, $200 budget)
- Normalize: `× 5` to convert raw values into the explicit $1,000 ranking-source economy
- Legacy TE premium seed: `× 1.18` on all TE values (extra PPR + first down scoring)
- 2027 kicker pick packages: one entry per team (kicker name maps to manager handle); all hardcoded to `budget=109, ceiling=131, floor=75`
- 2028 pick package: hardcoded to `budget=72, ceiling=86, floor=50`
- `ceiling = round(budget × 1.15)`, `floor = max(5, round(budget × 0.87))`
- PKG values live in a `PKG_VALUES` record keyed by player name (kicker name for 2027, `'2028 Pick Package'` for 2028)
- `UserRankingSet.sourceBudget` records the economy used by the persisted custom-ranking values;
  built-in and currently imported custom rankings use $1,000.

Draft-specific fallback values:

- `Draft.playerValueSourceBudget` captures the selected ranking source's economy at draft creation.
- `createDraft` builds the selected built-in or custom ranking-source pool, adds generated future
  assets in the same source economy, then adjusts the complete pool before inserting `Player` rows.
- Adjustment scales by `Draft.budget / Draft.playerValueSourceBudget` before applying league
  multipliers.
- A $1,000 source feeding a $1,000 draft is unchanged by budget scaling; $200 and $2,000 drafts use
  the same source values with `0.2` and `2` scales, respectively.
- `valueAdjustment.ts` computes position-level scoring multipliers, lineup/scarcity multipliers,
  and a concentration factor based on total starters (`teamCount × startingLineup.length`).
- Stored `Player.budget`/`ceiling`/`floor` are the adjusted fallback values for that draft.
- Stored `Player.baseBudget`/`baseCeiling`/`baseFloor` preserve the source-denominated ranking values
  and are not draft-budget-scaled.
- PICK/PKG rows receive draft-budget scaling but bypass scoring, scarcity, and concentration
  multipliers.

Projection-shaped active values:

- Projection source data lives in `ProjectionSource` and `PlayerProjection`.
- `createDraft` resolves ETR players to Sleeper IDs from
  `data/generated/etr_sleeper_matches.csv`, seeds adjusted fallback players, and applies
  projection values inside the same transaction.
- Draft creation fails loudly, with no partial draft persisted, if no usable projection source
  exists or no draft players can be joined to current projections.
- The CLI `pnpm tsx prisma/apply-projection-values.ts` imports generated CSV data into Postgres.
  Passing `--draft-id <draft-id>` additionally reapplies values to an existing draft.
- Projection application resolves Sleeper IDs, scores projections under both baseline and draft
  scoring settings, stores raw projection/VOR context, and stages `DraftPlayerValue` rows under a
  fresh `DraftProjectionValueSet`.
- `Draft.activeProjectionValueSetId` is the sole activation pointer. A staged set is validated and
  activated under the shared per-draft advisory lock; a failed or partial reapplication leaves the
  previous set fully active, including when reapplying the same `ProjectionSource`.
- `DraftPlayerValue.fallbackAuctionValue` is the draft-denominated `Player.budget` captured for that
  projection source; `projectionAuctionValue` is projection/VOR context, not the surfaced target.
- The canonical active-player loader queries only the explicitly active value set. The active
  auction target uses `DraftPlayerValue.activeAuctionValue` only for players with a row in that set.
- `activeAuctionValue` is anchored to `fallbackAuctionValue`; projections only shape the market
  value via relative scoring lift within position/value buckets. It is not raw VOR dollars, and
  `valueSource` records whether projection shaping or fallback supplied the value.
- Players without a current projection row, including free agents or missing projection matches,
  fall back to `Player.budget`.
- Projection VOR/projection auction values are stored for context and future roster-strength work,
  but the strategy lens is intentionally deferred to a follow-up PR.
- Activation metadata is retained indefinitely. Full player-value rows are retained for the active
  set plus the three newest archived sets; failed partial rows are removed immediately.

Existing-draft budget backfill:

- `pnpm db:backfill-budget-values` is a read-only dry run; add `-- --apply` to snapshot affected
  drafts, update their fallback values, and reapply the latest projections.
- `--draft-id <id>` limits the operation and `--snapshot-dir <dir>` overrides the default ignored
  `valuation-backfill-snapshots/` location.
- Apply writes the complete snapshot before the first mutation and processes each draft in its own
  fallback-update plus projection-reapplication transaction. It preserves the source-budget and
  `Player.base*` fields. Retain snapshots until the updated totals are verified.

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
- **Draft lifecycle and onboarding** — root routing selects the active draft; `/drafts` manages active/completed drafts; the validated `/drafts/new` form shares `draftInputSchema` with `createDraft`; a first-draft welcome and feature tour persist through `OnboardingProgress`.
- **Draft integrity** — player-facing records use non-null composite same-draft foreign keys; a player cannot be claimed, watched, nominated, or valued through another draft. Completed drafts render read-only controls.
- **PostgreSQL** — migrated from SQLite; Neon in prod, local WSL2 Postgres in dev; `@prisma/adapter-pg`
- **Multi-draft schema** — all operational data is draft-scoped; the default active-player loader overlays only the explicitly active projection value set.
- **League settings** — `Draft` stores `teamCount`, `rosterSize`, `budget`, `startingLineup Json?`, `scoringSettings Json?`, `targetRoster Json?`; form has Roster Settings, Starting Lineup builder, and Scoring sections; QB/SUPER_FLEX lineup validation (PR #20)
- **Custom rankings and Sleeper identity** — one profile-level `UserRankingSet` can seed a new draft; imported CSV rows are matched to `SleeperPlayer`, with a manual resolution UI. Runtime must query the identity table rather than depend on generated local files.
- **Projection application** — projection data stages in a new `DraftProjectionValueSet`, validates, and atomically activates through `Draft.activeProjectionValueSetId`; prior active values survive any failed reapplication.
- **Value sheet** — player filters/search/sort, bid logging, live-nomination state, catch-up-from-Sleeper flow, optimistic mutation recovery, and advisory Value Spreads that never alter auction targets.
- **Teams and budget** — manager dossier cards and a position-aware live threat board use shared revealed buying-tendency data rather than count-vs-target need framing.
- **Nomination helper** — ranks available players by rival demand, with persisted watchlist and live-nomination controls.
- **Brand** — gavel `LogoMark`/`LogoLockup`, static favicon, and responsive sign-in `ValueTicker`.

## Player Data

Source: ETR dynasty rankings CSV (~267 players), normalized ×5 to a $1,000 source economy; TE seeds receive the legacy premium. `src/data/players.ts` is server-only. At draft creation, source values are scaled to the selected draft budget and adjusted for scoring, scarcity, and concentration; `Player.base*` preserves source values while `Player.budget`/`ceiling`/`floor` are the fallback draft values. Projection shaping is staged and atomically activated separately, and players without an active projected row retain their fallback value. Custom ranking sets are an alternative source for new drafts.

`ScoringSettings` is a `type` alias (not `interface`) — Prisma's `InputJsonValue` requires implicit string index signature that only type aliases provide.

## What's Next

**Deploy Milestone** (Vercel + Neon) — done. `prisma migrate deploy` is wired into the Vercel build command. Generated `data/generated/*` files are local/CLI inputs only; deployed runtime code must use persisted `SleeperPlayer` identity data.

**Longer term** (see `ROADMAP.md`):

- #5b Value adjustment algorithm — Phase 1 is done (settings→fallback scaling plus scoring/scarcity/concentration). Phase 2 is a projection/VOR refinement.
- #5c Sleeper league import — auto-populate draft settings from a Sleeper league ID
- #6 UI redesign (Linear/Vercel aesthetic, shadcn/ui shortlisted) — after deploy milestone
- #7 Custom rankings upload CSV — done. Deferred: existing-draft replacement, multiple named sets, flexible column mapping, and kicker/PKG assignment UX.

## Global Rules

**Read before touching.** Before making any change in the repo, read the repo's `AGENTS.md`. It contains the stack, layout, conventions, and repo-specific constraints that take precedence over general intuition.

**Don't commit trivial superpowers docs.** Design specs and implementation plans generated during a superpowers workflow should only be committed when the work is non-trivial enough that future-you would want to understand why a design decision was made. For simple, self-evident work, clean up generated spec/plan files at the end of the workflow — don't commit them.

**Keep PRs clean.** Don't let extraneous files (scratch notes, generated docs, debug artifacts, unrelated changes) into PRs. This can be overridden if explicitly requested, but the default is a clean diff that contains only what the PR describes.

**PR creation workflow.** The GitHub connector may be able to read PRs but fail to create them with `403 Resource not accessible by integration`, and sandboxed `gh` may not be authenticated. After pushing the branch, try `gh auth status` and `gh pr create` with elevated/outside-sandbox permissions; this repo has worked with the local authenticated `gh` token in that mode. Use the intended base branch explicitly for stacked PRs, for example `gh pr create --draft --base worktree-value-adjustment-algorithm --head projection-aware-vor-engine`.

**No author attribution in commits.** Do not add `Co-Authored-By`, `Author:`, or any other authorship lines to commit messages.

**Don't be a sycophant!** The last thing I want in development is a yes man. If you agree with me on something that's fine, but please please think critically about my choices in development and if you have questions or concerns bring them up and challenge me if need be.

**Always pull main before branching or creating a worktree.** Before creating any new branch or worktree, run `git pull origin main` (or `git fetch && git merge origin/main`) in the main repo first. A branch created from a stale main silently excludes in-flight work and forces the implementer to either duplicate it or rebase later. One pull prevents both.
