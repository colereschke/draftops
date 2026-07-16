import { createBidRecord, deleteBidRecord, updateBidRecord } from '@/lib/bidMutation';

const mockTransaction = jest.fn();
const mockExecuteRaw = jest.fn();
const mockDraftFindFirst = jest.fn();
const mockTeamFindFirst = jest.fn();
const mockPlayerFindFirst = jest.fn();
const mockAuctionFindFirst = jest.fn();
const mockAuctionFindMany = jest.fn();
const mockAuctionCreate = jest.fn();
const mockAuctionUpdate = jest.fn();
const mockAuctionDeleteMany = jest.fn();
const mockNominationDeleteMany = jest.fn();

const mockTx = {
  $executeRaw: mockExecuteRaw,
  draft: { findFirst: mockDraftFindFirst },
  team: { findFirst: mockTeamFindFirst },
  player: { findFirst: mockPlayerFindFirst },
  auctionResult: {
    findFirst: mockAuctionFindFirst,
    findMany: mockAuctionFindMany,
    create: mockAuctionCreate,
    update: mockAuctionUpdate,
    deleteMany: mockAuctionDeleteMany,
  },
  nominatedPlayer: { deleteMany: mockNominationDeleteMany },
};

jest.mock('@/lib/db', () => ({
  prisma: {
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

const ACTIVE_DRAFT = {
  id: 4,
  name: 'Integrity Draft',
  ownerId: 'owner-1',
  ownerTeamId: 7,
  status: 'ACTIVE',
  createdAt: new Date('2026-07-16T00:00:00.000Z'),
  teamCount: 12,
  rosterSize: 3,
  budget: 1000,
  startingLineup: null,
  scoringSettings: null,
  targetRoster: null,
  futurePickAuctionMode: 'PACKAGES',
  sleeperLeagueId: null,
};

const PLAYER = {
  id: 10,
  name: 'Josh Allen',
  pos: 'QB',
  nflTeam: 'BUF',
  sfRank: 1,
};

const CREATE_INPUT = {
  userId: 'owner-1',
  draftId: 4,
  playerId: 10,
  teamId: 7,
  price: 120,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockExecuteRaw.mockResolvedValue(1);
  mockDraftFindFirst.mockResolvedValue(ACTIVE_DRAFT);
  mockTeamFindFirst.mockResolvedValue({ id: 7, budget: 1000 });
  mockPlayerFindFirst.mockResolvedValue(PLAYER);
  mockAuctionFindFirst.mockResolvedValue(null);
  mockAuctionFindMany.mockResolvedValue([]);
  mockAuctionCreate.mockResolvedValue({ id: 99 });
  mockAuctionUpdate.mockResolvedValue({ id: 12 });
  mockAuctionDeleteMany.mockResolvedValue({ count: 1 });
  mockNominationDeleteMany.mockResolvedValue({ count: 1 });
  mockTransaction.mockImplementation((operation: (tx: typeof mockTx) => Promise<unknown>) =>
    operation(mockTx),
  );
});

describe('createBidRecord', () => {
  it.each([
    ['draftId', 0],
    ['draftId', Number.MAX_SAFE_INTEGER + 1],
    ['playerId', -1],
    ['playerId', 1.5],
    ['teamId', NaN],
    ['teamId', Infinity],
    ['price', 0],
    ['price', -10],
    ['price', 1.5],
    ['price', Number.MAX_SAFE_INTEGER + 1],
  ] as const)('rejects invalid %s %p before opening a transaction', async (field, value) => {
    await expect(createBidRecord({ ...CREATE_INPUT, [field]: value })).resolves.toEqual({
      ok: false,
      code: 'INVALID_INPUT',
    });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('derives player metadata and clears the nomination in the same transaction', async () => {
    await expect(createBidRecord(CREATE_INPUT)).resolves.toEqual({
      ok: true,
      data: { bidId: 99 },
    });

    expect(mockAuctionCreate).toHaveBeenCalledWith({
      data: {
        player: 'Josh Allen',
        playerId: 10,
        position: 'QB',
        nflTeam: 'BUF',
        price: 120,
        sfRank: 1,
        teamId: 7,
        draftId: 4,
      },
    });
    expect(mockNominationDeleteMany).toHaveBeenCalledWith({
      where: { playerId: 10, draftId: 4 },
    });
    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });

  it('rejects a player that was already claimed', async () => {
    mockAuctionFindFirst.mockResolvedValue({ id: 8 });

    await expect(createBidRecord(CREATE_INPUT)).resolves.toEqual({
      ok: false,
      code: 'PLAYER_ALREADY_CLAIMED',
    });
    expect(mockAuctionCreate).not.toHaveBeenCalled();
  });

  it('accepts the exact maximum bid that preserves one dollar per open roster slot', async () => {
    mockAuctionFindMany.mockResolvedValue([{ id: 1, price: 100, position: 'RB' }]);

    await expect(createBidRecord({ ...CREATE_INPUT, price: 899 })).resolves.toMatchObject({
      ok: true,
    });
  });

  it('rejects one dollar above the maximum legal bid', async () => {
    mockAuctionFindMany.mockResolvedValue([{ id: 1, price: 100, position: 'RB' }]);

    await expect(createBidRecord({ ...CREATE_INPUT, price: 900 })).resolves.toEqual({
      ok: false,
      code: 'BID_EXCEEDS_MAX',
    });
    expect(mockAuctionCreate).not.toHaveBeenCalled();
  });

  it('rejects a skill player when the roster is full', async () => {
    mockDraftFindFirst.mockResolvedValue({ ...ACTIVE_DRAFT, rosterSize: 1 });
    mockAuctionFindMany.mockResolvedValue([{ id: 1, price: 100, position: 'RB' }]);

    await expect(createBidRecord(CREATE_INPUT)).resolves.toEqual({
      ok: false,
      code: 'ROSTER_FULL',
    });
  });

  it('allows a package to use budget without consuming a roster slot', async () => {
    mockDraftFindFirst.mockResolvedValue({ ...ACTIVE_DRAFT, rosterSize: 1 });
    mockPlayerFindFirst.mockResolvedValue({ ...PLAYER, pos: 'PKG', name: '2027 Pick Package' });
    mockAuctionFindMany.mockResolvedValue([{ id: 1, price: 100, position: 'RB' }]);

    await expect(createBidRecord({ ...CREATE_INPUT, price: 900 })).resolves.toMatchObject({
      ok: true,
    });
  });

  it('translates only the draft/player unique conflict', async () => {
    mockAuctionCreate.mockRejectedValue({
      code: 'P2002',
      meta: { target: ['draftId', 'playerId'] },
    });

    await expect(createBidRecord(CREATE_INPUT)).resolves.toEqual({
      ok: false,
      code: 'PLAYER_ALREADY_CLAIMED',
    });
  });

  it('propagates an unrelated uniqueness failure', async () => {
    mockAuctionCreate.mockRejectedValue({ code: 'P2002', meta: { target: ['otherField'] } });

    await expect(createBidRecord(CREATE_INPUT)).rejects.toEqual({
      code: 'P2002',
      meta: { target: ['otherField'] },
    });
  });

  it('propagates nomination cleanup failures so the transaction rolls back', async () => {
    mockNominationDeleteMany.mockRejectedValue(new Error('nomination cleanup failed'));

    await expect(createBidRecord(CREATE_INPUT)).rejects.toThrow('nomination cleanup failed');
  });
});

describe('updateBidRecord', () => {
  const existingBid = { id: 12, playerId: 10, position: 'QB', price: 500, teamId: 7 };

  it('excludes the existing bid before validating a same-team price update', async () => {
    mockAuctionFindFirst.mockResolvedValue(existingBid);
    mockAuctionFindMany.mockResolvedValue([{ id: 13, price: 100, position: 'RB' }]);

    await expect(
      updateBidRecord({ userId: 'owner-1', draftId: 4, bidId: 12, teamId: 7, price: 899 }),
    ).resolves.toMatchObject({ ok: true });
    expect(mockAuctionFindMany).toHaveBeenCalledWith({
      where: { draftId: 4, teamId: 7, id: { not: 12 } },
      select: { id: true, price: true, position: true },
    });
  });

  it('validates the destination team when moving a bid', async () => {
    mockAuctionFindFirst.mockResolvedValue(existingBid);
    mockTeamFindFirst.mockResolvedValue({ id: 8, budget: 1000 });
    mockAuctionFindMany.mockResolvedValue([
      { id: 20, price: 600, position: 'WR' },
      { id: 21, price: 398, position: 'TE' },
    ]);

    await expect(
      updateBidRecord({ userId: 'owner-1', draftId: 4, bidId: 12, teamId: 8, price: 3 }),
    ).resolves.toEqual({ ok: false, code: 'BID_EXCEEDS_MAX' });
    expect(mockAuctionUpdate).not.toHaveBeenCalled();
  });

  it('returns BID_NOT_FOUND for an unknown draft-scoped result', async () => {
    mockAuctionFindFirst.mockResolvedValue(null);

    await expect(
      updateBidRecord({ userId: 'owner-1', draftId: 4, bidId: 999, teamId: 7, price: 10 }),
    ).resolves.toEqual({ ok: false, code: 'BID_NOT_FOUND' });
  });
});

describe('deleteBidRecord', () => {
  it('deletes only the locked draft result', async () => {
    await expect(deleteBidRecord({ userId: 'owner-1', draftId: 4, bidId: 12 })).resolves.toEqual({
      ok: true,
      data: null,
    });
    expect(mockAuctionDeleteMany).toHaveBeenCalledWith({ where: { id: 12, draftId: 4 } });
  });

  it('returns BID_NOT_FOUND when no row is deleted', async () => {
    mockAuctionDeleteMany.mockResolvedValue({ count: 0 });

    await expect(deleteBidRecord({ userId: 'owner-1', draftId: 4, bidId: 999 })).resolves.toEqual({
      ok: false,
      code: 'BID_NOT_FOUND',
    });
  });
});
