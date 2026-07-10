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

async function main() {
  const drafts = await prisma.draft.findMany({
    select: { id: true, teams: { select: { handle: true, displayName: true } } },
  });
  console.log(`Found ${drafts.length} draft(s).`);

  for (const draft of drafts) {
    const existing = await prisma.player.count({ where: { draftId: draft.id } });
    if (existing > 0) {
      console.log(`  Draft ${draft.id}: already has ${existing} players — skipping.`);
      continue;
    }
    const futurePickAssets = generateFuturePickAssets({
      teams: draft.teams,
      year: new Date().getFullYear() + 1,
      startingRank: 900,
    });
    const seedPlayers = [...BASE_PLAYERS, ...futurePickAssets];
    await prisma.player.createMany({
      data: seedPlayers.map((p) => ({
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
    console.log(`  Draft ${draft.id}: seeded ${seedPlayers.length} players.`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
