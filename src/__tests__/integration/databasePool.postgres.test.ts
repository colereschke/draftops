import { Pool } from 'pg';
import { getDatabasePoolConfiguration } from '@/lib/databaseConfiguration';
import { configureTestDatabaseUrl, runCleanupSteps } from '../../../scripts/testDatabase';

let pool: Pool | undefined;

afterEach(async () => {
  await runCleanupSteps([
    async () => {
      await pool?.end();
    },
  ]);
  pool = undefined;
});

describe('database pool', () => {
  it('bounds concurrent PostgreSQL connections and identifies test traffic', async () => {
    const databaseUrl = configureTestDatabaseUrl();
    const testPool = new Pool(
      getDatabasePoolConfiguration({
        DATABASE_POOL_MAX: '2',
        DATABASE_URL: databaseUrl,
        NODE_ENV: 'test',
      }),
    );
    pool = testPool;

    const queries = Array.from({ length: 4 }, () => testPool.query('SELECT pg_sleep(0.1)'));

    await new Promise((resolve) => setTimeout(resolve, 25));

    expect(testPool.totalCount).toBeLessThanOrEqual(2);
    expect(testPool.waitingCount).toBeGreaterThan(0);
    await expect(Promise.all(queries)).resolves.toHaveLength(4);

    const applicationName = await testPool.query<{ application_name: string }>(
      "SELECT current_setting('application_name') AS application_name",
    );

    expect(applicationName.rows[0]?.application_name).toBe('draftops-test');
  });
});
