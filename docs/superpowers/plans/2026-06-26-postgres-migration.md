# PostgreSQL Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Swap DraftOps from SQLite to PostgreSQL (Neon in production, native WSL2 Postgres locally), preserving all existing auction data.

**Architecture:** Replace `@prisma/adapter-better-sqlite3` with `@prisma/adapter-pg` (node-postgres). Delete the 3 SQLite-dialect migration files and regenerate fresh Postgres-native ones. Run a one-time TypeScript data migration script that reads `dev.db.backup` directly via `better-sqlite3` and upserts all rows into Postgres with explicit IDs, then resets Postgres autoincrement sequences.

**Tech Stack:** Prisma 7, `@prisma/adapter-pg`, `pg` (node-postgres), `better-sqlite3` (read-only, devDep, removed after migration), `tsx`, WSL2 Ubuntu Postgres, Neon (production).

## Global Constraints

- pnpm only — never npm or yarn
- Prisma 7: `prisma.config.ts` holds the datasource URL (not `schema.prisma`); adapter passed explicitly to `PrismaClient({ adapter })`
- TypeScript strict mode, no `any` warnings
- Pre-commit hook runs `pnpm lint-staged` + `pnpm tsc --noEmit` — never skip with `--no-verify`
- Run `make check` (typecheck + lint + format + tests) before every commit
- No author attribution in commit messages

---

## File Map

| Action | Path                                   | Purpose                                                      |
| ------ | -------------------------------------- | ------------------------------------------------------------ |
| Modify | `package.json`                         | Swap adapter deps; move `better-sqlite3` to devDeps          |
| Modify | `prisma/schema.prisma`                 | Change provider to `postgresql`                              |
| Modify | `prisma.config.ts`                     | Read `DATABASE_URL` from env                                 |
| Modify | `src/lib/db.ts`                        | Swap `PrismaBetterSqlite3` → `PrismaPg`                      |
| Modify | `prisma/seed.ts`                       | Swap adapter; remove hardcoded DB path                       |
| Modify | `Makefile`                             | Add `db-start`, `db-stop`, `db-migrate-data`; update `setup` |
| Delete | `prisma/migrations/`                   | SQLite-dialect; regenerated fresh against Postgres           |
| Create | `.env.example`                         | Documents required `DATABASE_URL` variable                   |
| Create | `prisma/migrate-sqlite-to-postgres.ts` | One-time data migration script                               |

`.env.local` is created manually (gitignored) — not in the file map.

---

## Task 1: Safety Nets and Local Postgres Setup

> Manual steps only — no commits. Do these before touching any code.

**Files:** none

- [ ] **Step 1: Backup `dev.db` inside the repo**

```bash
cp prisma/dev.db prisma/dev.db.backup
```

- [ ] **Step 2: Backup `dev.db` outside the repo**

```bash
cp prisma/dev.db ~/draftops-sqlite-backup-$(date +%Y%m%d).db
```

- [ ] **Step 3: Cut the `sqlite-archive` fallback branch**

```bash
git checkout -b sqlite-archive
git checkout main
```

If Postgres migration fails catastrophically, `git checkout sqlite-archive` restores a working SQLite codebase. The backup covers the data; this branch covers the code.

- [ ] **Step 4: Install Postgres in WSL2**

```bash
sudo apt-get update && sudo apt-get install -y postgresql postgresql-contrib
```

Expected: installs without error. Postgres version ≥ 14.

- [ ] **Step 5: Start the Postgres service**

```bash
sudo service postgresql start
```

Expected output includes: `* Starting PostgreSQL ... [ OK ]`

- [ ] **Step 6: Create the `draftops` database user**

```bash
sudo -u postgres psql -c "CREATE USER draftops WITH PASSWORD 'draftops' CREATEDB;"
```

Expected: `CREATE ROLE`

- [ ] **Step 7: Create the `draftops` database**

```bash
sudo -u postgres psql -c "CREATE DATABASE draftops OWNER draftops;"
```

Expected: `CREATE DATABASE`

- [ ] **Step 8: Verify the connection works**

```bash
psql postgresql://draftops:draftops@localhost/draftops -c "SELECT 1;"
```

Expected:

```
 ?column?
----------
        1
(1 row)
```

If this fails, check that `pg_hba.conf` allows `md5` or `scram-sha-256` for host connections. On Ubuntu 22.04 this is the default and should work.

---

## Task 2: Environment Variables

**Files:**

- Create: `.env.example`
- (Manual) Create: `.env.local`

- [ ] **Step 1: Create `.env.example`**

```bash
cat > .env.example << 'EOF'
# Copy this file to .env.local and fill in your DATABASE_URL.
# .env.local is gitignored — never commit it.

# Local (WSL2 native Postgres):
# DATABASE_URL=postgresql://draftops:draftops@localhost/draftops

# Neon (production):
# DATABASE_URL=postgresql://user:pass@ep-xxx.us-east-1.aws.neon.tech/neondb?sslmode=require

DATABASE_URL=
EOF
```

- [ ] **Step 2: Create `.env.local` with your local connection string**

```bash
echo 'DATABASE_URL=postgresql://draftops:draftops@localhost/draftops' > .env.local
```

Verify `.env.local` is gitignored (Next.js does this by default — check `.gitignore` contains `.env*.local`):

```bash
grep '.env' .gitignore
```

Expected output includes `.env*.local`.

- [ ] **Step 3: Commit `.env.example`**

```bash
git add .env.example
git commit -m "chore: add .env.example for DATABASE_URL"
```

---

## Task 3: Adapter Swap

**Files:**

- Modify: `package.json`
- Modify: `prisma/schema.prisma`
- Modify: `prisma.config.ts`
- Modify: `src/lib/db.ts`
- Modify: `prisma/seed.ts`
- Delete: `prisma/migrations/` (all contents)

- [ ] **Step 1: Update `package.json` — swap adapter dependencies**

Replace the entire `dependencies` and `devDependencies` sections. Changes:

- Remove from `dependencies`: `@prisma/adapter-better-sqlite3`, `better-sqlite3`
- Add to `dependencies`: `pg`, `@prisma/adapter-pg`
- Add to `devDependencies`: `@types/pg`, `@types/better-sqlite3`, `dotenv`, and move `better-sqlite3` here (still needed for the migration script in Task 5)

`package.json` dependencies section becomes:

```json
"dependencies": {
  "@prisma/adapter-pg": "^7.8.0",
  "@prisma/client": "^7.8.0",
  "next": "16.2.9",
  "pg": "^8.13.3",
  "react": "19.2.4",
  "react-dom": "19.2.4"
},
```

`package.json` devDependencies — add these entries (keep all existing devDeps, just add the new ones):

```json
"@types/better-sqlite3": "^7.6.13",
"@types/pg": "^8.11.10",
"better-sqlite3": "^12.11.1",
"dotenv": "^16.4.7",
```

The `db:seed` script stays unchanged (`tsx prisma/seed.ts`) — dotenv loading is handled inside the script itself (see Step 5).

- [ ] **Step 2: Update `prisma/schema.prisma`**

Change `provider = "sqlite"` to `provider = "postgresql"`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
}

// One row per team in the league (12 teams total)
model Team {
  id          Int             @id @default(autoincrement())
  handle      String          @unique
  displayName String?
  budget      Int             @default(1000)
  createdAt   DateTime        @default(now())
  updatedAt   DateTime        @updatedAt
  results     AuctionResult[]
}

// One row per completed auction bid
model AuctionResult {
  id        Int      @id @default(autoincrement())
  player    String
  position  String
  nflTeam   String
  price     Int
  sfRank    Int?
  notes     String?
  teamId    Int
  team      Team     @relation(fields: [teamId], references: [id])
  createdAt DateTime @default(now())
}

// Cole's personal watchlist — players he still wants to win; excluded from nomination suggestions
model PlayerWatchlist {
  id         Int      @id @default(autoincrement())
  playerName String   @unique
  createdAt  DateTime @default(now())
}

// Players currently up for auction (nominated but not yet won); excluded from nomination suggestions
model NominatedPlayer {
  id         Int      @id @default(autoincrement())
  playerName String   @unique
  createdAt  DateTime @default(now())
}
```

- [ ] **Step 3: Update `prisma.config.ts`**

```ts
import { config as dotenvConfig } from 'dotenv';
import { defineConfig } from 'prisma/config';

// Prisma 7 with prisma.config.ts does NOT auto-load any .env file.
// tsx (used by seed/scripts) also doesn't load env files.
// Load .env.local explicitly so DATABASE_URL is available to the Prisma CLI.
dotenvConfig({ path: '.env.local' });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL!,
  },
});
```

The `dotenvConfig` call loads `.env.local` before Prisma reads `DATABASE_URL`. On Vercel (where `.env.local` doesn't exist and `DATABASE_URL` is injected directly into the process), `dotenvConfig` silently no-ops and the env var is already set. Fail-fast with `!` so a missing URL throws immediately rather than connecting to a wrong database.

- [ ] **Step 4: Update `src/lib/db.ts`**

```ts
import { Pool } from 'pg';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
```

- [ ] **Step 5: Update `prisma/seed.ts`**

```ts
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.local' });

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { LEAGUE_TEAMS } from '../src/lib/teams';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Seeding teams...');
  for (const team of LEAGUE_TEAMS) {
    await prisma.team.upsert({
      where: { handle: team.handle },
      update: {},
      create: { handle: team.handle, displayName: team.displayName, budget: 1000 },
    });
  }
  console.log('Done.');
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
```

> **`PrismaPg` constructor — verify before coding.** After `pnpm install`, run `grep -A5 'class PrismaPg' node_modules/@prisma/adapter-pg/dist/index.d.ts` to confirm the constructor signature. If it takes a `Pool` instance (the Prisma 5.x pattern, likely still in v7), the code above is correct. If v7 changed it to take a config object (`new PrismaPg({ connectionString })`), remove the `new Pool(...)` lines, change the constructor call, and drop the `pool.end()` calls everywhere. Apply the same fix to `db.ts` and the migration script in Task 5.

- [ ] **Step 6: Delete the SQLite migrations folder**

```bash
rm -rf prisma/migrations
```

- [ ] **Step 7: Install updated dependencies**

```bash
pnpm install
```

Expected: installs `pg`, `@prisma/adapter-pg`, `@types/pg`; removes `@prisma/adapter-better-sqlite3`; moves `better-sqlite3` to devDeps. `postinstall` runs `prisma generate` automatically — it should succeed.

If `prisma generate` fails during install with a URL error, run it manually after install:

```bash
DATABASE_URL=postgresql://draftops:draftops@localhost/draftops pnpm prisma generate
```

- [ ] **Step 8: Generate fresh Postgres migrations**

```bash
pnpm prisma migrate dev --name init
```

Expected: creates `prisma/migrations/<timestamp>_init/migration.sql` with Postgres-dialect SQL (`SERIAL` or `BIGSERIAL`, `TIMESTAMP`, etc.). Applies the migration to your local Postgres.

If it prompts about resetting the database, type `y` — the local DB is empty at this point.

- [ ] **Step 9: Run seed**

```bash
make db-seed
```

Expected:

```
Seeding teams...
Done.
```

- [ ] **Step 10: Verify seed in Postgres**

```bash
psql postgresql://draftops:draftops@localhost/draftops -c 'SELECT id, handle FROM "Team" ORDER BY id;'
```

Expected: 12 rows, all team handles present (coreschke, chappy72, etc.).

- [ ] **Step 11: Run `make check`**

```bash
make check
```

Expected: typecheck ✓, lint ✓, format ✓, tests ✓. Fix any failures before continuing.

- [ ] **Step 12: Start the dev server and verify all 4 pages load**

```bash
make dev
```

Open http://localhost:3000. Check each page:

- `/` — value sheet loads, player list visible
- `/teams` — 12 teams listed, all show $1,000 remaining (no bids yet in local DB)
- `/budget` — 12 teams in buying power order
- `/nominate` — nomination scores visible

Kill the dev server (`Ctrl+C`) before continuing.

- [ ] **Step 13: Commit**

```bash
git add package.json prisma/schema.prisma prisma.config.ts src/lib/db.ts prisma/seed.ts prisma/migrations pnpm-lock.yaml
git commit -m "feat: swap SQLite adapter for PostgreSQL (pg)"
```

---

## Task 4: Makefile Updates

**Files:**

- Modify: `Makefile`

- [ ] **Step 1: Update `Makefile`**

Replace the current `Makefile` with this — the only additions are `db-start`, `db-stop`, `db-migrate-data`, and a updated `setup` preamble:

```makefile
.DEFAULT_GOAL := help

# ── Setup ─────────────────────────────────────────────────────────────────────

.PHONY: setup
setup: install db-migrate db-seed ## First-time setup: install deps, run migrations, seed DB
	@echo ""
	@echo "✓ DraftOps is ready. Run 'make dev' to start."
	@echo ""
	@echo "Prerequisites (first time only):"
	@echo "  1. Copy .env.example → .env.local and set DATABASE_URL"
	@echo "  2. make db-start  (start local Postgres)"

.PHONY: install
install: ## Install dependencies
	pnpm install

# ── Development ───────────────────────────────────────────────────────────────

.PHONY: dev
dev: ## Start the development server (applies pending migrations first)
	pnpm prisma migrate deploy
	pnpm dev

.PHONY: build
build: ## Build for production
	pnpm build

.PHONY: start
start: ## Start the production server (requires build first)
	pnpm start

# ── Code Quality ──────────────────────────────────────────────────────────────

.PHONY: lint
lint: ## Run ESLint
	pnpm lint

.PHONY: lint-fix
lint-fix: ## Run ESLint with auto-fix
	pnpm lint:fix

.PHONY: format
format: ## Format all files with Prettier
	pnpm format

.PHONY: format-check
format-check: ## Check formatting without writing
	pnpm format:check

.PHONY: typecheck
typecheck: ## Run TypeScript type-check
	pnpm typecheck

.PHONY: test
test: ## Run tests
	pnpm test

.PHONY: test-watch
test-watch: ## Run tests in watch mode
	pnpm test:watch

.PHONY: test-coverage
test-coverage: ## Run tests with coverage report
	pnpm test:coverage

.PHONY: check
check: typecheck lint format-check test ## Run all checks (typecheck, lint, format, test)

# ── Database ──────────────────────────────────────────────────────────────────

.PHONY: db-start
db-start: ## Start the local PostgreSQL service (WSL2)
	sudo service postgresql start

.PHONY: db-stop
db-stop: ## Stop the local PostgreSQL service (WSL2)
	sudo service postgresql stop

.PHONY: db-migrate
db-migrate: ## Run pending database migrations
	pnpm prisma migrate dev

.PHONY: db-seed
db-seed: ## Seed the database with league teams
	pnpm db:seed

.PHONY: db-reset
db-reset: ## Reset DB and re-run migrations + seed (destructive!)
	pnpm prisma migrate reset --force
	pnpm db:seed

.PHONY: db-studio
db-studio: ## Open Prisma Studio (visual DB browser)
	pnpm prisma studio

.PHONY: db-migrate-data
db-migrate-data: ## Run the one-time SQLite→PostgreSQL data migration script
	pnpm tsx prisma/migrate-sqlite-to-postgres.ts

# ── Help ──────────────────────────────────────────────────────────────────────

.PHONY: help
help: ## Show this help message
	@echo "DraftOps — Dynasty Auction Tool"
	@echo ""
	@echo "Usage: make [target]"
	@echo ""
	@awk 'BEGIN {FS = ":.*##"} /^[a-zA-Z_-]+:.*##/ { printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2 }' $(MAKEFILE_LIST)
```

- [ ] **Step 2: Verify `make help` lists new targets**

```bash
make help
```

Expected: `db-start`, `db-stop`, `db-migrate-data` appear in the output.

- [ ] **Step 3: Commit**

```bash
git add Makefile
git commit -m "chore: add db-start/stop and db-migrate-data make targets"
```

---

## Task 5: Data Migration Script

**Files:**

- Create: `prisma/migrate-sqlite-to-postgres.ts`

This script reads `prisma/dev.db.backup` via `better-sqlite3` and upserts all rows into Postgres via Prisma, preserving original IDs. Then resets Postgres sequences and prints a verification table.

- [ ] **Step 1: Create `prisma/migrate-sqlite-to-postgres.ts`**

```ts
import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.local' });

import path from 'node:path';
import Database from 'better-sqlite3';
import { Pool } from 'pg';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// ── Parse --db flag ────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const dbFlagIndex = args.indexOf('--db');
const dbPath =
  dbFlagIndex !== -1 ? args[dbFlagIndex + 1] : path.join(process.cwd(), 'prisma/dev.db.backup');

if (!dbPath) {
  console.error('Error: --db flag provided but no path given');
  process.exit(1);
}

console.log(`Reading SQLite from: ${dbPath}`);
console.log(
  `Writing to Postgres: ${process.env.DATABASE_URL?.replace(/:\/\/.*@/, '://<redacted>@')}\n`,
);

// ── Open connections ───────────────────────────────────────────────────────
const sqlite = new Database(dbPath, { readonly: true });
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// ── Row types (SQLite returns plain objects) ───────────────────────────────
type SqliteTeam = {
  id: number;
  handle: string;
  displayName: string | null;
  budget: number;
  createdAt: string;
  updatedAt: string;
};

type SqliteAuctionResult = {
  id: number;
  player: string;
  position: string;
  nflTeam: string;
  price: number;
  sfRank: number | null;
  notes: string | null;
  teamId: number;
  createdAt: string;
};

type SqliteWatchlist = {
  id: number;
  playerName: string;
  createdAt: string;
};

type SqliteNominated = {
  id: number;
  playerName: string;
  createdAt: string;
};

async function main() {
  // ── 1. Read all data from SQLite ─────────────────────────────────────────
  const teams = sqlite.prepare('SELECT * FROM "Team" ORDER BY id').all() as SqliteTeam[];
  const results = sqlite
    .prepare('SELECT * FROM "AuctionResult" ORDER BY id')
    .all() as SqliteAuctionResult[];
  const watchlist = sqlite
    .prepare('SELECT * FROM "PlayerWatchlist" ORDER BY id')
    .all() as SqliteWatchlist[];
  const nominated = sqlite
    .prepare('SELECT * FROM "NominatedPlayer" ORDER BY id')
    .all() as SqliteNominated[];

  console.log('SQLite row counts:');
  console.log(`  Team:            ${teams.length}`);
  console.log(`  AuctionResult:   ${results.length}`);
  console.log(`  PlayerWatchlist: ${watchlist.length}`);
  console.log(`  NominatedPlayer: ${nominated.length}\n`);

  // ── 2. Insert Teams ───────────────────────────────────────────────────────
  console.log('Migrating Team...');
  for (const team of teams) {
    await prisma.team.upsert({
      where: { id: team.id },
      update: {},
      create: {
        id: team.id,
        handle: team.handle,
        displayName: team.displayName ?? null,
        budget: team.budget,
        createdAt: new Date(team.createdAt),
        updatedAt: new Date(team.updatedAt),
      },
    });
  }

  // ── 3. Insert AuctionResults ──────────────────────────────────────────────
  console.log('Migrating AuctionResult...');
  for (const result of results) {
    await prisma.auctionResult.upsert({
      where: { id: result.id },
      update: {},
      create: {
        id: result.id,
        player: result.player,
        position: result.position,
        nflTeam: result.nflTeam,
        price: result.price,
        sfRank: result.sfRank ?? null,
        notes: result.notes ?? null,
        teamId: result.teamId,
        createdAt: new Date(result.createdAt),
      },
    });
  }

  // ── 4. Insert PlayerWatchlist ─────────────────────────────────────────────
  console.log('Migrating PlayerWatchlist...');
  for (const item of watchlist) {
    await prisma.playerWatchlist.upsert({
      where: { id: item.id },
      update: {},
      create: {
        id: item.id,
        playerName: item.playerName,
        createdAt: new Date(item.createdAt),
      },
    });
  }

  // ── 5. Insert NominatedPlayers ────────────────────────────────────────────
  console.log('Migrating NominatedPlayer...');
  for (const item of nominated) {
    await prisma.nominatedPlayer.upsert({
      where: { id: item.id },
      update: {},
      create: {
        id: item.id,
        playerName: item.playerName,
        createdAt: new Date(item.createdAt),
      },
    });
  }

  // ── 6. Reset Postgres sequences ───────────────────────────────────────────
  // Inserting explicit IDs does not advance the autoincrement sequence.
  // Without this, the next INSERT would collide on the primary key.
  console.log('\nResetting Postgres sequences...');
  // setval(seq, v, false) means "next value = v" (is_called=false).
  // COALESCE(MAX(id), 0) + 1 handles empty tables: next id = 1, not 2.
  await prisma.$executeRawUnsafe(
    `SELECT setval(pg_get_serial_sequence('"Team"', 'id'), COALESCE(MAX(id), 0) + 1, false) FROM "Team"`,
  );
  await prisma.$executeRawUnsafe(
    `SELECT setval(pg_get_serial_sequence('"AuctionResult"', 'id'), COALESCE(MAX(id), 0) + 1, false) FROM "AuctionResult"`,
  );
  await prisma.$executeRawUnsafe(
    `SELECT setval(pg_get_serial_sequence('"PlayerWatchlist"', 'id'), COALESCE(MAX(id), 0) + 1, false) FROM "PlayerWatchlist"`,
  );
  await prisma.$executeRawUnsafe(
    `SELECT setval(pg_get_serial_sequence('"NominatedPlayer"', 'id'), COALESCE(MAX(id), 0) + 1, false) FROM "NominatedPlayer"`,
  );

  // ── 7. Verify row counts ──────────────────────────────────────────────────
  const pgTeamCount = await prisma.team.count();
  const pgResultCount = await prisma.auctionResult.count();
  const pgWatchlistCount = await prisma.playerWatchlist.count();
  const pgNominatedCount = await prisma.nominatedPlayer.count();

  console.log('\nVerification — row counts:');
  const check = (label: string, sqlite: number, pg: number) => {
    const ok = sqlite === pg;
    console.log(
      `  ${label.padEnd(16)} SQLite=${sqlite}  Postgres=${pg}  ${ok ? '✓' : '✗ MISMATCH'}`,
    );
    return ok;
  };

  const allOk = [
    check('Team', teams.length, pgTeamCount),
    check('AuctionResult', results.length, pgResultCount),
    check('PlayerWatchlist', watchlist.length, pgWatchlistCount),
    check('NominatedPlayer', nominated.length, pgNominatedCount),
  ].every(Boolean);

  // ── 8. Spot-check most recent AuctionResult ───────────────────────────────
  const latestSqlite = sqlite
    .prepare(
      `SELECT ar.*, t.handle as teamHandle
       FROM "AuctionResult" ar
       JOIN "Team" t ON t.id = ar.teamId
       ORDER BY ar.id DESC LIMIT 1`,
    )
    .get() as (SqliteAuctionResult & { teamHandle: string }) | undefined;

  if (latestSqlite) {
    const latestPg = await prisma.auctionResult.findFirst({
      orderBy: { id: 'desc' },
      include: { team: true },
    });

    console.log('\nSpot-check — most recent AuctionResult:');
    console.log(
      `  SQLite:   id=${latestSqlite.id}  ${latestSqlite.player}  $${latestSqlite.price}  → ${latestSqlite.teamHandle}`,
    );
    console.log(
      `  Postgres: id=${latestPg?.id}  ${latestPg?.player}  $${latestPg?.price}  → ${latestPg?.team.handle}`,
    );

    const spotOk =
      latestSqlite.id === latestPg?.id &&
      latestSqlite.player === latestPg?.player &&
      latestSqlite.price === latestPg?.price;
    console.log(spotOk ? '  ✓ Match' : '  ✗ MISMATCH — investigate before continuing!');

    if (!allOk || !spotOk) process.exit(1);
  }

  console.log('\n✓ Migration complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
    sqlite.close();
  });
```

- [ ] **Step 2: Run the migration script against local Postgres**

```bash
make db-migrate-data
```

Expected output:

```
Reading SQLite from: /path/to/prisma/dev.db.backup
Writing to Postgres: postgresql://<redacted>@localhost/draftops

SQLite row counts:
  Team:            12
  AuctionResult:   <N>
  PlayerWatchlist: <N>
  NominatedPlayer: <N>

Migrating Team...
Migrating AuctionResult...
Migrating PlayerWatchlist...
Migrating NominatedPlayer...

Resetting Postgres sequences...

Verification — row counts:
  Team             SQLite=12  Postgres=12  ✓
  AuctionResult    SQLite=N   Postgres=N   ✓
  PlayerWatchlist  SQLite=N   Postgres=N   ✓
  NominatedPlayer  SQLite=N   Postgres=N   ✓

Spot-check — most recent AuctionResult:
  SQLite:   id=X  <player>  $<price>  → <handle>
  Postgres: id=X  <player>  $<price>  → <handle>
  ✓ Match

✓ Migration complete.
```

If any row counts mismatch or spot-check fails, the script exits with code 1. Investigate the error output before continuing.

- [ ] **Step 3: Open the app and verify live data is present**

```bash
make dev
```

Open http://localhost:3000. Verify:

- `/` — auction results from `dev.db` are visible in the value sheet (bid prices, won players)
- `/teams` — team budgets and rosters show real data (not all-zero)
- `/budget` — buying power reflects real bids
- `/nominate` — watchlist items carry over from SQLite

Log a test bid on any player (small amount, any team), confirm it appears in the UI, then delete it via the modal. Kill the dev server.

- [ ] **Step 4: Commit**

```bash
git add prisma/migrate-sqlite-to-postgres.ts
git commit -m "feat: add SQLite→Postgres one-time data migration script"
```

---

## Task 6: Neon Setup, Production Migration, and Cleanup

**Files:**

- Modify: `package.json` (remove `better-sqlite3` from devDeps)

- [ ] **Step 1: Create a Neon account**

Go to https://neon.tech and sign up (free tier, no credit card required). Confirm your email.

- [ ] **Step 2: Create a Neon project**

In the Neon console:

1. Click "New Project"
2. Name: `draftops`
3. Region: US East (closest to Vercel's default region for lowest latency at deploy time)
4. Postgres version: 16 (or latest offered)
5. Click "Create project"

Copy the connection string — it looks like:

```
postgresql://neondb_owner:password@ep-xxx-xxx.us-east-1.aws.neon.tech/neondb?sslmode=require
```

- [ ] **Step 3: Run the migration schema against Neon**

Update `.env.local` temporarily to point at Neon:

```bash
# Edit .env.local — replace the DATABASE_URL line:
# DATABASE_URL=postgresql://neondb_owner:...@.../neondb?sslmode=require
```

Then run migrations and seed against Neon:

```bash
pnpm prisma migrate deploy
make db-seed
```

Expected: migration applies, 12 teams seeded.

- [ ] **Step 4: Run the data migration script against Neon**

```bash
make db-migrate-data
```

Expected: same output as Task 5 Step 2, but writing to Neon. All row counts match, spot-check passes.

- [ ] **Step 5: Verify data in Neon console**

In the Neon console, go to the "Tables" tab (or use Prisma Studio with the Neon URL). Check:

- `Team` table: 12 rows
- `AuctionResult` table: same count as SQLite
- Most recent `AuctionResult` matches the spot-check output

- [ ] **Step 6: Restore local DATABASE_URL**

```bash
# Edit .env.local — restore:
# DATABASE_URL=postgresql://draftops:draftops@localhost/draftops
```

- [ ] **Step 7: Run `make check` against local Postgres**

```bash
make check
```

Expected: all checks pass.

- [ ] **Step 8: Remove the migration script and dev.db.backup**

The migration is done — the script and backup are no longer needed in the repo.

```bash
git rm prisma/migrate-sqlite-to-postgres.ts
rm -f prisma/dev.db.backup
```

The permanent backup remains at `~/draftops-sqlite-backup-<date>.db` outside the repo.

- [ ] **Step 9: Remove migration-only devDependencies**

In `package.json`, remove these lines from `devDependencies`:

- `"better-sqlite3": "^12.11.1"`
- `"@types/better-sqlite3": "^7.6.13"`
- `"dotenv": "^16.4.7"` (only needed for CLI env loading during migration; Next.js handles env at runtime)

Also revert the `db:seed` script back to plain tsx (no longer needs dotenv wrapper since the script is gone):

```json
"db:seed": "tsx prisma/seed.ts"
```

Then:

```bash
pnpm install
```

Expected: those three packages uninstalled, lockfile updated, no errors.

> **Note:** `prisma.config.ts` still imports `dotenv` — after removing it, revert `prisma.config.ts` to remove the dotenv import and load. The URL will be injected by Vercel in production, and for local dev you'll need to load it another way (e.g. `dotenv -e .env.local -- pnpm prisma migrate dev`). Alternatively, keep `dotenv` as a permanent devDep — it's tiny and solves the local Prisma CLI UX cleanly. Your call; the plan includes removing it, but keeping it is equally valid.

- [ ] **Step 10: Final `make check`**

```bash
make check
```

Expected: all checks pass.

- [ ] **Step 11: Commit and open PR**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: remove better-sqlite3 and migration script after data migration"
```

Then open the PR:

```bash
gh pr create \
  --title "feat: migrate from SQLite to PostgreSQL" \
  --body "$(cat <<'EOF'
## Summary

- Swaps \`@prisma/adapter-better-sqlite3\` for \`@prisma/adapter-pg\` (node-postgres)
- Changes Prisma datasource provider from \`sqlite\` to \`postgresql\`
- Reads \`DATABASE_URL\` from env (local: WSL2 Postgres, production: Neon)
- Wipes SQLite-dialect migrations and regenerates fresh Postgres-native ones
- Adds \`make db-start\`, \`make db-stop\`, \`make db-migrate-data\` targets
- Includes one-time migration script (removed after use) that transferred all existing data with sequence resets and verification

## Test plan

- [ ] \`make check\` passes
- [ ] All 4 pages load with real auction data
- [ ] New bid can be logged and deleted
- [ ] Watchlist and nominations persist correctly
- [ ] Neon database contains correct row counts (verified in console)
EOF
)"
```
