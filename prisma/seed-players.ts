import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { players as BASE_PLAYERS } from '../src/data/players';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const drafts = await prisma.draft.findMany({ select: { id: true } });
  console.log(`Found ${drafts.length} draft(s).`);

  for (const draft of drafts) {
    const existing = await prisma.player.count({ where: { draftId: draft.id } });
    if (existing > 0) {
      console.log(`  Draft ${draft.id}: already has ${existing} players — skipping.`);
      continue;
    }
    await prisma.player.createMany({
      data: BASE_PLAYERS.map((p) => ({
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
        draftId: draft.id,
      })),
    });
    console.log(`  Draft ${draft.id}: seeded ${BASE_PLAYERS.length} players.`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
