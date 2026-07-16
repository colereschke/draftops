import { applyProjectionValuesToDraft } from '@/lib/projectionApplication';

const mockDraftFindUnique = jest.fn();
const mockProjectionSourceFindFirst = jest.fn();
const mockPlayerFindMany = jest.fn();
const mockPlayerUpdate = jest.fn();
const mockPlayerProjectionFindMany = jest.fn();
const mockDraftPlayerValueDeleteMany = jest.fn();
const mockDraftPlayerValueUpsert = jest.fn();
const mockTransaction = jest.fn();

const prisma = {
  draft: { findUnique: mockDraftFindUnique },
  projectionSource: { findFirst: mockProjectionSourceFindFirst },
  player: { findMany: mockPlayerFindMany, update: mockPlayerUpdate },
  playerProjection: { findMany: mockPlayerProjectionFindMany },
  draftPlayerValue: {
    deleteMany: mockDraftPlayerValueDeleteMany,
    upsert: mockDraftPlayerValueUpsert,
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
  mockDraftFindUnique.mockResolvedValue(draft);
  mockProjectionSourceFindFirst.mockResolvedValue({
    id: 7,
    name: 'mike_clay',
    season: 2026,
    projectionDate: new Date('2026-06-01T00:00:00.000Z'),
  });
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
  mockTransaction.mockImplementation(async (operations) => Promise.all(operations));
  mockDraftPlayerValueDeleteMany.mockResolvedValue({ count: 0 });
  mockDraftPlayerValueUpsert.mockResolvedValue({});
});

it('applies the latest stored projection source to a draft', async () => {
  const result = await applyProjectionValuesToDraft(prisma, { draftId: 5 });

  expect(result).toEqual({ projectionSourceId: 7, appliedCount: 1 });
  expect(mockProjectionSourceFindFirst).toHaveBeenCalledWith({
    orderBy: [{ projectionDate: 'desc' }, { updatedAt: 'desc' }, { id: 'desc' }],
  });
  expect(mockPlayerProjectionFindMany).toHaveBeenCalledWith({
    where: { projectionSourceId: 7 },
  });
  expect(mockDraftPlayerValueDeleteMany).toHaveBeenCalledWith({
    where: { draftId: 5, projectionSourceId: 7, playerId: { notIn: [1] } },
  });
  expect(mockDraftPlayerValueUpsert).toHaveBeenCalledWith(
    expect.objectContaining({
      where: {
        draftId_playerId_projectionSourceId: {
          draftId: 5,
          playerId: 1,
          projectionSourceId: 7,
        },
      },
    }),
  );

  mockPlayerFindMany.mockResolvedValue([
    { id: 1, name: 'Josh Allen', pos: 'QB', sleeperId: '10', budget: 51 },
  ]);
  await applyProjectionValuesToDraft(prisma, { draftId: 5 });

  expect(mockDraftPlayerValueUpsert).toHaveBeenLastCalledWith(
    expect.objectContaining({
      create: expect.objectContaining({
        fallbackAuctionValue: 51,
        activeAuctionValue: 51,
      }),
      update: expect.objectContaining({
        fallbackAuctionValue: 51,
        activeAuctionValue: 51,
      }),
    }),
  );
});

it('applies values when called with a transaction client', async () => {
  const transactionPrisma = {
    draft: prisma.draft,
    projectionSource: prisma.projectionSource,
    player: prisma.player,
    playerProjection: prisma.playerProjection,
    draftPlayerValue: prisma.draftPlayerValue,
  };

  const result = await applyProjectionValuesToDraft(transactionPrisma, { draftId: 5 });

  expect(result).toEqual({ projectionSourceId: 7, appliedCount: 1 });
  expect(mockDraftPlayerValueUpsert).toHaveBeenCalledTimes(1);
  expect(mockTransaction).not.toHaveBeenCalled();
});

it('can skip batch transactions when running inside an outer transaction', async () => {
  const result = await applyProjectionValuesToDraft(prisma, {
    draftId: 5,
    useBatchTransaction: false,
  });

  expect(result).toEqual({ projectionSourceId: 7, appliedCount: 1 });
  expect(mockDraftPlayerValueUpsert).toHaveBeenCalledTimes(1);
  expect(mockTransaction).not.toHaveBeenCalled();
});

it('throws when no projection source exists', async () => {
  mockProjectionSourceFindFirst.mockResolvedValue(null);

  await expect(applyProjectionValuesToDraft(prisma, { draftId: 5 })).rejects.toThrow(
    'No projection source found',
  );
});

it('throws when no draft players can be joined to projections', async () => {
  mockPlayerProjectionFindMany.mockResolvedValue([]);

  await expect(applyProjectionValuesToDraft(prisma, { draftId: 5 })).rejects.toThrow(
    'No projection values could be applied to draft 5',
  );
});
