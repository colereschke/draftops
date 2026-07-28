/** @jest-environment node */

import { spawnSync } from 'node:child_process';
import { assertSetupSmokeDatabase, assertSetupSmokeDatabases } from './setupSmoke';

describe('assertSetupSmokeDatabase', () => {
  it.each([
    ['undefined', undefined],
    [
      'a Neon test database',
      'postgresql://user:secret@ep-blue-forest-123.us-east-2.aws.neon.tech/draftops_test',
    ],
    ['a local non-test database', 'postgresql://draftops:secret@localhost:5432/draftops'],
  ])('rejects %s', (_label, databaseUrl) => {
    expect(() => assertSetupSmokeDatabase(databaseUrl)).toThrow(
      'Setup smoke tests require a local PostgreSQL database ending in _test',
    );
  });

  it('accepts a localhost PostgreSQL test database', () => {
    expect(() =>
      assertSetupSmokeDatabase('postgresql://draftops:secret@localhost:5432/draftops_setup_test'),
    ).not.toThrow();
  });

  it('rejects query parameters that override the local PostgreSQL target', () => {
    expect(() =>
      assertSetupSmokeDatabase(
        'postgresql://draftops:secret@localhost:5432/draftops_setup_test?host=example.com&port=6543',
      ),
    ).toThrow('Setup smoke tests require a local PostgreSQL database ending in _test');
  });

  it('accepts non-routing PostgreSQL query parameters', () => {
    expect(() =>
      assertSetupSmokeDatabase(
        'postgresql://draftops:secret@localhost:5432/draftops_setup_test?application_name=setup-smoke',
      ),
    ).not.toThrow();
  });

  it('rejects an unsafe DIRECT_URL when DATABASE_URL is safe', () => {
    expect(() =>
      assertSetupSmokeDatabases(
        'postgresql://draftops:secret@localhost:5432/draftops_setup_test',
        'postgresql://draftops:secret@ep-blue-forest-123.us-east-2.aws.neon.tech/draftops_test',
      ),
    ).toThrow('Setup smoke tests require a local PostgreSQL database ending in _test');
  });

  it('accepts matching local PostgreSQL test databases', () => {
    expect(() =>
      assertSetupSmokeDatabases(
        'postgresql://draftops:secret@localhost:5432/draftops_setup_test',
        'postgresql://draftops:secret@127.0.0.1:5432/draftops_setup_test',
      ),
    ).not.toThrow();
  });

  it('validates the target without opening a database connection when requested', () => {
    const databaseUrl = 'postgresql://draftops:secret@localhost:5432/draftops_setup_test';
    const result = spawnSync(
      process.execPath,
      ['--import', 'tsx', 'scripts/setupSmoke.ts', '--validate'],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: { ...process.env, DATABASE_URL: databaseUrl, DIRECT_URL: databaseUrl },
      },
    );

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
  });
});
