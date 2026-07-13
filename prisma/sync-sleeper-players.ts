// prisma/sync-sleeper-players.ts
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { parseCsv } from '../src/lib/csv';
import { normalizeName } from '../src/lib/sleeperNormalize';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const SUPPORTED_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE']);
const CSV_PATH = path.resolve(process.cwd(), 'data/generated/normalized_sleeper_players.csv');
const WRITE_BATCH_SIZE = 50;
const WRITE_TRANSACTION_TIMEOUT_MS = 60_000;

// Upserts SleeperPlayer rows from the Python pipeline's normalized_sleeper_players.csv.
// Safe to re-run whenever that file is regenerated — keyed by Sleeper's own player id.
async function main() {
  const contents = readFileSync(CSV_PATH, 'utf-8');
  const { rows } = parseCsv(contents);
  const kept = rows.filter((row) => row.active === 'True' && SUPPORTED_POSITIONS.has(row.position));
  console.log(`Parsed ${rows.length} row(s), ${kept.length} active QB/RB/WR/TE.`);

  for (const batch of chunk(kept, WRITE_BATCH_SIZE)) {
    await prisma.$transaction(
      batch.map((row) => {
        const data = {
          name: row.full_name,
          normalizedName: normalizeName(row.full_name),
          team: row.team ?? '',
          pos: row.position,
          age: row.age ? Number(row.age) : null,
        };
        return prisma.sleeperPlayer.upsert({
          where: { id: row.sleeper_id },
          create: { id: row.sleeper_id, ...data },
          update: data,
        });
      }),
      { timeout: WRITE_TRANSACTION_TIMEOUT_MS },
    );
  }
  console.log(`Upserted ${kept.length} SleeperPlayer row(s).`);
}

function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
