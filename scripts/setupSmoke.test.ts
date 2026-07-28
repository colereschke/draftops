/** @jest-environment node */

import { assertSetupSmokeDatabase } from './setupSmoke';

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
});
