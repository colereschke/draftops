/**
 * @jest-environment node
 */
import { configureTestDatabaseUrl } from '../../scripts/testDatabase';

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

    expect(() => configureTestDatabaseUrl()).toThrow(
      'Integration tests require a local PostgreSQL database ending in _test',
    );
  });
});
