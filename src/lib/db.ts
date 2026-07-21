import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';

import { getDatabasePoolConfiguration } from '@/lib/databaseConfiguration';

interface PrismaRuntime {
  client: PrismaClient;
}

interface PrismaGlobal {
  runtime: PrismaRuntime | undefined;
}

const globalForPrisma = globalThis as unknown as PrismaGlobal;

function createPrismaClient(): PrismaClient {
  const configuration = getDatabasePoolConfiguration(process.env);
  const pool = new Pool({
    application_name: configuration.application_name,
    connectionString: configuration.connectionString,
    connectionTimeoutMillis: configuration.connectionTimeoutMillis,
    idleTimeoutMillis: configuration.idleTimeoutMillis,
    max: configuration.max,
  });
  const adapter = new PrismaPg(pool, { disposeExternalPool: true });

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });
}

export function getPrisma(): PrismaClient {
  if (globalForPrisma.runtime) return globalForPrisma.runtime.client;

  const client = createPrismaClient();
  globalForPrisma.runtime = { client };
  return client;
}

export async function disconnectPrisma(): Promise<void> {
  const runtime = globalForPrisma.runtime;
  if (!runtime) return;

  globalForPrisma.runtime = undefined;
  await runtime.client.$disconnect();
}
