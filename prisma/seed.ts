import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.local' });

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { LEAGUE_TEAMS } from '../src/lib/teams';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Seeding default draft...');
  let draft = await prisma.draft.findFirst({ where: { name: "Cole's Draft 2025" } });
  if (!draft) {
    draft = await prisma.draft.create({
      data: {
        name: "Cole's Draft 2025",
        ownerId: process.env.OWNER_DISCORD_ID ?? null,
        ownerTeamId: null,
      },
    });
  }

  console.log('Seeding teams...');
  await Promise.all(
    LEAGUE_TEAMS.map((team) =>
      prisma.team.upsert({
        where: { handle: team.handle },
        update: {},
        create: {
          handle: team.handle,
          displayName: team.displayName,
          budget: 1000,
          draftId: draft.id,
        },
      }),
    ),
  );

  // Set ownerTeamId if not already set
  if (!draft.ownerTeamId) {
    const ownerTeam = await prisma.team.findFirst({ where: { handle: 'coreschke' } });
    if (ownerTeam) {
      await prisma.draft.update({ where: { id: draft.id }, data: { ownerTeamId: ownerTeam.id } });
    }
  }

  console.log('Done.');
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
