import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  getDatabasePoolConfiguration,
  resolveMigrationDatabaseUrl,
} from '@/lib/databaseConfiguration';

const RUNTIME_URL = 'postgresql://draftops:secret@localhost:5432/draftops';

describe('getDatabasePoolConfiguration', () => {
  it('returns the default development pool configuration', () => {
    expect(getDatabasePoolConfiguration({ DATABASE_URL: RUNTIME_URL })).toEqual({
      application_name: 'draftops-development',
      connectionString: RUNTIME_URL,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 10000,
      max: 3,
    });
  });

  it.each(['', '0', '-1', '1.5', 'eleven', '11', ' 3 '])(
    'rejects invalid DATABASE_POOL_MAX value %p',
    (databasePoolMax) => {
      expect(() =>
        getDatabasePoolConfiguration({
          DATABASE_POOL_MAX: databasePoolMax,
          DATABASE_URL: RUNTIME_URL,
        }),
      ).toThrow('DATABASE_POOL_MAX must be a whole number from 1 through 10');
    },
  );

  it.each([
    ['1', 1],
    ['10', 10],
  ])('accepts DATABASE_POOL_MAX value %s', (databasePoolMax, expectedMaximum) => {
    expect(
      getDatabasePoolConfiguration({
        DATABASE_POOL_MAX: databasePoolMax,
        DATABASE_URL: RUNTIME_URL,
      }).max,
    ).toBe(expectedMaximum);
  });

  it.each([
    [{ DATABASE_URL: RUNTIME_URL, NODE_ENV: 'test' }, 'draftops-test'],
    [{ DATABASE_URL: RUNTIME_URL, VERCEL: '1', VERCEL_ENV: 'production' }, 'draftops-production'],
    [{ DATABASE_URL: RUNTIME_URL, VERCEL: '1', VERCEL_ENV: 'preview' }, 'draftops-preview'],
    [{ DATABASE_URL: RUNTIME_URL, VERCEL: '1', VERCEL_ENV: 'development' }, 'draftops-development'],
    [{ DATABASE_URL: RUNTIME_URL, VERCEL: '1' }, 'draftops-development'],
  ] as const)('uses %s for the matching environment', (environment, applicationName) => {
    expect(getDatabasePoolConfiguration(environment).application_name).toBe(applicationName);
  });

  it('trims the runtime database URL', () => {
    expect(
      getDatabasePoolConfiguration({ DATABASE_URL: ` ${RUNTIME_URL} ` }).connectionString,
    ).toBe(RUNTIME_URL);
  });

  it('rejects a missing runtime database URL', () => {
    expect(() => getDatabasePoolConfiguration({ DATABASE_URL: ' ' })).toThrow(
      'DATABASE_URL is required when database access is requested',
    );
  });
});

describe('resolveMigrationDatabaseUrl', () => {
  it('prefers the direct URL when one is available', () => {
    expect(
      resolveMigrationDatabaseUrl({
        DATABASE_URL: RUNTIME_URL,
        DIRECT_URL: ' postgresql://draftops:secret@localhost:5432/draftops_direct ',
      }),
    ).toBe('postgresql://draftops:secret@localhost:5432/draftops_direct');
  });

  it('uses the runtime URL locally when no direct URL is available', () => {
    expect(resolveMigrationDatabaseUrl({ DATABASE_URL: ` ${RUNTIME_URL} ` })).toBe(RUNTIME_URL);
  });

  it('requires a direct URL on Vercel', () => {
    expect(() => resolveMigrationDatabaseUrl({ DATABASE_URL: RUNTIME_URL, VERCEL: '1' })).toThrow(
      'DIRECT_URL is required when VERCEL=1',
    );
  });

  it('returns undefined when no local migration URL is configured', () => {
    expect(resolveMigrationDatabaseUrl({ DATABASE_URL: ' ' })).toBeUndefined();
  });
});

describe('CI database configuration', () => {
  it('keeps the production build job free of database URLs', () => {
    const ciWorkflow = readFileSync(join(process.cwd(), '.github/workflows/ci.yml'), 'utf8');
    const buildJob = ciWorkflow.match(/^  build:\n[\s\S]*?(?=^  [\w-]+:|(?![\s\S]))/m)?.[0];

    expect(buildJob).toBeDefined();
    expect(buildJob).not.toContain('DATABASE_URL:');
    expect(buildJob).not.toContain('DIRECT_URL:');
  });
});
