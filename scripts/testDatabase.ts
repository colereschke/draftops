import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import { Client } from 'pg';

const LOCAL_DATABASE_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const TEST_DATABASE_SAFETY_ERROR =
  'Integration tests require a local PostgreSQL database ending in _test';

export interface MigrationTestSchema {
  client: Client;
  schemaName: string;
  applyMigration: (migrationName: string) => Promise<void>;
  dispose: () => Promise<void>;
}

function normalizeHost(host: string): string {
  return host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
}

function isLoopbackHost(host: string): boolean {
  return LOCAL_DATABASE_HOSTS.has(normalizeHost(host));
}

function loadLocalEnvironment(): void {
  const candidates = [resolve('.env.local'), resolve('../..', '.env.local')];
  const envPath = candidates.find((candidate) => existsSync(candidate));
  if (envPath) config({ path: envPath, override: false });
}

export async function runCleanupSteps(steps: ReadonlyArray<() => Promise<void>>): Promise<void> {
  const errors: unknown[] = [];
  for (const step of steps) {
    try {
      await step();
    } catch (error) {
      errors.push(error);
    }
  }

  if (errors.length > 0) {
    throw new AggregateError(errors, 'One or more integration test cleanup steps failed');
  }
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
  if (!isLoopbackHost(testUrl.hostname)) {
    throw new Error(TEST_DATABASE_SAFETY_ERROR);
  }

  let pgConfig = new Client({ connectionString: testUrl.toString() });
  if (!isLoopbackHost(pgConfig.host) || !pgConfig.database?.endsWith('_test')) {
    throw new Error(TEST_DATABASE_SAFETY_ERROR);
  }

  if (normalizeHost(pgConfig.host) === '::1') {
    testUrl.searchParams.set('host', '::1');
    pgConfig = new Client({ connectionString: testUrl.toString() });
  }
  if (!isLoopbackHost(pgConfig.host) || !pgConfig.database?.endsWith('_test')) {
    throw new Error(TEST_DATABASE_SAFETY_ERROR);
  }

  process.env.TEST_DATABASE_URL = testUrl.toString();
  process.env.DATABASE_URL = testUrl.toString();
  return testUrl.toString();
}

function listMigrationDirectories(): string[] {
  const migrationsRoot = resolve('prisma/migrations');
  return readdirSync(migrationsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function readMigration(migrationName: string): string {
  const migrationPath = resolve('prisma/migrations', migrationName, 'migration.sql');
  if (!existsSync(migrationPath)) {
    throw new Error(`Migration ${migrationName} does not exist`);
  }
  return readFileSync(migrationPath, 'utf8');
}

export async function createIsolatedMigrationSchema(
  beforeMigration: string,
): Promise<MigrationTestSchema> {
  const databaseUrl = configureTestDatabaseUrl();
  const schemaName = `migration_${process.pid}_${randomUUID().replaceAll('-', '')}`;
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  await client.query(`CREATE SCHEMA "${schemaName}"`);
  await client.query(`SET search_path TO "${schemaName}", public`);

  try {
    for (const directory of listMigrationDirectories()) {
      if (directory.localeCompare(beforeMigration) >= 0) break;
      await client.query(readMigration(directory));
    }
  } catch (error) {
    await runCleanupSteps([
      async () => {
        await client.query('ROLLBACK');
      },
      async () => {
        await client.query('SET search_path TO public');
      },
      async () => {
        await client.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      },
      async () => {
        await client.end();
      },
    ]);
    throw error;
  }

  return {
    client,
    schemaName,
    applyMigration: async (migrationName) => {
      await client.query(readMigration(migrationName));
    },
    dispose: async () => {
      await runCleanupSteps([
        async () => {
          await client.query('ROLLBACK');
        },
        async () => {
          await client.query('SET search_path TO public');
        },
        async () => {
          await client.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
        },
        async () => {
          await client.end();
        },
      ]);
    },
  };
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

    for (const directory of listMigrationDirectories()) {
      await client.query(readMigration(directory));
    }
  } finally {
    await client.end();
  }
}
