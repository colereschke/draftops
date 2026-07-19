import { applyProjectionValuesToDraft } from '@/lib/projectionApplication';

jest.mock('@/lib/draftLock', () => ({ lockDraftForMutation: jest.fn() }));

const mockDraftFindUnique = jest.fn();
const mockDraftUpdate = jest.fn();
const mockProjectionSourceFindFirst = jest.fn();
const mockPlayerFindMany = jest.fn();
const mockPlayerUpdate = jest.fn();
const mockPlayerProjectionFindMany = jest.fn();
const mockValueSetCreate = jest.fn();
const mockValueSetFindUnique = jest.fn();
const mockValueSetFindMany = jest.fn();
const mockValueSetUpdateMany = jest.fn();
const mockDraftPlayerValueCreateMany = jest.fn();
const mockDraftPlayerValueDeleteMany = jest.fn();
const mockDraftPlayerValueCount = jest.fn();
const mockTransaction = jest.fn();

const prisma = {
  draft: { findUnique: mockDraftFindUnique, update: mockDraftUpdate },
  projectionSource: { findFirst: mockProjectionSourceFindFirst },
  player: { findMany: mockPlayerFindMany, update: mockPlayerUpdate },
  playerProjection: { findMany: mockPlayerProjectionFindMany },
  draftProjectionValueSet: {
    create: mockValueSetCreate,
    findUnique: mockValueSetFindUnique,
    findMany: mockValueSetFindMany,
    updateMany: mockValueSetUpdateMany,
  },
  draftPlayerValue: {
    createMany: mockDraftPlayerValueCreateMany,
    deleteMany: mockDraftPlayerValueDeleteMany,
    count: mockDraftPlayerValueCount,
  },
  $transaction: mockTransaction,
};

const draft = {
  id: 5,
  teamCount: 12,
  rosterSize: 30,
  budget: 1000,
  startingLineup: ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'FLEX', 'FLEX', 'SUPER_FLEX'],
  scoringSettings: {
    passYdsPerPoint: 25,
    passTD: 4,
    passInt: -2,
    rushAtt: 0,
    rushFD: 0,
    pprRB: 1,
    pprWR: 1,
    pprTE: 2,
    recFD: 0,
    rbFDBonus: 0,
    wrFDBonus: 0,
    teFDBonus: 0,
  },
  targetRoster: { QB: 4, RB: 9, WR: 11, TE: 3 },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockDraftFindUnique.mockImplementation(async (args) =>
    args.select.activeProjectionValueSetId ? { activeProjectionValueSetId: 10 } : draft,
  );
  mockProjectionSourceFindFirst.mockResolvedValue({ id: 7 });
  mockPlayerFindMany.mockResolvedValue([
    { id: 1, name: 'Josh Allen', pos: 'QB', sleeperId: '10', budget: 255 },
    { id: 2, name: 'Missing Projection', pos: 'WR', sleeperId: null, budget: 20 },
  ]);
  mockPlayerProjectionFindMany.mockResolvedValue([
    {
      sleeperId: '10',
      position: 'QB',
      games: 17,
      passAtt: 520,
      passCmp: 330,
      passYds: 4100,
      passTd: 30,
      passInt: 10,
      passSacks: 35,
      rushAtt: 110,
      rushYds: 550,
      rushTd: 8,
      targets: 0,
      receptions: 0,
      recYds: 0,
      recTd: 0,
      baseFantasyPoints: 0,
      projectionRank: 1,
      isRookie: false,
    },
  ]);
  mockValueSetCreate.mockResolvedValue({ id: 11 });
  mockValueSetFindUnique.mockResolvedValue({
    id: 11,
    draftId: 5,
    projectionSourceId: 7,
    status: 'STAGING',
    expectedPlayerCount: 1,
  });
  mockValueSetFindMany.mockResolvedValue([]);
  mockValueSetUpdateMany.mockResolvedValue({ count: 1 });
  mockDraftPlayerValueCreateMany.mockResolvedValue({ count: 1 });
  mockDraftPlayerValueDeleteMany.mockResolvedValue({ count: 0 });
  mockDraftPlayerValueCount.mockResolvedValue(1);
  mockDraftUpdate.mockResolvedValue({});
  mockPlayerUpdate.mockResolvedValue({});
  mockTransaction.mockImplementation(async (operation) => operation(prisma));
});

it('stages and activates the latest stored projection source', async () => {
  const result = await applyProjectionValuesToDraft(prisma, { draftId: 5 });

  expect(mockValueSetCreate).toHaveBeenCalledWith({
    data: {
      draftId: 5,
      projectionSourceId: 7,
      status: 'STAGING',
      expectedPlayerCount: 1,
    },
    select: { id: true },
  });
  expect(mockDraftPlayerValueCreateMany).toHaveBeenCalledWith({
    data: [
      expect.objectContaining({
        draftId: 5,
        playerId: 1,
        projectionSourceId: 7,
        valueSetId: 11,
      }),
    ],
  });
  expect(result).toEqual({
    valueSetId: 11,
    projectionSourceId: 7,
    appliedCount: 1,
    activatedAt: expect.any(Date),
  });
  expect(mockTransaction).toHaveBeenCalledTimes(1);
});

it('creates a distinct immutable set when reapplying the same source', async () => {
  mockValueSetCreate.mockResolvedValueOnce({ id: 11 }).mockResolvedValueOnce({ id: 12 });
  mockValueSetFindUnique
    .mockResolvedValueOnce({
      id: 11,
      draftId: 5,
      projectionSourceId: 7,
      status: 'STAGING',
      expectedPlayerCount: 1,
    })
    .mockResolvedValueOnce({
      id: 12,
      draftId: 5,
      projectionSourceId: 7,
      status: 'STAGING',
      expectedPlayerCount: 1,
    });

  await applyProjectionValuesToDraft(prisma, { draftId: 5 });
  await applyProjectionValuesToDraft(prisma, { draftId: 5 });

  expect(mockValueSetCreate).toHaveBeenCalledTimes(2);
  expect(mockDraftPlayerValueCreateMany).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({ data: [expect.objectContaining({ valueSetId: 11 })] }),
  );
  expect(mockDraftPlayerValueCreateMany).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({ data: [expect.objectContaining({ valueSetId: 12 })] }),
  );
});

it('activates inside a caller-owned transaction without opening a nested transaction', async () => {
  const result = await applyProjectionValuesToDraft(prisma, {
    draftId: 5,
    mode: 'transaction',
  });

  expect(result).toMatchObject({ valueSetId: 11, projectionSourceId: 7, appliedCount: 1 });
  expect(mockTransaction).not.toHaveBeenCalled();
});

it('throws a typed failure when no projection source exists', async () => {
  mockProjectionSourceFindFirst.mockResolvedValue(null);

  await expect(applyProjectionValuesToDraft(prisma, { draftId: 5 })).rejects.toMatchObject({
    code: 'NO_PROJECTION_SOURCE',
  });
});

it('throws a typed failure before staging when no players join the source', async () => {
  mockPlayerProjectionFindMany.mockResolvedValue([]);

  await expect(applyProjectionValuesToDraft(prisma, { draftId: 5 })).rejects.toMatchObject({
    code: 'NO_JOINED_PLAYERS',
  });
  expect(mockValueSetCreate).not.toHaveBeenCalled();
});

it('marks a staged root-client candidate failed when persistence rejects', async () => {
  mockDraftPlayerValueCreateMany.mockRejectedValue(new Error('write failed'));

  await expect(applyProjectionValuesToDraft(prisma, { draftId: 5 })).rejects.toMatchObject({
    code: 'PERSISTENCE_FAILURE',
  });
  expect(mockDraftPlayerValueDeleteMany).toHaveBeenCalledWith({
    where: { draftId: 5, valueSetId: 11 },
  });
  expect(mockValueSetUpdateMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { id: 11, draftId: 5, status: 'STAGING' },
      data: expect.objectContaining({ status: 'FAILED', failureCode: 'PERSISTENCE_FAILURE' }),
    }),
  );
  expect(mockTransaction).toHaveBeenCalledTimes(1);
});

it('returns a typed persistence failure when candidate creation rejects', async () => {
  mockValueSetCreate.mockRejectedValue(new Error('set create failed'));

  await expect(applyProjectionValuesToDraft(prisma, { draftId: 5 })).rejects.toMatchObject({
    code: 'PERSISTENCE_FAILURE',
    message: expect.stringContaining('set create failed'),
  });
  expect(mockDraftPlayerValueDeleteMany).not.toHaveBeenCalled();
  expect(mockTransaction).not.toHaveBeenCalled();
});
