import { getRankingSummary, uploadRankingsCsv, resolveRankingMatch } from '@/lib/rankings-actions';

const mockAuth = jest.fn();
const mockFindUnique = jest.fn();
const mockSleeperFindMany = jest.fn();
const mockTransaction = jest.fn();
const mockRevalidatePath = jest.fn();
const mockPlayerFindUnique = jest.fn();
const mockPlayerUpdate = jest.fn();

const mockTxUpsert = jest.fn();
const mockTxDeleteMany = jest.fn();
const mockTxCreateMany = jest.fn();

jest.mock('@/auth', () => ({ auth: () => mockAuth() }));
jest.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => mockRevalidatePath(...args),
}));
jest.mock('@/lib/db', () => ({
  prisma: {
    userRankingSet: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
    },
    sleeperPlayer: {
      findMany: (...args: unknown[]) => mockSleeperFindMany(...args),
    },
    userRankingPlayer: {
      findUnique: (...args: unknown[]) => mockPlayerFindUnique(...args),
      update: (...args: unknown[]) => mockPlayerUpdate(...args),
    },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

const MOCK_SESSION = { user: { id: '123456789', name: 'Cole' } };

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockResolvedValue(MOCK_SESSION);
  mockSleeperFindMany.mockResolvedValue([
    { id: 's1', name: 'Josh Allen', normalizedName: 'josh allen', team: 'BUF', pos: 'QB' },
  ]);
  mockTransaction.mockImplementation((callback) =>
    callback({
      userRankingSet: { upsert: mockTxUpsert },
      userRankingPlayer: { deleteMany: mockTxDeleteMany, createMany: mockTxCreateMany },
    }),
  );
  mockTxUpsert.mockResolvedValue({ id: 42 });
});

const VALID_CSV = ['Player,Team,Position,Age,2QBAuction', 'Josh Allen,BUF,QB,30.1,$51'].join('\n');

describe('getRankingSummary', () => {
  it('returns null when no session', async () => {
    mockAuth.mockResolvedValue(null);
    expect(await getRankingSummary()).toBeNull();
  });

  it('returns null when the user has no ranking set', async () => {
    mockFindUnique.mockResolvedValue(null);
    expect(await getRankingSummary()).toBeNull();
  });

  it('summarizes matched/unmatched counts', async () => {
    mockFindUnique.mockResolvedValue({
      fileName: 'my_rankings.csv',
      uploadedAt: new Date('2026-07-01'),
      players: [
        { matchStatus: 'matched' },
        { matchStatus: 'manual' },
        { matchStatus: 'unmatched' },
      ],
    });
    const summary = await getRankingSummary();
    expect(summary).toEqual({
      fileName: 'my_rankings.csv',
      uploadedAt: new Date('2026-07-01'),
      totalCount: 3,
      matchedCount: 2,
      unmatchedCount: 1,
    });
  });
});

describe('uploadRankingsCsv', () => {
  it('throws when called without a session', async () => {
    mockAuth.mockResolvedValue(null);
    await expect(uploadRankingsCsv('rankings.csv', VALID_CSV)).rejects.toThrow('Unauthorized');
  });

  it('returns parse errors without persisting', async () => {
    const result = await uploadRankingsCsv('bad.csv', 'Player,Team\nJosh Allen,BUF');
    expect(result).toEqual({ ok: false, errors: expect.any(Array) });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('replaces the existing set and persists matched rows', async () => {
    const result = await uploadRankingsCsv('rankings.csv', VALID_CSV);
    expect(result).toEqual({ ok: true });
    expect(mockTxUpsert).toHaveBeenCalledWith({
      where: { userId: '123456789' },
      create: expect.objectContaining({
        userId: '123456789',
        fileName: 'rankings.csv',
        sourceBudget: 1000,
      }),
      update: expect.objectContaining({ fileName: 'rankings.csv', sourceBudget: 1000 }),
    });
    expect(mockTxDeleteMany).toHaveBeenCalledWith({ where: { rankingSetId: 42 } });
    expect(mockTxCreateMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          rankingSetId: 42,
          name: 'Josh Allen',
          sleeperId: 's1',
          matchStatus: 'matched',
        }),
      ],
    });
  });

  it('marks Pick rows as n_a without attempting a match', async () => {
    const csv = [
      'Player,Team,Position,Age,2QBAuction',
      '2027 1st Round Draft Pick,,Pick,,$15',
    ].join('\n');
    await uploadRankingsCsv('rankings.csv', csv);
    expect(mockTxCreateMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ pos: 'PICK', sleeperId: null, matchStatus: 'n_a' })],
    });
  });
});

describe('resolveRankingMatch', () => {
  it('throws when the ranking player does not belong to the session user', async () => {
    mockPlayerFindUnique.mockResolvedValue({ rankingSet: { userId: 'someone-else' } });
    await expect(resolveRankingMatch(1, 's99')).rejects.toThrow('Not found');
  });

  it('updates sleeperId and matchStatus to manual', async () => {
    mockPlayerFindUnique.mockResolvedValue({ rankingSet: { userId: '123456789' } });
    await resolveRankingMatch(1, 's99');
    expect(mockPlayerUpdate).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { sleeperId: 's99', matchStatus: 'manual' },
    });
  });
});
