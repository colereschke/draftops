# DraftOps Deployment Roadmap

Goal: make DraftOps shareable with the ETR dynasty Discord — allow anyone to create their own draft, use the full tool, and give feedback.

Each item is ordered by dependency. Don't start a feature until everything above it is done.

---

## 1. PostgreSQL Migration

**Blocks:** all future schema work; deployment  
**Blocked by:** nothing

Swap the SQLite adapter for PostgreSQL. Pure infrastructure change — no application code touches. Do this first so every subsequent migration is written once against Postgres.

- Update `prisma.config.ts` with Postgres connection (target: Neon)
- Swap `@prisma/adapter-better-sqlite3` → `@prisma/adapter-pg` (or native Postgres adapter)
- Update `datasource` provider in `schema.prisma`
- Run `prisma migrate dev` to regenerate against Postgres
- Update `make` targets and local dev docs

---

## 2. Auth & User Management

**Blocks:** multi-draft (drafts need owners); fixes hardcoded `myHandle`  
**Blocked by:** nothing functionally; do after #1 so user data lands in the right DB

Use **Clerk** with Discord OAuth. ETR Discord members already have Discord accounts — zero friction sign-in for the target audience. Clerk handles sessions; store a `userId` reference on owned resources.

- Install and configure Clerk for Next.js App Router
- Add Discord OAuth provider in Clerk dashboard
- Protect mutation routes (bid logging, watchlist, nominations) behind auth
- `myHandle` in nomination scoring becomes the authenticated user's team handle for that draft (no more hardcoded `'coreschke'`)

---

## 3. Multi-Draft Schema + Route Scoping

**Blocks:** draft UI; configurability; deployment  
**Blocked by:** #2 (drafts need an `ownerId`)

This is the largest single PR. Schema change and route wiring must ship together — splitting them leaves the app broken in between.

**Schema changes:**

- Add `Draft` model: `id`, `name`, `ownerId` (Clerk userId), `createdAt`
- Add `draftId` FK to: `Team`, `AuctionResult`, `PlayerWatchlist`, `NominatedPlayer`
- Unique constraints become composite: `(handle, draftId)` on Team, `(playerName, draftId)` on PlayerWatchlist and NominatedPlayer

**Application changes:**

- Every API route, server action, and server component reads and passes `draftId`
- Seed script updated to create a default draft for local dev

---

## 4. Draft Creation & Management UI

**Blocks:** deployment (app isn't usable for others without this)  
**Blocked by:** #2, #3

- Create draft flow (name, placeholder for settings)
- Draft list per authenticated user
- URL structure: `/draft/[draftId]/` prefix for all existing pages, or draft context in session
- Share link so a draft creator can invite others

After this PR, anyone can sign in, create a draft, and use the full existing feature set in their own isolated space.

---

## Deploy Milestone

**Enabled by:** #1–4  
Vercel + Neon PostgreSQL. At this point the app is shareable with ETR Discord for real feedback.

---

## 5a. Configurable League Settings — Model

**Blocks:** wiring settings through logic; custom rankings  
**Blocked by:** #3 (settings live on a `Draft`)

Add settings fields to the `Draft` model:

- `teamCount` (default 12)
- `rosterSize` (default 30)
- `budget` (default 1000)
- `targetRoster` (JSON — per-position targets, default `{QB:4, RB:9, WR:11, TE:3}`)
- `scoringFormat` (enum: `SUPERFLEX` | `ONE_QB`)
- `teMultiplier` (TE premium, default 1.18)

Wire into the draft creation form so users configure their league on setup.

---

## 5b. Configurable League Settings — Wire Through Logic

**Blocks:** custom rankings  
**Blocked by:** #5a

Replace all hardcoded league assumptions with values pulled from the draft's settings:

- `LEAGUE_TEAMS` → teams fetched from DB, scoped to draft
- `ROSTER_SIZE` → `draft.rosterSize`
- `TARGET_ROSTER` → `draft.targetRoster`
- Kicker/PKG rules → remove Cole-specific team-to-manager mappings; make PKG association configurable or document as a manual entry

---

## 6. Custom Rankings Upload

**Blocks:** nothing (final major feature)  
**Blocked by:** #3 (players need `draftId`), #5a (need scoring config to validate/scale values)

Currently the player pool is a static hardcoded file (`src/data/players.ts`). This moves it to the DB, scoped per draft.

- Add `Player` model to schema, scoped to `draftId`
- CSV upload UI targeting FantasyCalc export format (Superflex `$200` budget column)
- Parsing + scaling logic (currently `× 5` for $1000 budget, TE premium, ceiling/floor)
- Validate against draft's scoring format on upload
- Fallback/seed: keep current player data available as a default pool for new drafts

---

## Dependency Summary

```
#1 Postgres migration
#2 Auth (Clerk + Discord OAuth)
#3 Multi-draft schema + routing    ← biggest PR
#4 Draft creation UI
   ↓
[DEPLOY]
   ↓
#5a Configurable settings model
#5b Wire settings through logic
#6  Custom rankings upload
```
