import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import { Client } from 'pg';

const LOCAL_DATABASE_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

function loadLocalEnvironment(): void {
  const candidates = [resolve('.env.local'), resolve('../..', '.env.local')];
  const envPath = candidates.find((candidate) => existsSync(candidate));
  if (envPath) config({ path: envPath, override: false });
}

export function configureTestDatabaseUrl(): string {
  loadLocalEnvironment();
  const explicitTestUrl = process.env.TEST_DATABASE_URL?.trim() || undefined;
  const sourceUrl = explicitTestUrl ?? process.env.DATABASE_URL?.trim();
  if (!sourceUrl) {
    throw new Error(
      'TEST_DATABASE_URL or DATABASE_URL is required for PostgreSQL integration tests',
    );
  }

  const testUrl = new URL(sourceUrl);
  if (!explicitTestUrl) testUrl.pathname = '/draftops_test';
  const databaseName = testUrl.pathname.slice(1);
  if (!LOCAL_DATABASE_HOSTS.has(testUrl.hostname) || !databaseName.endsWith('_test')) {
    throw new Error('Integration tests require a local PostgreSQL database ending in _test');
  }

  process.env.TEST_DATABASE_URL = testUrl.toString();
  process.env.DATABASE_URL = testUrl.toString();
  return testUrl.toString();
}

export async function resetTestDatabase(): Promise<void> {
  const databaseUrl = configureTestDatabaseUrl();
  const parsedUrl = new URL(databaseUrl);
  const databaseName = parsedUrl.pathname.slice(1);
  if (!/^[a-zA-Z0-9_]+$/.test(databaseName)) {
    throw new Error('Test database name may contain only letters, numbers, and underscores');
  }

  let client = new Client({ connectionString: databaseUrl });
  try {
    await client.connect();
  } catch (error) {
    if ((error as { code?: string }).code !== '3D000') throw error;
    const adminUrl = new URL(databaseUrl);
    adminUrl.pathname = '/postgres';
    const adminClient = new Client({ connectionString: adminUrl.toString() });
    await adminClient.connect();
    try {
      await adminClient.query(`CREATE DATABASE "${databaseName}"`);
    } finally {
      await adminClient.end();
    }
    client = new Client({ connectionString: databaseUrl });
    await client.connect();
  }
  try {
    await client.query('DROP SCHEMA public CASCADE');
    await client.query('CREATE SCHEMA public');

    const migrationsRoot = resolve('prisma/migrations');
    const migrationDirectories = readdirSync(migrationsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    for (const directory of migrationDirectories) {
      const migrationPath = resolve(migrationsRoot, directory, 'migration.sql');
      if (!existsSync(migrationPath)) continue;
      await client.query(readFileSync(migrationPath, 'utf8'));
    }
  } finally {
    await client.end();
  }
}
