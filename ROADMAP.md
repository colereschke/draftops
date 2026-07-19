# DraftOps Deployment Roadmap

Goal: make DraftOps shareable with the ETR dynasty Discord — let anyone sign in, create their own draft, and use the full tool to manage and optimize **their own** auction strategy.

**Product model: single-operator.** A draft is owned and run by one person. That person observes their real auction, logs winning bids for all teams, and uses the tool's intelligence (values, budget pressure, nomination scoring) to optimize their own picks. DraftOps does **not** run the live auction or coordinate multiple managers — there is one `ownerId` per draft and no multi-user membership. One consequence: each draft must record **which of its teams belongs to the owner**, so nomination scoring knows whose perspective to optimize (this replaces the hardcoded `'coreschke'` handle and becomes a draft-creation setting — see #4).

### Data Layer Principle

DraftOps should keep identity, projections, rankings, league settings, and draft state separate.

- Sleeper answers: who is this player?
- Rankings answer: what does the market think this player is worth?
- Projections answer: what is this player expected to produce?
- League settings answer: how much does that production matter here?
- Draft state answers: how valuable is this player right now, given the auction so far?

Avoid collapsing these into one static value too early. The app may display one active value to
the user, but internally it should preserve the components that produced that value.

## How to read this roadmap

Each item lists:

- **Blocked by** — what must merge before this can start. If "nothing," it can be built immediately.
- **Parallelizable with** — items that touch disjoint code and can be built concurrently in separate worktrees.

Items that are not blocked by anything upstream can be developed async on their own branches and merged in any order, subject to their stated blockers.

### Live-draft / data-safety strategy

The in-progress live draft must keep working locally no matter what happens to the Postgres migration. Two safety nets, set up **before #1 merges to `main`**:

1. **Pinned fallback branch.** Cut a branch (e.g. `sqlite-archive`) or tag from the current SQLite-era `main` and leave it untouched. If the migration goes south, `git checkout sqlite-archive` returns the codebase to a known-good SQLite state that runs the live draft locally. `main` itself moves forward to Postgres.
2. **Data file backup.** `prisma/dev.db` is **gitignored** — the fallback branch preserves the SQLite _code_, not the _data_. Copy `dev.db` to a safe location outside the repo before starting, so a corruption or accidental `make db-reset` can't lose the live auction.

The data migration is a real deliverable (see #1): a one-time script reads the SQLite `dev.db` and writes its rows into Neon 1:1 (the schema is still single-tenant at #1; the draft association comes later in #3.2). If that migration produces wrong/missing data, fall back to net #1 and re-run later. No need to wait for the live draft to finish before doing any of this.

---

## 1. PostgreSQL Migration

**Blocks:** all future schema work; deployment
**Blocked by:** nothing
**Parallelizable with:** #2 (auth touches no schema if it uses JWT sessions — see note there)

Swap the SQLite adapter for PostgreSQL. Pure infrastructure change — no application logic changes. Do this first so every subsequent migration is written once against Postgres.

- Update `prisma.config.ts` with Postgres connection (target: Neon)
- Swap `@prisma/adapter-better-sqlite3` → `@prisma/adapter-pg` (or native Postgres adapter)
- Update `datasource` provider in `schema.prisma`
- Run `prisma migrate dev` to regenerate against Postgres
- Update `make` targets and local dev docs
- **Before merging:** cut the `sqlite-archive` fallback branch and back up `prisma/dev.db` (see data-safety strategy above)
- **Data migration script:** read the existing SQLite `dev.db` and import its rows (teams, auction results, watchlist, nominated) 1:1 into Neon. The schema is still single-tenant at this point, so it's a straight copy — the `draftId` association happens later in #3.2's backfill, same as any other pre-existing data. Keep the fallback branch until verified.
  - **SQLite→Postgres gotchas** (don't just check row counts):
    - **Reset autoincrement sequences** after bulk insert. Copying explicit `id` values doesn't advance Postgres's sequence, so the next insert collides on the PK. Run `setval` on each table's `_id_seq` to `MAX(id)`.
    - **Type strictness.** SQLite is loosely typed and may hold values Postgres rejects (e.g. a string in an int column, non-boolean in a bool). Validate/coerce per column during import.
    - **Verify content, not just counts** — spot-check a few teams' spend totals and the latest auction results against the live app before trusting it.

---

## 2. Auth & User Management

**Blocks:** multi-draft (drafts need owners)
**Blocked by:** nothing functionally
**Parallelizable with:** #1, **if** Auth.js uses the JWT session strategy (no DB adapter). If you choose the Auth.js database adapter (sessions/users persisted in Postgres), this becomes blocked by #1.

Use **Auth.js (NextAuth) with the Discord provider**. ETR Discord members already have Discord accounts — zero-friction sign-in for the target audience. Auth.js is free and self-hosted (no per-MAU billing or vendor lock-in). Chosen over Clerk for cost and control; the tradeoff is we manage session config ourselves, which is minor for this scope.

- Install and configure Auth.js for Next.js App Router
- Register a Discord OAuth app and wire the provider
- Choose session strategy: JWT (no DB, keeps this parallel to #1) vs. database adapter (needs Postgres). Default to JWT unless we need server-side session revocation.
- Protect mutation routes (bid logging, watchlist, nominations) behind auth
- Expose the authenticated `userId` for ownership checks in #3

---

## 3. Multi-Draft Schema + Route Scoping

**Blocks:** draft UI; configurability; custom rankings; deployment
**Blocked by:** #2 (drafts need an `ownerId`)
**Parallelizable with:** nothing (it's the spine everything downstream hangs off)

This is the highest-risk work, but it does **not** have to be one giant atomic PR. Use an **expand/contract** migration so the app stays working between each step and every PR is independently reviewable:

**PR 3.1 — Expand (additive, app unaffected):**

- Add `Draft` model: `id`, `name`, `ownerId` (Auth.js userId), `ownerTeamId` (the owner's own team within the draft — nullable for now), `createdAt`
- Add **nullable** `draftId` FK to `Team`, `AuctionResult`, `PlayerWatchlist`, `NominatedPlayer`
- Ship with no behavior change — existing queries ignore the new columns

**PR 3.2 — Backfill:**

- Migration/script creates a single default draft and stamps all existing rows with its `draftId`
- Set the default draft's `ownerTeamId` to the existing "my team" handle

**PR 3.3 — Wire reads/writes:**

- Every API route, server action, and server component reads and passes `draftId`
- Nomination scoring reads `draft.ownerTeamId` instead of the hardcoded `'coreschke'`
- Seed script updated to create a default draft for local dev

**PR 3.4 — Contract (lock it down):**

- Make `draftId` non-nullable
- Swap unique constraints to composite: `(handle, draftId)` on Team, `(playerName, draftId)` on PlayerWatchlist and NominatedPlayer

Each PR merges to `main` on its own; the app is functional after every one.

---

## 4. Draft Creation & Management UI

**Blocks:** deployment (app isn't usable for others without this)
**Blocked by:** #2, #3
**Parallelizable with:** #5a (both depend only on #3's schema; they touch different surfaces — UI vs. settings model)

- Create-draft flow (name, **which team is yours** → sets `ownerTeamId`, placeholder for settings)
- Draft list per authenticated user
- URL structure: `/draft/[draftId]/` prefix for all existing pages, or draft context in session
- Optional share link (read-only view of a draft, since the model is single-operator — no collaborative editing)

After this PR, anyone can sign in, create a draft, and use the full existing feature set in their own isolated space.

---

## Deploy Milestone

**Enabled by:** #1–4
Vercel + Neon PostgreSQL. At this point the app is shareable with ETR Discord for real feedback. Add before/at deploy:

- **Error monitoring** (Sentry or Vercel's built-in) — so we actually see when testers hit errors instead of them silently bouncing
- **Feedback link** in the UI (GitHub issue template or a simple form) — the whole point of deploying is collecting feedback; make it one click

---

## 5a. Configurable League Settings — Model + Player Table

**Blocks:** #5b (wiring); #5c (Sleeper import); #5d (projection ETL); #7 (custom rankings); #8 (dynamic pick valuation)
**Blocked by:** #3 (settings live on a `Draft`)
**Parallelizable with:** #4

Spec: `docs/superpowers/specs/2026-06-30-league-settings-design.md`

Expands significantly from the original roadmap item — collapses #7 (custom rankings player table) into this milestone since the architecture is the same. Three-PR arc:

**PR A — Schema:** Add settings fields to `Draft` model + new `Player` model (per-draft):

- `teamCount`, `rosterSize`, `budget`, `startingLineup` (JSON — starting slot array), `scoringSettings` (JSON), `targetRoster` (JSON)
- `Player` model scoped to `draftId` — mirrors existing `Player` TS interface fields

**PR B — Form + Seeding:** Full draft creation form UI with Roster Settings, Starting Lineup builder, and Scoring sections. `createDraft` action seeds `Player` table from base ETR values (1:1, no adjustment). Backfill migration for existing drafts.

**PR C — Page Wiring:** `AuctionSheet` and `NominationHelper` accept `players: Player[]` as a prop instead of importing the static file. Server components query `prisma.player.findMany({ where: { draftId } })`. `computeTeamStats` takes `players` as a parameter. `players.ts` eliminated from all client imports.

> **Algorithm deferred to #5b.** Player values are seeded 1:1 from ETR baseline. The adjustment algorithm (tuning values based on lineup/scoring delta from baseline) ships in #5b so it can iterate independently.

---

## 5b. Configurable League Settings — Fallback Value Adjustment Algorithm

**Blocks:** #5e (projection-aware values share league-settings utilities); #7 and #8 benefit from
the fallback model being in place
**Blocked by:** #5a
**Parallelizable with:** nothing (depends directly on 5a's Player table)

The riskiest and most iterative piece — isolated deliberately. Starting from the base ETR values seeded in #5a, compute adjusted `budget`/`ceiling`/`floor` per player based on the draft's settings delta from baseline:

- Base reference: standard full-PPR Superflex, 10-slot vanilla lineup (QB/RB/RB/WR/WR/TE/FLEX/FLEX/FLEX/SUPER_FLEX)
- Lineup delta: extra starting slots for a position → scarcity increases → values go up proportionally
- Scoring delta: higher PPR tier for a position → values go up; rushing bonuses → mobile QBs / RBs benefit
- Algorithm runs once at draft creation (after player seeding) and stores results in the `Player` table

Replace all hardcoded league assumptions with values pulled from the draft's settings:

- `LEAGUE_TEAMS` → teams fetched from DB, scoped to draft
- `ROSTER_SIZE` → `draft.rosterSize`
- `TARGET_ROSTER` → `draft.targetRoster`
- Kicker/PKG rules → remove Cole-specific team-to-manager mappings; make PKG association configurable or document as a manual entry

This milestone intentionally builds the non-projection fallback valuation model. DraftOps remains
usable when no projection source is available. Current implementation status: the fallback model
runs automatically during `createDraft`, storing adjusted `Player.budget`/`ceiling`/`floor` and
preserving base values in `baseBudget`/`baseCeiling`/`baseFloor`. Projection-shaped active values
are handled separately in #5e and fall back to these `Player` values when no current projection row
exists.

---

## 5c. Sleeper League Import

**Blocks:** nothing (UX enhancement on top of #5a)
**Blocked by:** #5a (settings model must exist to import into)
**Parallelizable with:** #5b (touches only draft creation flow, not the algorithm)

Allow users to populate the draft creation form automatically by entering a Sleeper league ID. Two public unauthenticated API calls:

- `GET https://api.sleeper.app/v1/league/<league_id>` → `total_rosters`, `roster_positions`, `scoring_settings`
- `GET https://api.sleeper.app/v1/league/<league_id>/users` → team display names and user handles

**Import flow:**

1. User enters Sleeper league ID on the draft creation page (above the manual form)
2. Server action fetches both endpoints, maps response to DraftOps settings
3. Form pre-fills: teamCount, startingLineup (filter BN/IR from `roster_positions`), scoringSettings (mapper: `pprTE = rec + bonus_rec_te`, `teFDBonus = bonus_fd_te ?? 0`, etc.), team handles + display names
4. User reviews pre-filled form and can edit before submitting — import is a suggestion, not a lock

**Key Sleeper → DraftOps field mappings** (verified against league `1360707683916734464`):

- `total_rosters` → `teamCount`
- `roster_positions` filtered to exclude `BN`, `IR`, `K` → `startingLineup`
- `scoring_settings.rec + bonus_rec_rb` → `pprRB`; `+ bonus_rec_wr` → `pprWR`; `+ bonus_rec_te` → `pprTE`
- `scoring_settings.rec_fd` → `recFD`; `bonus_fd_rb` → `rbFDBonus`; `bonus_fd_wr` → `wrFDBonus`; `bonus_fd_te` → `teFDBonus`
- `scoring_settings.pass_yd` (pts/yd) → `passYdsPerPoint` (yds/pt = 1 / pass_yd)
- `scoring_settings.pass_td` → `passTD`; `pass_int` → `passInt`
- `scoring_settings.rush_att` → `rushAtt`; `rush_fd` → `rushFD`

---

## 5d. Projection ETL + Sleeper Identity Mapping

**Blocks:** #5e Projection-Aware VOR Engine; improves #7 Custom Rankings Upload; improves #9
Sleeper Roster Sync
**Blocked by:** #5a (per-draft Player model exists there)
**Parallelizable with:** #6 UI Redesign

Build a reusable projection ETL pipeline that normalizes external player projections and links
them to Sleeper player IDs. The first source is Mike Clay's 2026 NFL Projection Guide PDF, matched
against Sleeper `/players/nfl` JSON. The point is not just to import one PDF; it is to establish a
projection data layer that future sources can plug into.

**Status:** initial ETL complete. `master_projections.csv` is generated and ready to use. Next step
is deciding whether projection data is imported into the `Player` model directly, stored in a
separate projection table, or used as a generated seed file for the upcoming VOR engine.

**Initial inputs:**

- Mike Clay 2026 NFL Projection Guide PDF
- Sleeper `/players/nfl` JSON

**Generated outputs:**

```text
data/generated/master_projections.csv
data/generated/projection_match_report.csv
data/generated/unmatched_players.csv
```

**Deliverables:**

- Local script or command to generate projection CSVs reproducibly
- Raw input folder for source files
- Generated output folder for normalized CSVs
- Sleeper player normalization
- Mike Clay projection extraction
- Projection-to-Sleeper matching
- Match confidence reporting
- Unmatched player reporting
- Validation summary with counts by position, match rate, duplicate checks, and parsing warnings

**Design rules:**

- Sleeper is the canonical player identity source.
- Do not manually edit generated projection CSVs.
- If a match is uncertain, surface it in `unmatched_players.csv` instead of silently forcing it.
- Keep the parser source-specific, but keep the normalized output schema source-agnostic.
- Include `projection_source`, `projection_date`, and `season` in generated data.

### Projection Storage Model Decision

Decision: use the long-term separated data model now.

- `Player` keeps only `sleeperId` from the projection work. This is identity data shared by
  projection import, custom ranking import, and Sleeper roster sync.
- `ProjectionSource` stores source metadata such as source name, season, and projection date.
- `PlayerProjection` stores normalized source projection stats keyed by Sleeper ID and projection
  source.
- `DraftPlayerValue` stores draft-specific projected points, replacement points, VOR, projection
  auction value, fallback/active values, and value source.

Do not attach raw projection stats or projection-derived values directly to `Player`. League-scored
`projectedPoints` belongs in `DraftPlayerValue`, not `PlayerProjection`, because scoring settings
vary by draft.

---

## 5e. Projection-Aware VOR Engine

**Blocks:** #8 Dynamic Pick Valuation; improves #5b Fallback Value Adjustment Algorithm; improves
#7 Custom Rankings Upload
**Blocked by:** #5b and #5d
**Parallelizable with:** #6 UI Redesign, depending on implementation surface

Use normalized projections to calculate league-specific fantasy points, replacement levels, VOR,
and projection-based auction values.

DraftOps should remain fully usable without projections. When projections exist, they provide a
sharper valuation layer that coexists with the fallback value adjustment model.

**Inputs:**

- Draft league settings
- Team count
- Roster size
- Starting lineup
- Flex and Superflex slots
- Scoring settings
- Budget
- Normalized player projections
- Sleeper player IDs

**Outputs:**

- League-specific projected fantasy points
- Replacement level by position
- Value over replacement
- Projection-based auction value
- Optional tier breaks
- Optional position scarcity indicators

**Initial algorithm:**

1. Calculate fantasy points from raw projected stats using the draft's scoring settings.
2. Determine replacement level by position using league size, starting lineup, flex slots,
   Superflex slots, and target roster construction.
3. Calculate VOR:

```text
vor = projected_points - replacement_points_for_position
```

4. Clamp negative VOR to zero for auction value allocation.
5. Allocate auction dollars across positive VOR players after reserving minimum-bid roster dollars.
6. Store projection-aware values separately from fallback values.

**Recommended fields:**

```text
projected_points
replacement_points
vor
projection_auction_value
fallback_auction_value
active_auction_value
value_source
```

**Design principle:**

- The fallback model answers: "What should this player be worth based on baseline market/ranking
  value and league settings?"
- The projection-aware model answers: "What should this player be worth based on projected
  production above replacement in this exact league?"

Do not blend raw projection auction dollars directly into dynasty values. The raw VOR dollar curve
is useful as one-year roster-strength context, but it has a different shape from dynasty auction
markets and should not drive the draft board by subtraction/blending.

**Current implementation status:** projection storage and projection-shaped market values are in
PR #35 on branch `projection-aware-values`.

Implemented:

- Adds the long-term projection storage model: `ProjectionSource`, `PlayerProjection`, and
  `DraftPlayerValue`.
- Adds `Player.sleeperId` as the shared identity link.
- Adds ETR dynasty ranking → Sleeper ID matching for
  `existing_project_docs/auction-tool/src/Dynasty_Rankings.csv`.
- Adds league-specific projection scoring from normalized Mike Clay rows.
- Adds replacement level, VOR, and projection auction value allocation as stored context.
- Adds projection-shaped active market values: the active auction target remains anchored to the
  draft's adjusted dynasty `Player.budget`, then projections adjust it by relative scoring lift
  within position/value buckets.
- Adds `prisma/apply-projection-values.ts` to import generated projection CSVs into Postgres.
  Passing `--draft-id <id>` additionally reapplies values to an existing draft.
- Adds automatic projection application during `createDraft`; ETR player rows get Sleeper IDs from
  the generated match CSV, and draft creation fails loudly without persisting a partial draft if no
  usable `ProjectionSource` exists.
- Removes the old VOR-driven strategy lens from this PR; rebuild/balanced/contender handling is
  deferred to a dedicated follow-up.
- Ignores stale projection rows from older projection sources. Players without a current projection
  row fall back to the draft-specific `Player.budget`.

Current process:

1. Generate or confirm `data/generated/etr_sleeper_matches.csv` and
   `data/generated/master_projections.csv` exist locally.
2. Import projection source data into Postgres:

```bash
pnpm tsx prisma/apply-projection-values.ts
```

3. Create drafts normally. `createDraft` automatically resolves ETR Sleeper IDs, seeds adjusted
   fallback dynasty values, and applies the latest stored projection source in the same transaction
   before redirecting.
4. Spot-check value outputs:
   - high-end QBs and elite TEs
   - target-heavy TEs vs. efficiency/TD-driven TEs
   - rookies with weak or strong year-one projections
   - free agents and unmatched players, which should fall back cleanly
   - replacement levels by QB/RB/WR/TE for future roster-strength work

Next steps:

1. Add an admin UI or setup wrapper around the projection import command.
2. Feed projection-aware lineup strength into #8 dynamic pick valuation, keeping dynasty market
   strength and redraft projection strength as separate signals.
3. Rebuild the strategy lens in a follow-up PR using a shape-preserving signal, not raw VOR-dollar
   deltas.

Rookie policy for #5e: low rookie projections should not reduce active fallback/dynasty value, but
strong rookie projections can raise active value when projection values are explicitly activated.

---

## 6. UI Redesign

**Blocks:** nothing (visual layer only)
**Blocked by:** Deploy milestone (want real user feedback before committing to a direction)
**Parallelizable with:** #5d, #5e, #7 where it does not touch valuation logic

Target aesthetic: Linear / Vercel — modern, dark, intentional. The current design has solid bones (design token system in `globals.css`, position accent colors, JetBrains Mono for numbers) but needs a more polished, progressive feel overall.

**Component library:** Strongly consider **shadcn/ui** over MUI. shadcn/ui is Tailwind-based (no paradigm shift), uses CSS variables for theming (compatible with the existing `globals.css` token approach), is built on Radix UI primitives (accessibility handled), and components live in the repo so there's no library aesthetic to fight. MUI was evaluated and rejected — Material Design defaults conflict with the target aesthetic and would require constant fighting to override.

Key areas:

- Typography and spacing refinement
- Component-level polish (tables, modals, badges, nav)
- Consider adopting shadcn/ui primitives for interactive elements (dialogs, dropdowns, command palette)
- Maintain the existing design token layer — extend/refine rather than replace

---

## 7. Custom Rankings Upload

**Blocks:** nothing (final major feature)
**Blocked by:** #5a (`Player` model already ships there — this adds upload on top)
**Parallelizable with:** #5b and #5e where the upload pipeline does not touch valuation internals

The `Player` model and per-draft player table land in #5a. This item adds the ability for users to replace the default ETR seed with their own rankings CSV.

Custom rankings are a market/value input, not the same thing as projections. After #5d and #5e,
DraftOps may have both ranking-based values and projection-based values available for the same
player. The upload flow should preserve that distinction instead of overwriting projection data.

- CSV upload UI targeting ETR dynasty export format
- Parsing + scaling logic (currently `× 5` for $1,000 budget, ceiling/floor derivation)
- Validate uploaded CSV has expected columns; show parse errors clearly
- On upload, replace existing `Player` rows for the draft (re-run adjustment algorithm from #5b after import)
- Fallback: default ETR pool remains for new drafts; label it clearly as dynasty-Superflex-specific
- Preserve `sleeperId` where possible when importing custom rankings
- Re-run fallback value adjustment from #5b after upload
- Optionally re-run projection-aware VOR from #5e if the uploaded file also includes projection stats
- Track value source metadata so the UI can distinguish ETR baseline, custom rankings, Mike Clay
  projections, and future projection sources

**Suggested future fields:**

```text
valueSource
rankingSource
projectionSource
lastValueUpdateAt
```

---

## Engineering Hardening Backlog

**Not a product feature.** Track repo-quality work that should happen opportunistically after the active UI/schema arcs settle, or as cleanup work before a broad public deploy.

- Move client server-state polling/mutations to SWR where it reduces manual fetch/effect logic, starting with `NominationHelper`'s nomination-data polling and optimistic watchlist/nominated mutations.
- Standardize component exports toward named exports instead of default exports for easier refactoring and clearer imports.
- Reduce barrel-style `index.ts` component re-exports where they obscure dependency edges or hurt tree-shaking; prefer direct imports for larger client components.
- Add focused accessibility regression tests for interactive data tables and icon-only controls whenever a page is re-skinned.
- Revisit long-list rendering costs on the main auction and nomination tables after real draft data sizes are in Postgres-backed flows.

---

## 8. Dynamic Pick Valuation

**Blocks:** nothing downstream yet
**Blocked by:** #7, #5b, and optionally enhanced by #5e projection-aware VOR
**Parallelizable with:** #6 (UI-only)

Pick package values in the current tool are static (hardcoded `PKG_VALUES` in `players.ts`). This item makes them dynamic — each team's 2027 pick package value adjusts based on observable signals about that team's draft, replacing or overriding the static baseline at query time.

### 8a. Teams Page: Aggregate Stats (prerequisite, standalone)

Two additions to the teams page that surface data already available:

**Aggregate spend delta:**
The teams page already renders per-player `delta = result.price - player.budget`. Add one aggregate column per team:

- `totalDelta = SUM(result.price) - SUM(player.budget)` across all won players
- Positive → team has overpaid vs. market; negative → underpaid
- Display inline with the existing spend/remaining/buying-power columns
- Requires player pool in DB (#7) since `player.budget` lives there

**Average roster age:**

- `avgAge = AVG(player.age)` across all won players
- Age is already in the player data (the existing age-color design system uses it)
- Young average age signals a rebuilding/tanking posture; older signals competing-now
- Display as a single column; use the existing age-color tokens for visual reinforcement
- Usable as a prerequisite signal for #8b's posture classifier

Both can ship in one PR as soon as #7 is done.

### 8b. Dynamic Pick Value Model

The goal is to replace the static pick package valuations with a per-team score that updates as bids are logged. Three signals:

**Signal 1 — Market-relative overspend (from 8a)**

- Teams that are consistently overpaying vs. FantasyCalc values are burning budget inefficiently → their picks arrive in a weaker financial context
- Teams underpaying signal discipline and surplus → picks likely more attractive
- Adjustment: scale the static pick baseline up or down by some factor of `totalDelta / totalTargetSpend`; needs a sensitivity cap to avoid wild swings early in the draft when few bids are logged

**Signal 2 — Competitive posture (age + lineup value)**
The real goal here is classifying whether a team is **competing in Year 1** or **tanking/rebuilding**. Two sub-signals combine for this:

- **Average roster age** (from 8a): young average age → rebuilding; older → competing now. Age is already in the player data — no external source needed.
- **Starting lineup value** (proxy: auction values): take the top-N players by `budget` from a team's roster (N ≈ 8–9 starting slots). High aggregate value → likely competing; low → rebuilding. Use `player.budget` from the DB (#7) as the initial market-derived proxy.
- Once #5e exists, starting lineup value should prefer projection-aware VOR or projection auction
  value over static ranking value when available. This gives the posture classifier a better signal
  for redraft competitiveness while still allowing dynasty market values to inform longer-term pick
  value.
- Pick-heavy ratio (`numberOfPickPackagesWon / totalAssetsWon`) feeds in as a third sub-signal: pick-heavy + young + weak lineup → strong rebuilding signal; pick-heavy + strong lineup → ambiguous (aggressive competing team that still holds future assets).
- Combine all three into a simple posture score. Clear cases (young + pick-heavy + low lineup value, or old + player-heavy + high lineup value) get meaningful adjustment. Ambiguous middle cases get minimal or no adjustment.
- Only activate this signal once a team has ≥ 5–6 players (too few → noisy).
- Projection-aware team strength and dynasty market strength are not identical. A team can be strong
  in projected 2026 points but weak in dynasty value, or vice versa. The model should keep these
  signals separate before combining them into a pick-value adjustment.

**Combining signals:**
A composite adjustment multiplier is applied to the static PKG baseline:

```
adjustedValue = staticBaseline × (1 + overspendAdjustment + lineupQualityAdjustment + strategyAdjustment)
```

Weights and caps need tuning; start conservative (±15% max total adjustment) so the model is informative rather than destabilizing the nomination scoring that consumes pick values.

**Design decisions:**

1. Signal activation is non-uniform — gate each signal on a combination of **% of draft budget spent** AND **number of players won** for that team. These thresholds will need empirical tuning; revisit after the first real draft that uses dynamic valuation.
2. Adjusted values are surfaced in the UI with a directional indicator (↑/↓ arrow) next to the pick's displayed value, so users know the static baseline has been modified and in which direction. The raw adjusted value (not just the direction) should be visible somewhere — tooltip or inline.
3. Pick packages affect nomination scores directly — validate that the adjustment doesn't cause picks to dominate or disappear from nomination suggestions in edge cases before shipping.
4. The model operates from the pick origin team's roster quality, not just the current holder of the
   pick asset. This keeps "what are this team's future picks worth?" separate from "who currently
   owns them?"

**Long-term asset model option:**
If DraftOps grows beyond live draft management into trade tracking or post-draft roster operations,
future picks may need to move out of the `Player`-row auction model and become first-class assets
with origin team, current owner, component picks, package grouping, and transfer history. That
system would better support trades, package splitting, and ownership edits, but it is intentionally
out of scope for the initial dynamic valuation work.

**Rookie-draft timing and asset identity:**
Rookie drafts usually run in May or June, but winter and early-spring drafts can happen before the
NFL Draft. Those leagues may draft rookies directly while they are still teamless, or draft slot
assets such as `1.01`, `2.02`, and `3.03` instead of named players. A future rookie-draft feature
must therefore make the rookie season explicit rather than inferring it only from the calendar or a
draft creation timestamp, support players without an NFL team, and distinguish named rookies from
draft-slot assets that later resolve to players.

---

## 9. Sleeper Roster Sync

**Blocks:** nothing downstream yet
**Blocked by:** #5d or #7 for `sleeperId` availability; #3 because league ID needs to live on a Draft
**Parallelizable with:** #6, #8a

The Sleeper API ([docs](https://docs.sleeper.com/)) is a public, unauthenticated REST API. Investigation confirmed:

- **Projections are not available from Sleeper** — Sleeper only exposes live in-game points, not
  preseason or dynasty projections. Projection data comes from #5d's external-source ETL instead.
- **Roster assignments are available** — `GET https://api.sleeper.app/v1/league/{league_id}/rosters` returns each team's current roster as a list of Sleeper player IDs. This is the actionable use case.

The projection ETL in #5d creates the first reusable Sleeper ID mapping layer. #9 should reuse that
matching logic rather than creating a separate player-resolution system. Any manual aliases or
fuzzy-match fixes discovered during projection import should be shared with roster sync and custom
ranking import.

### 9a. Sleeper Player IDs on the Player Model (prerequisite)

A stable cross-reference between DraftOps players and Sleeper requires a `sleeperId` field or
equivalent mapping table. This can come from #5d's projection matching layer or #7's rankings import
flow.

`GET https://api.sleeper.app/v1/players/nfl` returns all NFL players with their Sleeper IDs, names, positions, and teams. On player pool import (#7), DraftOps can offer to resolve names → Sleeper IDs via this endpoint (fuzzy match on name + position + team), with the user confirming ambiguous cases. Player name stays the display key; `sleeperId` becomes the cross-reference key for sync.

### 9b. Catch-Up Roster Sync Flow

**Status:** shipped. `Draft.sleeperLeagueId` + `Team.sleeperRosterId` persist the league/roster mapping (set at import or via a one-time manual mapping dialog); `src/lib/sleeperRosterSync.ts` reconciles current Sleeper rosters against logged `AuctionResult`s; `src/lib/sleeper-roster-actions.ts` + `SleeperRosterSyncDialog` (opened from the value sheet) drive configuration, preview, and the transactional batch write. See CLAUDE.md's What's Built for the full contract. The native-auction/polling idea below remains future work, out of scope for this flow.

The primary use case: a user steps away from DraftOps during the auction and several players are won without being logged. They come back and want to catch up without manually re-entering everything.

**Flow:**

1. User provides their Sleeper league ID in draft settings (stored on `Draft`)
2. On demand (not automatic), user triggers "Sync with Sleeper"
3. DraftOps calls the rosters endpoint, maps returned Sleeper player IDs to its own players via `sleeperId`, identifies which are assigned to a Sleeper team but have no `AuctionResult` in the DB
4. For each gap, DraftOps already knows **which team** won the player (from Sleeper) — it only needs the **price**
5. Show a catch-up UI: list of unlogged players with their assigned team pre-filled and a price input per row; submit logs all in one batch

**Constraints:**

- Only viable if the league runs its auction through Sleeper (or at minimum adds players to rosters in Sleeper after each win)
- Sleeper does not expose winning auction prices — price input is always manual
- Sync is additive only — if DraftOps has a bid logged that Sleeper doesn't show on a roster yet, don't remove the DraftOps entry
- Design as optional: DraftOps works fully without a Sleeper league ID configured

**Sleeper native auction drafts:**
Sleeper has a built-in auction draft tool. If a league uses it, rosters update in real-time as players are won — making the sync flow effectively live rather than a catch-up. This would be a significantly better experience and is worth exploring once Sleeper's native auction product matures. The same sync architecture applies; the difference is just how frequently the user triggers it (or whether it can be polled automatically during the draft).

**Projection reuse:**
Sleeper remains ruled out as a projections source, but #5d supplies external projections linked to
Sleeper IDs. #9 should consume the shared identity layer and should not duplicate projection import
or player matching logic.

---

## 10. Budget-for-Picks Trading

**Blocks:** nothing downstream yet
**Blocked by:** #3 (per-draft teams), #5a (`Player`/pick rows live on a draft); tightly coupled to #8
(dynamic pick valuation) and #8's deferred first-class-asset model
**Parallelizable with:** #6 (UI-only), #9 (roster sync)

Some leagues let teams trade a slice of their remaining auction **budget** for another team's
**future draft picks** mid-auction (in either direction). DraftOps needs to record these transfers
so budget, buying power, threat ranking, and pick valuation all stay correct afterward. Consistent
with the single-operator model, the owner logs trades for all teams the same way they log bids — no
multi-user negotiation flow.

**Example:** Team A sends $80 of remaining budget to Team B for B's 2028 1st. DraftOps decrements
A's effective budget by $80, increments B's by $80, and moves that pick's value/ownership from B to
A.

### What breaks the current model (and must change)

1. **Fixed-budget invariant.** Today every team shares one `draft.budget`, and
   `remaining = budget - spent`, `buyingPower = remaining - (rosterSize - rosterCount)` assume it.
   Budget transfers require a per-team **net budget delta** (sum of dollars traded in/out) threaded
   through both `computeTeamStats` implementations (`src/lib/budget.ts`, `src/lib/computeTeamStats.ts`),
   `src/lib/threat.ts` (`maxBid`), and the `/budget` threat board. New effective form:
   `remaining = budget + budgetDelta - spent`.
2. **Trades aren't "wins."** A transfer is not an `AuctionResult`, so it doesn't fit the
   `Player` + `AuctionResult` shape. Two paths:
   - **(a) Adjustment layer** — a lightweight `BudgetTransfer`/`PickTransfer` ledger keyed to
     `draftId` + `teamId`, applied on top of the existing model at query time. Smaller change; keeps
     picks as `Player` rows.
   - **(b) First-class assets** — promote future picks to real assets with origin team, current
     owner, and transfer history. This is the "Long-term asset model option" #8 explicitly deferred;
     this item is the first concrete forcing function for it.
3. **The 2028 package isn't in the auction pool.** The startup pool excludes 2028 picks, so there is
   no biddable `Player` row to transfer. Trading it means representing pick assets that exist
   **outside** the auction entirely — which pushes toward path (b), or at minimum a way to
   materialize a tradeable non-auction pick asset.

### Coupling to #8

This feature is what actually makes **current holder ≠ origin team**. #8b already anticipated it
("the model operates from the pick origin team's roster quality, not just the current holder"). So:

- Pick **value** (from #8/#8b) stays anchored to the **origin** team's posture/roster quality.
- Pick **ownership/buying-power impact** follows the **current holder** after a trade.
- Keep those two separate — a traded pick's value shouldn't recompute off the acquiring team's roster.

### Open design decisions (resolve in brainstorming/spec)

- Adjustment ledger (2a) vs. first-class assets (2b) — the 2028-package gap and #8 coupling both
  argue for (b), but (a) may be enough for a first pass if 2028 picks are handled as a special case.
- How pick-for-pick and multi-asset trades are entered (a trade builder vs. one transfer per row).
- Whether traded budget is capped/validated against a team's current `remaining` at trade time, and
  how to handle editing/reversing a logged trade.
- UI surface: likely a trade-entry modal plus a per-team ledger; budget deltas surfaced on `/teams`
  and `/budget` so the numbers are explainable, not silently shifted.

---

## Dependency Summary

```
#1 Postgres migration ──┐  (parallel)
#2 Auth (Auth.js + Discord) ──┘
        ↓
#3 Multi-draft schema + routing   ← expand/contract, 4 incremental PRs
        ↓
#4 Draft creation UI ──┐  (parallel)
#5a Settings model + Player table ──┘   ← collapses original #7 (Player model)
        ↓
[DEPLOY]  (needs #1–4; #5a optional before deploy)
        ↓
#5b Fallback value adjustment algorithm
        ↓
#5c Sleeper league import
        ↓
#5d Projection ETL + Sleeper identity mapping
        ↓
#5e Projection-aware VOR engine
        ↓
#7  Custom rankings upload
#9  Sleeper roster sync
        ↓
#8a Teams page: aggregate spend delta + avg age
        ↓
#8b Dynamic pick valuation
        ↓
#10 Budget-for-picks trading   ← coupled to #8; likely forces first-class pick assets

#6 UI redesign runs in parallel where it does not touch valuation logic.
```
