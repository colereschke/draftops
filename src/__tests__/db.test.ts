/** @jest-environment node */

const poolConstructor = jest.fn();
const prismaPgConstructor = jest.fn();
const disconnect = jest.fn<Promise<void>, []>().mockResolvedValue(undefined);
const prismaClient = { $disconnect: disconnect };
const prismaClientConstructor = jest.fn(() => prismaClient);

jest.mock('pg', () => ({ Pool: poolConstructor }));
jest.mock('@prisma/adapter-pg', () => ({ PrismaPg: prismaPgConstructor }));
jest.mock('@prisma/client', () => ({ PrismaClient: prismaClientConstructor }));

interface DatabaseModule {
  disconnectPrisma: () => Promise<void>;
  getPrisma: () => typeof prismaClient;
}

async function loadDatabaseModule(): Promise<DatabaseModule> {
  jest.resetModules();
  return (await import('@/lib/db')) as unknown as DatabaseModule;
}

describe('Prisma runtime', () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalDatabasePoolMaximum = process.env.DATABASE_POOL_MAX;

  beforeEach(() => {
    jest.clearAllMocks();
    delete (globalThis as { runtime?: unknown }).runtime;
    delete process.env.DATABASE_URL;
    delete process.env.DATABASE_POOL_MAX;
  });

  afterAll(() => {
    process.env.DATABASE_URL = originalDatabaseUrl;
    process.env.DATABASE_POOL_MAX = originalDatabasePoolMaximum;
  });

  it('defers construction until database access is requested when no URL is configured', async () => {
    const database = await loadDatabaseModule();

    expect(poolConstructor).not.toHaveBeenCalled();
    expect(prismaPgConstructor).not.toHaveBeenCalled();
    expect(prismaClientConstructor).not.toHaveBeenCalled();
    expect(database.getPrisma).toThrow(
      'DATABASE_URL is required when database access is requested',
    );
  });

  it('creates and caches one Prisma client from the configured pool', async () => {
    process.env.DATABASE_URL = 'postgresql://draftops:test@localhost:5432/draftops';
    process.env.DATABASE_POOL_MAX = '4';
    const database = await loadDatabaseModule();

    expect(database.getPrisma()).toBe(prismaClient);
    expect(database.getPrisma()).toBe(prismaClient);
    expect(poolConstructor).toHaveBeenCalledTimes(1);
    expect(poolConstructor).toHaveBeenCalledWith({
      application_name: 'draftops-test',
      connectionString: process.env.DATABASE_URL,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 10000,
      max: 4,
    });
    expect(prismaPgConstructor).toHaveBeenCalledTimes(1);
    expect(prismaClientConstructor).toHaveBeenCalledTimes(1);
  });

  it('disconnects once, clears the cache, and does nothing before initialization', async () => {
    const database = await loadDatabaseModule();

    await database.disconnectPrisma();
    expect(disconnect).not.toHaveBeenCalled();

    process.env.DATABASE_URL = 'postgresql://draftops:test@localhost:5432/draftops';
    database.getPrisma();
    await database.disconnectPrisma();

    expect(disconnect).toHaveBeenCalledTimes(1);
    database.getPrisma();
    expect(prismaClientConstructor).toHaveBeenCalledTimes(2);
  });
});
