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
  console.log('Seeding teams...');
  await Promise.all(
    LEAGUE_TEAMS.map((team) =>
      prisma.team.upsert({
        where: { handle: team.handle },
        update: {},
        create: { handle: team.handle, displayName: team.displayName, budget: 1000 },
      }),
    ),
  );
  console.log('Done.');
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
