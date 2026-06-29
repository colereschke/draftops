# PostgreSQL Migration Design

**Roadmap item:** #1  
**Date:** 2026-06-26  
**Status:** Approved, pending implementation

## Goal

Swap DraftOps from SQLite to PostgreSQL. Pure infrastructure change — no application logic changes. Unblocks all future schema work and deployment to Vercel + Neon.

## Decisions Made

- **Local dev:** Native Postgres via `sudo apt install postgresql` in WSL2. No Docker (not installed).
- **Adapter:** `@prisma/adapter-pg` (node-postgres) everywhere — local and Neon. Single adapter, no environment-specific switching.
- **Migration history:** Wipe existing SQLite migrations (3 files, SQLite dialect), regenerate fresh Postgres-native migrations via `prisma migrate dev --name init`.
- **Data migration:** One-time TypeScript script reads `dev.db` via `better-sqlite3` directly, writes to Postgres via Prisma with explicit IDs preserved.
- **Production DB:** Neon. Account + project created as part of this work; Neon is populated after local migration is verified.

## Safety Nets (Before Any Code Changes)

These are manual steps done before touching the codebase:

1. `cp prisma/dev.db prisma/dev.db.backup` — backup inside repo
2. Copy `dev.db` to a location **outside** the repo (e.g. `~/draftops-backup-YYYYMMDD.db`)
3. `git checkout -b sqlite-archive && git checkout main` — cut a fallback branch; if Postgres migration fails, `git checkout sqlite-archive` restores a working SQLite codebase

## Phase 1: Infrastructure Swap

### Dependencies

Remove:

- `@prisma/adapter-better-sqlite3`
- `better-sqlite3` (move to devDependencies temporarily — needed for the data migration script)

Add:

- `pg`
- `@prisma/adapter-pg`
- `@types/pg` (devDependency)

### `schema.prisma`

```prisma
datasource db {
  provider = "postgresql"
}
```

### `prisma.config.ts`

```ts
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env.DATABASE_URL! },
});
```

### `src/lib/db.ts`

```ts
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

function createPrismaClient() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });
}
```

### `prisma/seed.ts`

Same adapter swap as `db.ts`.

### Migration history

Delete `prisma/migrations/` entirely. Run:

```bash
pnpm prisma migrate dev --name init
```

This generates fresh Postgres-dialect SQL.

### Local Postgres setup

```bash
sudo apt-get update && sudo apt-get install -y postgresql postgresql-contrib
sudo service postgresql start
sudo -u postgres createuser --superuser $USER
sudo -u postgres createdb draftops
```

### Environment variables

`.env.local` (gitignored):

```
DATABASE_URL=postgresql://localhost/draftops
```

`.env.example` (committed):

```
# Local: postgresql://localhost/draftops
# Neon:  postgresql://user:pass@host/dbname?sslmode=require
DATABASE_URL=
```

## Phase 2: Data Migration Script

**File:** `prisma/migrate-sqlite-to-postgres.ts`  
**Run:** `pnpm tsx prisma/migrate-sqlite-to-postgres.ts`  
**Idempotent:** Uses upserts so safe to re-run.

### Logic

1. Open `prisma/dev.db.backup` (or path passed via `--db` flag) via `better-sqlite3` — raw SQL reads, no Prisma
2. Insert all rows into Postgres via Prisma with **explicit `id` values** to preserve FK relationships
3. Insert order: `Team` → `AuctionResult` → `PlayerWatchlist` → `NominatedPlayer`
4. Type coerce: SQLite `DateTime` strings → `new Date(row.createdAt)`
5. After all inserts, reset Postgres sequences (critical — copying explicit IDs does not advance the sequence):

```sql
SELECT setval(pg_get_serial_sequence('"Team"', 'id'), MAX(id)) FROM "Team";
SELECT setval(pg_get_serial_sequence('"AuctionResult"', 'id'), MAX(id)) FROM "AuctionResult";
SELECT setval(pg_get_serial_sequence('"PlayerWatchlist"', 'id'), MAX(id)) FROM "PlayerWatchlist";
SELECT setval(pg_get_serial_sequence('"NominatedPlayer"', 'id'), MAX(id)) FROM "NominatedPlayer";
```

6. Verify: print row count comparison (SQLite vs Postgres) for all 4 tables; spot-check the most recent `AuctionResult` (player name, price, team handle)

### `--db` flag

```bash
pnpm tsx prisma/migrate-sqlite-to-postgres.ts --db prisma/dev.db.backup
```

Defaults to `prisma/dev.db.backup` if not specified, so the original `dev.db` is never opened by the script.

## Phase 3: Neon Setup

1. Create account at neon.tech (free tier)
2. Create a new project named `draftops`
3. Copy the connection string → set as `DATABASE_URL` in `.env.local` temporarily
4. Run the data migration script pointing at Neon
5. Verify Neon data in Neon's console or Prisma Studio
6. Restore `.env.local` to local Postgres URL for day-to-day dev

The Neon connection string goes into Vercel's environment variables at deploy time (roadmap milestone after #1–4).

## Makefile Changes

New targets:

- `make db-start` → `sudo service postgresql start`
- `make db-stop` → `sudo service postgresql stop`
- `make db-migrate-data` → `pnpm tsx prisma/migrate-sqlite-to-postgres.ts`

Updated `make setup` preamble to note: copy `.env.example` → `.env.local` and run `make db-start` before `make dev`.

## Order of Operations

1. Manual safety nets (backup + archive branch)
2. Install local Postgres, create `draftops` DB
3. Code changes (adapter swap, schema, config, db.ts, seed.ts)
4. Delete migrations, `pnpm prisma migrate dev --name init`
5. `make db-seed` → verify 12 teams
6. `make db-migrate-data` → run migration script
7. Open app, verify all 4 pages, log a test bid, delete it
8. Create Neon account + project
9. `make db-migrate-data` with Neon `DATABASE_URL` → verify in Neon console
10. Restore local `DATABASE_URL`, `make check` (typecheck + lint + format + tests)
11. Cleanup: remove `better-sqlite3` from devDependencies, delete `dev.db.backup` from repo
12. PR → merge to `main`

## What Doesn't Change

- All 4 page routes and their data fetching logic
- Server actions (`logBid`, `updateBid`, `deleteBid`)
- Prisma schema models (no schema logic changes, only provider)
- `make dev`, `make check`, `make db-reset`, `make db-studio`
- Test suite
