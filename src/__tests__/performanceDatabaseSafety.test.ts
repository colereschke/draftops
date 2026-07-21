/** @jest-environment node */

import { assertDisposablePerformanceDatabase } from '../../e2e/databaseSafety';

describe('assertDisposablePerformanceDatabase', () => {
  it.each([
    'postgresql://draftops:secret@localhost:5432/draftops_test',
    'postgresql://draftops:secret@127.0.0.1:5432/draftops_hard017',
    'postgresql://draftops:secret@[::1]:5432/draftops_hard017',
  ])('accepts a dedicated local database: %s', (databaseUrl) => {
    expect(() => assertDisposablePerformanceDatabase(databaseUrl)).not.toThrow();
  });

  it.each([
    'postgresql://draftops:secret@localhost:5432/draftops',
    'postgresql://draftops:secret@example.com:5432/draftops_hard017',
    'postgresql://draftops:secret@localhost:5432/draftops_hard017?host=remote.example',
  ])('rejects a database that is not disposable and local: %s', (databaseUrl) => {
    expect(() => assertDisposablePerformanceDatabase(databaseUrl)).toThrow(
      'HARD-017 performance tests require a local disposable database',
    );
  });
});
