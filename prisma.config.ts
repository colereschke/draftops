import { config as dotenvConfig } from 'dotenv';
import { defineConfig } from 'prisma/config';

// Prisma 7 with prisma.config.ts does NOT auto-load any .env file.
// tsx (used by seed/scripts) also doesn't load env files.
// Load .env.local explicitly so DATABASE_URL is available to the Prisma CLI.
dotenvConfig({ path: '.env.local' });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL!,
  },
});
