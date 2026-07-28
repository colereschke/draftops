import { Client } from 'pg';

const SETUP_SMOKE_DATABASE_ERROR =
  'Setup smoke tests require a local PostgreSQL database ending in _test';

function setupSmokeDatabaseError(): Error {
  return new Error(SETUP_SMOKE_DATABASE_ERROR);
}

interface SetupSmokeDatabase {
  identity: string;
}

export function assertSetupSmokeDatabase(
  databaseUrl: string | undefined,
): asserts databaseUrl is string {
  parseSetupSmokeDatabase(databaseUrl);
}

export function assertSetupSmokeDatabases(
  databaseUrl: string | undefined,
  directUrl: string | undefined,
): asserts databaseUrl is string {
  const database = parseSetupSmokeDatabase(databaseUrl);
  if (!directUrl) return;

  const directDatabase = parseSetupSmokeDatabase(directUrl);
  if (database.identity !== directDatabase.identity) {
    throw setupSmokeDatabaseError();
  }
}

function parseSetupSmokeDatabase(databaseUrl: string | undefined): SetupSmokeDatabase {
  if (!databaseUrl) {
    throw setupSmokeDatabaseError();
  }

  let parsedDatabaseUrl: URL;

  try {
    parsedDatabaseUrl = new URL(databaseUrl);
  } catch {
    throw setupSmokeDatabaseError();
  }

  const host = parsedDatabaseUrl.hostname.replace(/^\[|\]$/g, '');
  const isLoopbackHost = host === 'localhost' || host === '127.0.0.1' || host === '::1';

  if (!isLoopbackHost || !parsedDatabaseUrl.pathname.endsWith('_test')) {
    throw setupSmokeDatabaseError();
  }

  return {
    identity: `${parsedDatabaseUrl.port || '5432'}${parsedDatabaseUrl.pathname}`,
  };
}

export async function verifySetupSeed(databaseUrl: string): Promise<void> {
  assertSetupSmokeDatabase(databaseUrl);

  const client = new Client({ connectionString: databaseUrl });

  try {
    await client.connect();
    const result = await client.query<{ count: string }>('SELECT COUNT(*) AS count FROM "Team"');

    if (result.rows[0]?.count !== '12') {
      throw new Error(`Expected 12 seeded teams, got ${result.rows[0]?.count ?? '0'}`);
    }
  } finally {
    await client.end();
  }
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;

  assertSetupSmokeDatabases(databaseUrl, process.env.DIRECT_URL);
  await verifySetupSeed(databaseUrl);
  console.log('Seeded 12 teams');
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
