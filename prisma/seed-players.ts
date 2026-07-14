import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { players as BASE_PLAYERS } from '../src/data/players';
import {
  excludeStaticFuturePickRows,
  generateFuturePickAssets,
  getNextFuturePickYear,
} from '../src/lib/futurePickAssets';
import { getCustomPlayerKey } from '../src/lib/playerIdentity';
import { getEtrSleeperMatches } from '../src/lib/projectionIdentity';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const etrMatches = getEtrSleeperMatches();
  const drafts = await prisma.draft.findMany({
    select: { id: true, createdAt: true, teams: { select: { handle: true, displayName: true } } },
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
      year: getNextFuturePickYear(draft.createdAt),
      startingRank: 900,
    });
    const seedPlayers = [...excludeStaticFuturePickRows(BASE_PLAYERS), ...futurePickAssets];
    await prisma.player.createMany({
      data: seedPlayers.map((p, index) => ({
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
        sleeperId: p.sleeperId ?? etrMatches.get(p.player) ?? null,
        customKey: getCustomPlayerKey(p, index),
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
