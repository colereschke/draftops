import {
  createBidRecord,
  deleteBidRecord,
  restoreBidRecord,
  updateBidRecord,
} from '@/lib/bidMutation';

const mockTransaction = jest.fn();
const mockExecuteRaw = jest.fn();
const mockQueryRaw = jest.fn();
const mockDraftFindFirst = jest.fn();
const mockTeamFindFirst = jest.fn();
const mockPlayerFindFirst = jest.fn();
const mockAuctionFindFirst = jest.fn();
const mockAuctionFindMany = jest.fn();
const mockAuctionCreate = jest.fn();
const mockAuctionUpdate = jest.fn();
const mockAuctionDeleteMany = jest.fn();
const mockNominationDeleteMany = jest.fn();
const mockAuditCreate = jest.fn();

const mockTx = {
  $executeRaw: mockExecuteRaw,
  $queryRaw: mockQueryRaw,
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
  bidAuditEvent: { create: mockAuditCreate },
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
  mockQueryRaw.mockResolvedValue([{ now: new Date('2026-07-19T12:20:00.000Z') }]);
  mockDraftFindFirst.mockResolvedValue(ACTIVE_DRAFT);
  mockTeamFindFirst.mockResolvedValue({ id: 7, budget: 1000 });
  mockPlayerFindFirst.mockResolvedValue(PLAYER);
  mockAuctionFindFirst.mockResolvedValue(null);
  mockAuctionFindMany.mockResolvedValue([]);
  mockAuctionCreate.mockResolvedValue({
    id: 99,
    draftId: 4,
    playerId: 10,
    player: 'Josh Allen',
    position: 'QB',
    nflTeam: 'BUF',
    price: 120,
    sfRank: 1,
    notes: null,
    teamId: 7,
    createdAt: new Date('2026-07-19T12:00:00.000Z'),
    updatedAt: new Date('2026-07-19T12:00:00.000Z'),
    deletedAt: null,
    supersededAt: null,
  });
  mockAuctionUpdate.mockResolvedValue({ id: 12 });
  mockAuctionDeleteMany.mockResolvedValue({ count: 1 });
  mockNominationDeleteMany.mockResolvedValue({ count: 1 });
  mockAuditCreate.mockResolvedValue({ id: 1 });
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
    expect(mockAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'CREATE', bidId: 99 }) }),
    );
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

  it('supersedes a deleted claim before creating its replacement', async () => {
    const deletedBid = {
      id: 8,
      draftId: 4,
      playerId: 10,
      player: 'Josh Allen',
      position: 'QB',
      nflTeam: 'BUF',
      price: 100,
      sfRank: 1,
      notes: null,
      teamId: 6,
      createdAt: new Date('2026-07-19T12:00:00.000Z'),
      updatedAt: new Date('2026-07-19T12:05:00.000Z'),
      deletedAt: new Date('2026-07-19T12:05:00.000Z'),
      supersededAt: null,
    };
    mockAuctionFindMany.mockResolvedValueOnce([]).mockResolvedValueOnce([deletedBid]);
    mockAuctionUpdate.mockResolvedValueOnce({
      ...deletedBid,
      supersededAt: new Date('2026-07-19T12:20:00.000Z'),
    });

    await expect(createBidRecord(CREATE_INPUT)).resolves.toEqual({
      ok: true,
      data: { bidId: 99 },
    });

    expect(mockAuctionFindFirst).toHaveBeenCalledWith({
      where: { playerId: 10, draftId: 4, deletedAt: null },
      select: { id: true },
    });
    expect(mockAuctionFindMany).toHaveBeenLastCalledWith({
      where: {
        playerId: 10,
        draftId: 4,
        deletedAt: { not: null },
        supersededAt: null,
      },
    });
    expect(mockAuctionUpdate).toHaveBeenCalledWith({
      where: { id: 8 },
      data: { supersededAt: expect.any(Date) },
    });
    expect(mockAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'SUPERSEDE', bidId: 8 }) }),
    );
  });

  it('accepts the exact maximum bid that preserves one dollar per open roster slot', async () => {
    mockAuctionFindMany
      .mockResolvedValueOnce([{ id: 1, price: 100, position: 'RB' }])
      .mockResolvedValue([]);

    await expect(createBidRecord({ ...CREATE_INPUT, price: 899 })).resolves.toMatchObject({
      ok: true,
    });
  });

  it('rejects one dollar above the maximum legal bid', async () => {
    mockAuctionFindMany
      .mockResolvedValueOnce([{ id: 1, price: 100, position: 'RB' }])
      .mockResolvedValue([]);

    await expect(createBidRecord({ ...CREATE_INPUT, price: 900 })).resolves.toEqual({
      ok: false,
      code: 'BID_EXCEEDS_MAX',
    });
    expect(mockAuctionCreate).not.toHaveBeenCalled();
  });

  it('rejects a skill player when the roster is full', async () => {
    mockDraftFindFirst.mockResolvedValue({ ...ACTIVE_DRAFT, rosterSize: 1 });
    mockAuctionFindMany
      .mockResolvedValueOnce([{ id: 1, price: 100, position: 'RB' }])
      .mockResolvedValue([]);

    await expect(createBidRecord(CREATE_INPUT)).resolves.toEqual({
      ok: false,
      code: 'ROSTER_FULL',
    });
  });

  it('allows a package to use budget without consuming a roster slot', async () => {
    mockDraftFindFirst.mockResolvedValue({ ...ACTIVE_DRAFT, rosterSize: 1 });
    mockPlayerFindFirst.mockResolvedValue({ ...PLAYER, pos: 'PKG', name: '2027 Pick Package' });
    mockAuctionFindMany
      .mockResolvedValueOnce([{ id: 1, price: 100, position: 'RB' }])
      .mockResolvedValue([]);

    await expect(createBidRecord({ ...CREATE_INPUT, price: 900 })).resolves.toMatchObject({
      ok: true,
    });
  });

  it('ignores PICK and PKG results when checking the final skill roster slot', async () => {
    mockDraftFindFirst.mockResolvedValue({ ...ACTIVE_DRAFT, rosterSize: 2 });
    mockAuctionFindMany
      .mockResolvedValueOnce([
        { id: 1, price: 100, position: 'RB' },
        { id: 2, price: 50, position: 'PICK' },
        { id: 3, price: 50, position: 'PKG' },
      ])
      .mockResolvedValue([]);

    await expect(createBidRecord({ ...CREATE_INPUT, price: 800 })).resolves.toMatchObject({
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
    mockAuctionFindFirst.mockResolvedValue({
      ...existingBid,
      draftId: 4,
      player: 'Josh Allen',
      nflTeam: 'BUF',
      sfRank: 1,
      notes: null,
      createdAt: new Date('2026-07-19T12:00:00.000Z'),
      updatedAt: new Date('2026-07-19T12:00:00.000Z'),
      deletedAt: null,
      supersededAt: null,
    });
    mockAuctionFindMany.mockResolvedValue([{ id: 13, price: 100, position: 'RB' }]);
    mockAuctionUpdate.mockResolvedValue({
      ...existingBid,
      draftId: 4,
      player: 'Josh Allen',
      nflTeam: 'BUF',
      sfRank: 1,
      notes: null,
      createdAt: new Date('2026-07-19T12:00:00.000Z'),
      updatedAt: new Date('2026-07-19T12:01:00.000Z'),
      deletedAt: null,
      supersededAt: null,
    });

    await expect(
      updateBidRecord({ userId: 'owner-1', draftId: 4, bidId: 12, teamId: 7, price: 899 }),
    ).resolves.toMatchObject({ ok: true });
    expect(mockAuctionFindMany).toHaveBeenCalledWith({
      where: { draftId: 4, teamId: 7, deletedAt: null, id: { not: 12 } },
      select: { id: true, price: true, position: true },
    });
    expect(mockAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'UPDATE', bidId: 12 }) }),
    );
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
  it('soft deletes and audits only the locked active draft result', async () => {
    mockAuctionFindFirst.mockResolvedValue({
      id: 12,
      draftId: 4,
      playerId: 10,
      player: 'Josh Allen',
      position: 'QB',
      nflTeam: 'BUF',
      price: 120,
      sfRank: 1,
      notes: null,
      teamId: 7,
      createdAt: new Date('2026-07-19T12:00:00.000Z'),
      updatedAt: new Date('2026-07-19T12:00:00.000Z'),
      deletedAt: null,
      supersededAt: null,
    });
    mockAuctionUpdate.mockResolvedValue({
      id: 12,
      draftId: 4,
      playerId: 10,
      player: 'Josh Allen',
      position: 'QB',
      nflTeam: 'BUF',
      price: 120,
      sfRank: 1,
      notes: null,
      teamId: 7,
      createdAt: new Date('2026-07-19T12:00:00.000Z'),
      updatedAt: new Date('2026-07-19T12:01:00.000Z'),
      deletedAt: new Date('2026-07-19T12:01:00.000Z'),
      supersededAt: null,
    });

    await expect(deleteBidRecord({ userId: 'owner-1', draftId: 4, bidId: 12 })).resolves.toEqual({
      ok: true,
      data: null,
    });
    expect(mockAuctionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 12 },
        data: { deletedAt: expect.any(Date) },
      }),
    );
    expect(mockAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'DELETE', bidId: 12 }) }),
    );
  });

  it('returns BID_NOT_FOUND when no row is deleted', async () => {
    mockAuctionDeleteMany.mockResolvedValue({ count: 0 });

    await expect(deleteBidRecord({ userId: 'owner-1', draftId: 4, bidId: 999 })).resolves.toEqual({
      ok: false,
      code: 'BID_NOT_FOUND',
    });
  });
});

describe('restoreBidRecord', () => {
  it('restores an unsuperseded deleted bid within the database recovery window and audits it', async () => {
    const deletedBid = {
      id: 12,
      draftId: 4,
      playerId: 10,
      player: 'Josh Allen',
      position: 'QB',
      nflTeam: 'BUF',
      price: 120,
      sfRank: 1,
      notes: null,
      teamId: 7,
      createdAt: new Date('2026-07-19T12:00:00.000Z'),
      updatedAt: new Date('2026-07-19T12:10:00.000Z'),
      deletedAt: new Date('2026-07-19T12:10:00.000Z'),
      supersededAt: null,
    };
    mockAuctionFindFirst.mockResolvedValueOnce(deletedBid).mockResolvedValueOnce(null);
    mockAuctionUpdate.mockResolvedValue({ ...deletedBid, deletedAt: null });

    await expect(restoreBidRecord({ userId: 'owner-1', draftId: 4, bidId: 12 })).resolves.toEqual({
      ok: true,
      data: { bidId: 12 },
    });
    expect(mockAuctionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 12 }, data: { deletedAt: null } }),
    );
    expect(mockAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'RESTORE', bidId: 12 }) }),
    );
  });

  it('rejects restoration at the database 30-minute boundary', async () => {
    mockAuctionFindFirst.mockResolvedValue({
      id: 12,
      draftId: 4,
      playerId: 10,
      position: 'QB',
      price: 120,
      teamId: 7,
      deletedAt: new Date('2026-07-19T11:50:00.000Z'),
      supersededAt: null,
    });

    await expect(restoreBidRecord({ userId: 'owner-1', draftId: 4, bidId: 12 })).resolves.toEqual({
      ok: false,
      code: 'RESTORE_WINDOW_EXPIRED',
    });
    expect(mockAuctionUpdate).not.toHaveBeenCalled();
  });

  it('rejects restoration when a replacement has permanently superseded the deleted bid', async () => {
    mockAuctionFindFirst.mockResolvedValue({
      id: 12,
      draftId: 4,
      playerId: 10,
      position: 'QB',
      price: 120,
      teamId: 7,
      deletedAt: new Date('2026-07-19T12:10:00.000Z'),
      supersededAt: new Date('2026-07-19T12:15:00.000Z'),
    });

    await expect(restoreBidRecord({ userId: 'owner-1', draftId: 4, bidId: 12 })).resolves.toEqual({
      ok: false,
      code: 'BID_SUPERSEDED',
    });
    expect(mockQueryRaw).not.toHaveBeenCalled();
    expect(mockAuctionUpdate).not.toHaveBeenCalled();
  });
});
