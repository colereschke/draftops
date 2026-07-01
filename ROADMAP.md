# DraftOps Deployment Roadmap

Goal: make DraftOps shareable with the ETR dynasty Discord — let anyone sign in, create their own draft, and use the full tool to manage and optimize **their own** auction strategy.

**Product model: single-operator.** A draft is owned and run by one person. That person observes their real auction, logs winning bids for all teams, and uses the tool's intelligence (values, budget pressure, nomination scoring) to optimize their own picks. DraftOps does **not** run the live auction or coordinate multiple managers — there is one `ownerId` per draft and no multi-user membership. One consequence: each draft must record **which of its teams belongs to the owner**, so nomination scoring knows whose perspective to optimize (this replaces the hardcoded `'coreschke'` handle and becomes a draft-creation setting — see #4).

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

**Blocks:** #5b (wiring); #5c (Sleeper import); #8 (custom rankings)
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

## 5b. Configurable League Settings — Value Adjustment Algorithm

**Blocks:** #8 (custom rankings benefits from algorithm being in place)
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

## 6. UI Redesign

**Blocks:** nothing (visual layer only)
**Blocked by:** Deploy milestone (want real user feedback before committing to a direction)
**Parallelizable with:** #7

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
**Parallelizable with:** #5b (different surfaces — upload pipeline vs. algorithm)

The `Player` model and per-draft player table land in #5a. This item adds the ability for users to replace the default ETR seed with their own rankings CSV.

- CSV upload UI targeting ETR dynasty export format
- Parsing + scaling logic (currently `× 5` for $1,000 budget, ceiling/floor derivation)
- Validate uploaded CSV has expected columns; show parse errors clearly
- On upload, replace existing `Player` rows for the draft (re-run adjustment algorithm from #5b after import)
- Fallback: default ETR pool remains for new drafts; label it clearly as dynasty-Superflex-specific

---

## 8. Dynamic Pick Valuation

**Blocks:** nothing downstream yet
**Blocked by:** #7 (needs per-player values in DB to compute market-relative spend), #5b (needs roster targets and budget from draft settings)
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
- **Starting lineup value** (proxy: auction values): take the top-N players by `budget` from a team's roster (N ≈ 8–9 starting slots). High aggregate value → likely competing; low → rebuilding. Use `player.budget` from the DB (#7) as the proxy — it's projection-derived from FantasyCalc.
- Pick-heavy ratio (`numberOfPickPackagesWon / totalAssetsWon`) feeds in as a third sub-signal: pick-heavy + young + weak lineup → strong rebuilding signal; pick-heavy + strong lineup → ambiguous (aggressive competing team that still holds future assets).
- Combine all three into a simple posture score. Clear cases (young + pick-heavy + low lineup value, or old + player-heavy + high lineup value) get meaningful adjustment. Ambiguous middle cases get minimal or no adjustment.
- Only activate this signal once a team has ≥ 5–6 players (too few → noisy).
- Sleeper projections are not available (confirmed) — a projections source for further refinement is TBD (see #9). The age + auction-value proxy is V1 and likely good enough for dynasty use.

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
4. The model operates on team-level aggregate picks, not per-team-of-origin. A player-heavy competing team could still hold a high-value rival's picks — noted as a known limitation; revisit if it causes real confusion in use.

---

## 9. Sleeper Roster Sync

**Blocks:** nothing downstream yet
**Blocked by:** #7 (Player model in DB needs a `sleeperId` field); #3 (league ID needs to live on a Draft)
**Parallelizable with:** #6, #8a

The Sleeper API ([docs](https://docs.sleeper.com/)) is a public, unauthenticated REST API. Investigation confirmed:

- **Projections are not available** — Sleeper only exposes live in-game points, not preseason or dynasty projections. Signal 2 in #8b remains age + auction-value proxy for now; a projections source is deferred/TBD.
- **Roster assignments are available** — `GET https://api.sleeper.app/v1/league/{league_id}/rosters` returns each team's current roster as a list of Sleeper player IDs. This is the actionable use case.

### 9a. Sleeper Player IDs on the Player Model (prerequisite)

A stable cross-reference between DraftOps players and Sleeper requires a `sleeperId` field on the `Player` model. Add this as part of #7 (when `Player` moves to the DB) — optional, not required.

`GET https://api.sleeper.app/v1/players/nfl` returns all NFL players with their Sleeper IDs, names, positions, and teams. On player pool import (#7), DraftOps can offer to resolve names → Sleeper IDs via this endpoint (fuzzy match on name + position + team), with the user confirming ambiguous cases. Player name stays the display key; `sleeperId` becomes the cross-reference key for sync.

### 9b. Catch-Up Roster Sync Flow

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

**Projections (deferred):**
For #8b Signal 2 refinement, a projections source is still TBD. Sleeper is ruled out. Options to explore later: FantasyCalc API (if available), ESPN projections, or a manual projections CSV upload alongside the rankings upload in #7.

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
#5b Value adjustment algorithm ──┐  (parallel)
#5c Sleeper league import ────────┤  (parallel — touches only creation form)
#6  UI redesign ──────────────────┘  (visual only, no logic overlap)
        ↓
#7  Custom rankings upload  (replaces ETR seed; re-runs #5b algorithm after import)
#9  Sleeper roster sync  (catch-up flow; needs #7 for sleeperId on Player model)
        ↓
#8a Teams page: aggregate spend delta + avg age
        ↓
#8b Dynamic pick valuation  (needs #8a signals + #5b settings; enhanced by #9)
```
