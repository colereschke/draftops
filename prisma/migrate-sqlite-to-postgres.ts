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
