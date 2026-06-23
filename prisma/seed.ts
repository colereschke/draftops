import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { LEAGUE_TEAMS } from '../src/lib/teams';

const dbPath = path.join(process.cwd(), 'prisma/dev.db');
const adapter = new PrismaBetterSqlite3({ url: dbPath });
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
  });
