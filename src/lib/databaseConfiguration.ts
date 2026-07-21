export interface DatabaseEnvironment {
  DATABASE_URL?: string;
  DATABASE_POOL_MAX?: string;
  DIRECT_URL?: string;
  NODE_ENV?: string;
  VERCEL?: string;
  VERCEL_ENV?: string;
}

export interface DatabasePoolConfiguration {
  application_name:
    'draftops-development' | 'draftops-preview' | 'draftops-production' | 'draftops-test';
  connectionString: string;
  connectionTimeoutMillis: 5000;
  idleTimeoutMillis: 10000;
  max: number;
}

const DEFAULT_POOL_MAX = 3;

function trimEnvironmentValue(value: string | undefined): string | undefined {
  const trimmedValue = value?.trim();
  return trimmedValue || undefined;
}

function getApplicationName(
  environment: DatabaseEnvironment,
): DatabasePoolConfiguration['application_name'] {
  if (environment.NODE_ENV === 'test') return 'draftops-test';
  if (environment.VERCEL_ENV === 'production') return 'draftops-production';
  if (environment.VERCEL_ENV === 'preview') return 'draftops-preview';
  return 'draftops-development';
}

function getPoolMaximum(value: string | undefined): number {
  if (value === undefined) return DEFAULT_POOL_MAX;
  if (!/^[1-9]\d*$/.test(value)) {
    throw new Error('DATABASE_POOL_MAX must be a whole number from 1 through 10');
  }

  const maximum = Number(value);
  if (maximum > 10) throw new Error('DATABASE_POOL_MAX must be a whole number from 1 through 10');
  return maximum;
}

export function getDatabasePoolConfiguration(
  environment: DatabaseEnvironment,
): DatabasePoolConfiguration {
  const connectionString = trimEnvironmentValue(environment.DATABASE_URL);
  if (!connectionString) {
    throw new Error('DATABASE_URL is required when database access is requested');
  }

  return {
    application_name: getApplicationName(environment),
    connectionString,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 10000,
    max: getPoolMaximum(environment.DATABASE_POOL_MAX),
  };
}

export function resolveMigrationDatabaseUrl(environment: DatabaseEnvironment): string | undefined {
  const directUrl = trimEnvironmentValue(environment.DIRECT_URL);
  if (directUrl) return directUrl;
  if (environment.VERCEL === '1') throw new Error('DIRECT_URL is required when VERCEL=1');
  return trimEnvironmentValue(environment.DATABASE_URL);
}
