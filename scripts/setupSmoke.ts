import { Client } from 'pg';

const SETUP_SMOKE_DATABASE_ERROR =
  'Setup smoke tests require a local PostgreSQL database ending in _test';

function setupSmokeDatabaseError(): Error {
  return new Error(SETUP_SMOKE_DATABASE_ERROR);
}

export function assertSetupSmokeDatabase(
  databaseUrl: string | undefined,
): asserts databaseUrl is string {
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

  assertSetupSmokeDatabase(databaseUrl);
  await verifySetupSeed(databaseUrl);
  console.log('Seeded 12 teams');
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
