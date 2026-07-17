/** @jest-environment node */

import { Client } from 'pg';
import { configureTestDatabaseUrl, runCleanupSteps } from '../../scripts/testDatabase';

const SAFETY_ERROR = 'Integration tests require a local PostgreSQL database ending in _test';
const originalDatabaseUrl = process.env.DATABASE_URL;
const originalTestDatabaseUrl = process.env.TEST_DATABASE_URL;

afterEach(() => {
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabaseUrl;

  if (originalTestDatabaseUrl === undefined) delete process.env.TEST_DATABASE_URL;
  else process.env.TEST_DATABASE_URL = originalTestDatabaseUrl;
});

describe('configureTestDatabaseUrl', () => {
  it('derives the dedicated test database when TEST_DATABASE_URL is blank', () => {
    process.env.DATABASE_URL = 'postgresql://draftops:secret@localhost:5432/draftops';
    process.env.TEST_DATABASE_URL = '';

    expect(configureTestDatabaseUrl()).toBe(
      'postgresql://draftops:secret@localhost:5432/draftops_test',
    );
  });

  it('refuses a non-local test database even when explicitly configured', () => {
    process.env.TEST_DATABASE_URL = 'postgresql://draftops:secret@example.com/draftops_test';

    expect(() => configureTestDatabaseUrl()).toThrow(SAFETY_ERROR);
  });

  it.each([
    'postgresql://localhost/draftops_test?host=remote.example',
    'postgresql://localhost/draftops_test?host=remote%2Eexample',
    'postgresql://localhost/draftops_test?host=%2Fvar%2Frun%2Fpostgresql',
  ])('rejects a non-loopback effective pg host in %s', (databaseUrl) => {
    process.env.TEST_DATABASE_URL = databaseUrl;

    expect(() => configureTestDatabaseUrl()).toThrow(SAFETY_ERROR);
  });

  it('normalizes an IPv6 loopback URL for node-postgres', () => {
    process.env.TEST_DATABASE_URL = 'postgresql://[::1]/draftops_test';

    const databaseUrl = configureTestDatabaseUrl();
    const client = new Client({ connectionString: databaseUrl });

    expect(client.host).toBe('::1');
    expect(client.database).toBe('draftops_test');
  });
});

describe('integration resource cleanup', () => {
  it('attempts every cleanup step when earlier steps fail', async () => {
    const attempts: string[] = [];
    const firstError = new Error('trigger cleanup failed');
    const secondError = new Error('fixture cleanup failed');

    const cleanup = runCleanupSteps([
      async () => {
        attempts.push('trigger');
        throw firstError;
      },
      async () => {
        attempts.push('function');
      },
      async () => {
        attempts.push('fixtures');
        throw secondError;
      },
      async () => {
        attempts.push('snapshots');
      },
      async () => {
        attempts.push('prisma');
      },
      async () => {
        attempts.push('pool');
      },
    ]);

    await expect(cleanup).rejects.toMatchObject({
      errors: [firstError, secondError],
    });
    expect(attempts).toEqual(['trigger', 'function', 'fixtures', 'snapshots', 'prisma', 'pool']);
  });
});
