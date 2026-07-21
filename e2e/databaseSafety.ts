import { Client } from 'pg';

const LOCAL_DATABASE_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const DISPOSABLE_DATABASE_PATTERN = /(?:_test|_hard017)$/;
const SAFETY_ERROR = 'HARD-017 performance tests require a local disposable database';

function normalizeHost(host: string): string {
  return host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
}

export function assertDisposablePerformanceDatabase(databaseUrl: string | undefined): void {
  if (!databaseUrl) throw new Error(SAFETY_ERROR);

  const client = new Client({ connectionString: databaseUrl });
  if (
    !LOCAL_DATABASE_HOSTS.has(normalizeHost(client.host)) ||
    !client.database ||
    !DISPOSABLE_DATABASE_PATTERN.test(client.database)
  ) {
    throw new Error(SAFETY_ERROR);
  }
}
