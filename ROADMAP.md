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

## 5a. Configurable League Settings — Model

**Blocks:** wiring settings through logic; custom rankings
**Blocked by:** #3 (settings live on a `Draft`)
**Parallelizable with:** #4

Add settings fields to the `Draft` model:

- `teamCount` (default 12)
- `rosterSize` (default 30)
- `budget` (default 1000)
- `targetRoster` (JSON — per-position targets, default `{QB:4, RB:9, WR:11, TE:3}`)
- `teMultiplier` (TE premium, default 1.18)

Wire into the draft creation form so users configure their league on setup.

> **Scope note:** scoring format is fixed to **Superflex** for now. Player values derive entirely from FantasyCalc's 2QB column, so a 1QB option would require a different source column, not just a different multiplier — it's deferred (tracked in the README's future-features list), not in this milestone.

---

## 5b. Configurable League Settings — Wire Through Logic

**Blocks:** custom rankings
**Blocked by:** #5a
**Parallelizable with:** nothing (depends directly on 5a's fields)

Replace all hardcoded league assumptions with values pulled from the draft's settings:

- `LEAGUE_TEAMS` → teams fetched from DB, scoped to draft
- `ROSTER_SIZE` → `draft.rosterSize`
- `TARGET_ROSTER` → `draft.targetRoster`
- Kicker/PKG rules → remove Cole-specific team-to-manager mappings; make PKG association configurable or document as a manual entry

---

## 6. Custom Rankings Upload

**Blocks:** nothing (final major feature)
**Blocked by:** #3 (players need `draftId`), #5a (need scoring config to validate/scale values)
**Parallelizable with:** #5b (different surfaces — upload pipeline vs. settings wiring — but both touch valuation; coordinate if they collide)

Currently the player pool is a static hardcoded file (`src/data/players.ts`). This moves it to the DB, scoped per draft.

- Add `Player` model to schema, scoped to `draftId`
- CSV upload UI targeting FantasyCalc export format (Superflex `$200` budget column)
- Parsing + scaling logic (currently `× 5` for $1000 budget, TE premium, ceiling/floor)
- Validate the uploaded CSV has the expected Superflex columns
- Fallback/seed: keep the current dynasty-Superflex player data as a default pool for new drafts. **Label it clearly** as dynasty-Superflex-specific so users in other formats know to replace it.

---

## Dependency Summary

```
#1 Postgres migration ──┐  (parallel)
#2 Auth (Auth.js + Discord) ──┘
        ↓
#3 Multi-draft schema + routing   ← expand/contract, 4 incremental PRs
        ↓
#4 Draft creation UI ──┐  (parallel)
#5a Configurable settings model ──┘
        ↓
[DEPLOY]  (needs #1–4; #5a optional before deploy)
        ↓
#5b Wire settings through logic
#6  Custom rankings upload  (parallel-ish with #5b — coordinate on valuation)
```
