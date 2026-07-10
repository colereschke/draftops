import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { players as BASE_PLAYERS } from '../src/data/players';
import { generateFuturePickAssets } from '../src/lib/futurePickAssets';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// Inserts any BASE_PLAYERS entries missing (by name) from each existing
// draft's Player table. Unlike seed-players.ts, this does not skip drafts
// that already have players — it only ever adds rows, never touches or
// duplicates existing ones. Safe to re-run whenever src/data/players.ts
// gains new players (rookies, new pick-year packages, etc).
async function main() {
  const drafts = await prisma.draft.findMany({
    select: { id: true, teams: { select: { handle: true, displayName: true } } },
  });
  console.log(`Found ${drafts.length} draft(s).`);

  for (const draft of drafts) {
    const existing = await prisma.player.findMany({
      where: { draftId: draft.id },
      select: { name: true },
    });
    const existingNames = new Set(existing.map((p) => p.name));
    const futurePickAssets = generateFuturePickAssets({
      teams: draft.teams,
      year: new Date().getFullYear() + 1,
      startingRank: 900,
    });
    const seedPlayers = [...BASE_PLAYERS, ...futurePickAssets];
    const missing = seedPlayers.filter((p) => !existingNames.has(p.player));

    if (missing.length === 0) {
      console.log(`  Draft ${draft.id}: up to date (${existing.length} players).`);
      continue;
    }

    await prisma.player.createMany({
      data: missing.map((p) => ({
        name: p.player,
        nflTeam: p.team,
        pos: p.pos,
        age: p.age,
        sfRank: p.sfRank,
        budget: p.budget,
        ceiling: p.ceiling,
        floor: p.floor,
        baseBudget: p.budget,
        baseCeiling: p.ceiling,
        baseFloor: p.floor,
        sleeperId: null,
        notes: p.notes,
        futurePickYear: p.futurePickYear ?? null,
        futurePickRound: p.futurePickRound ?? null,
        futurePickOriginHandle: p.futurePickOriginHandle ?? null,
        futurePickAssetKind: p.futurePickAssetKind ?? null,
        draftId: draft.id,
      })),
    });
    console.log(`  Draft ${draft.id}: added ${missing.length} missing player(s).`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
