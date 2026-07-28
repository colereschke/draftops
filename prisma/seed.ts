import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.local' });

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { seedDefaultDraft } from './seedDefaultDraft';

async function main(): Promise<void> {
  let prisma: PrismaClient | undefined;
  let pool: Pool | undefined;

  try {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const adapter = new PrismaPg(pool);
    prisma = new PrismaClient({ adapter });

    console.log('Seeding default draft...');
    await seedDefaultDraft(prisma, process.env.OWNER_DISCORD_ID);
    console.log('Done.');
  } finally {
    await prisma?.$disconnect();
    await pool?.end();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
