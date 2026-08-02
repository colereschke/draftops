import { applyProjectionValuesToDraft } from '@/lib/projectionApplication';
import { ProjectionApplicationFailure } from '@/lib/projectionValueSet';

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
const mockConsoleError = jest.fn();

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
  jest.spyOn(console, 'error').mockImplementation(mockConsoleError);
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

afterEach(() => {
  jest.restoreAllMocks();
});

it('stages candidate rows from stored projection stats using draft scoring', async () => {
  mockDraftFindUnique.mockImplementation(async (args) =>
    args.select.activeProjectionValueSetId
      ? { activeProjectionValueSetId: 10 }
      : {
          ...draft,
          scoringSettings: { ...draft.scoringSettings, passTD: 6 },
        },
  );
  mockPlayerFindMany.mockResolvedValue([
    { id: 1, name: 'Scored QB', pos: 'QB', sleeperId: '10', budget: 255 },
  ]);
  mockPlayerProjectionFindMany.mockResolvedValue([
    {
      sleeperId: '10',
      position: 'QB',
      games: 17,
      passAtt: 500,
      passCmp: 300,
      passYds: 4000,
      passTd: 20,
      passInt: 0,
      passSacks: 30,
      rushAtt: 0,
      rushYds: 0,
      rushTd: 0,
      targets: 0,
      receptions: 0,
      recYds: 0,
      recTd: 0,
      baseFantasyPoints: 0,
      projectionRank: 1,
      isRookie: false,
    },
  ]);

  await applyProjectionValuesToDraft(prisma, { draftId: 5 });

  expect(mockDraftPlayerValueCreateMany).toHaveBeenCalledWith({
    data: [
      expect.objectContaining({
        draftId: 5,
        playerId: 1,
        projectionSourceId: 7,
        projectedPoints: 280,
        fallbackAuctionValue: 255,
      }),
    ],
  });
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
  expect(mockTransaction).toHaveBeenCalledWith(expect.any(Function), { timeout: 60_000 });
});

it('orders resolved ID and value-row writes in batches before activation and pruning', async () => {
  const events: string[] = [];
  const resolvedPlayers = Array.from({ length: 51 }, (_, index) => ({
    id: index + 1,
    name: `Resolved Player ${index + 1}`,
    pos: 'QB',
    sleeperId: null,
    budget: 100,
  }));
  const storedProjections = resolvedPlayers.map((player, index) => ({
    sleeperId: `resolved-${player.id}`,
    position: 'QB',
    games: 17,
    passAtt: 500,
    passCmp: 300,
    passYds: 4000 + index,
    passTd: 25,
    passInt: 10,
    passSacks: 30,
    rushAtt: 50,
    rushYds: 250,
    rushTd: 3,
    targets: 0,
    receptions: 0,
    recYds: 0,
    recTd: 0,
    baseFantasyPoints: 0,
    projectionRank: index + 1,
    isRookie: false,
  }));
  const etrMatches = new Map(
    resolvedPlayers.map((player) => [player.name, `resolved-${player.id}`]),
  );

  mockDraftFindUnique.mockImplementation(async (args) => {
    if (args.select.activeProjectionValueSetId) return { activeProjectionValueSetId: 10 };
    events.push('draft.findUnique');
    return draft;
  });
  mockProjectionSourceFindFirst.mockImplementation(async () => {
    events.push('projectionSource.findFirst');
    return { id: 7 };
  });
  mockPlayerFindMany.mockImplementation(async () => {
    events.push('player.findMany');
    return resolvedPlayers;
  });
  let playerUpdateCalls = 0;
  let releaseFirstPlayerUpdateBatch: () => void = () => {};
  const firstPlayerUpdateBatchSettled = new Promise<void>((resolve) => {
    releaseFirstPlayerUpdateBatch = resolve;
  });
  let signalFirstPlayerUpdateBatchStarted: () => void = () => {};
  const firstPlayerUpdateBatchStarted = new Promise<void>((resolve) => {
    signalFirstPlayerUpdateBatchStarted = resolve;
  });
  mockPlayerUpdate.mockImplementation(async () => {
    playerUpdateCalls += 1;
    if (playerUpdateCalls === 1) events.push('player.update:batch-1');
    if (playerUpdateCalls === 50) signalFirstPlayerUpdateBatchStarted();
    if (playerUpdateCalls === 51) events.push('player.update:batch-2');
    if (playerUpdateCalls <= 50) await firstPlayerUpdateBatchSettled;
    return {};
  });
  mockPlayerProjectionFindMany.mockImplementation(async () => {
    events.push('playerProjection.findMany');
    return storedProjections;
  });
  mockValueSetCreate.mockImplementation(async () => {
    events.push('valueSet.create');
    return { id: 11 };
  });
  let valueRowBatchCalls = 0;
  mockDraftPlayerValueCreateMany.mockImplementation(async () => {
    valueRowBatchCalls += 1;
    events.push(`draftPlayerValue.createMany:batch-${valueRowBatchCalls}`);
    return { count: 50 };
  });
  mockTransaction.mockImplementation(async (operation) => {
    events.push('transaction:activate');
    return operation(prisma);
  });
  mockValueSetFindMany.mockImplementation(async () => {
    events.push('prune');
    return [];
  });

  const application = applyProjectionValuesToDraft(prisma, {
    draftId: 5,
    etrMatches,
    mode: 'staged',
  });
  await firstPlayerUpdateBatchStarted;

  expect(mockPlayerUpdate).toHaveBeenCalledTimes(50);
  releaseFirstPlayerUpdateBatch();
  await application;

  expect(events).toEqual([
    'draft.findUnique',
    'projectionSource.findFirst',
    'player.findMany',
    'player.update:batch-1',
    'player.update:batch-2',
    'playerProjection.findMany',
    'valueSet.create',
    'draftPlayerValue.createMany:batch-1',
    'draftPlayerValue.createMany:batch-2',
    'transaction:activate',
    'prune',
  ]);
  const [firstPlayerUpdateBatch, secondPlayerUpdateBatch] = [
    mockPlayerUpdate.mock.calls.slice(0, 50),
    mockPlayerUpdate.mock.calls.slice(50),
  ];
  expect(firstPlayerUpdateBatch).toHaveLength(50);
  expect(secondPlayerUpdateBatch).toHaveLength(1);
  expect(mockDraftPlayerValueCreateMany).toHaveBeenCalledTimes(2);
  expect(mockDraftPlayerValueCreateMany.mock.calls[0][0].data).toHaveLength(50);
  expect(mockDraftPlayerValueCreateMany.mock.calls[1][0].data).toHaveLength(1);
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

it('persists staged rows before rejecting a client without transaction support', async () => {
  const prismaWithoutTransaction = { ...prisma, $transaction: undefined };

  let activationError: unknown;
  try {
    await applyProjectionValuesToDraft(prismaWithoutTransaction, { draftId: 5 });
  } catch (error) {
    activationError = error;
  }

  expect(activationError).toMatchObject({
    code: 'PERSISTENCE_FAILURE',
    message: expect.stringContaining('transaction-capable'),
  });

  expect(mockValueSetCreate).toHaveBeenCalledTimes(1);
  expect(mockDraftPlayerValueCreateMany).toHaveBeenCalledTimes(1);
  expect(mockConsoleError).toHaveBeenCalledWith(
    expect.stringContaining('Failed to clean'),
    expect.any(Error),
  );
  const cleanupError = mockConsoleError.mock.calls[0][1];
  expect(cleanupError).not.toBe(activationError);
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

it('wraps generic row-write errors, retains their cause, and cleans the staged set', async () => {
  const writeFailure = new Error('write failed');
  mockDraftPlayerValueCreateMany.mockRejectedValue(writeFailure);

  await expect(applyProjectionValuesToDraft(prisma, { draftId: 5 })).rejects.toMatchObject({
    code: 'PERSISTENCE_FAILURE',
    message: expect.stringContaining('Failed to persist projection values'),
    cause: writeFailure,
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

it('wraps value-set creation failures without attempting cleanup', async () => {
  mockValueSetCreate.mockRejectedValue(new Error('set create failed'));

  await expect(applyProjectionValuesToDraft(prisma, { draftId: 5 })).rejects.toMatchObject({
    code: 'PERSISTENCE_FAILURE',
    message: expect.stringContaining('Failed to create a projection value set'),
  });
  expect(mockDraftPlayerValueDeleteMany).not.toHaveBeenCalled();
  expect(mockValueSetUpdateMany).not.toHaveBeenCalled();
  expect(mockTransaction).not.toHaveBeenCalled();
});

it('preserves an existing projection application failure from staged row writes', async () => {
  const writeFailure = new ProjectionApplicationFailure(
    'ACTIVATION_CONFLICT',
    'candidate no longer belongs to this draft',
  );
  mockDraftPlayerValueCreateMany.mockRejectedValue(writeFailure);

  await expect(applyProjectionValuesToDraft(prisma, { draftId: 5 })).rejects.toBe(writeFailure);

  expect(mockDraftPlayerValueDeleteMany).toHaveBeenCalledWith({
    where: { draftId: 5, valueSetId: 11 },
  });
});

it('does not open root transactions or clean up when a caller-owned transaction fails', async () => {
  mockDraftPlayerValueCreateMany.mockRejectedValue(new Error('transaction row write failed'));

  await expect(
    applyProjectionValuesToDraft(prisma, { draftId: 5, mode: 'transaction' }),
  ).rejects.toMatchObject({
    code: 'PERSISTENCE_FAILURE',
  });

  expect(mockTransaction).not.toHaveBeenCalled();
  expect(mockDraftPlayerValueDeleteMany).not.toHaveBeenCalled();
  expect(mockValueSetUpdateMany).not.toHaveBeenCalled();
});

it('returns activation results when pruning retained rows fails', async () => {
  const pruneFailure = new Error('retention unavailable');
  mockValueSetFindMany.mockRejectedValue(pruneFailure);

  const result = await applyProjectionValuesToDraft(prisma, { draftId: 5 });

  expect(result).toMatchObject({ valueSetId: 11, projectionSourceId: 7, appliedCount: 1 });
  expect(mockConsoleError).toHaveBeenCalledWith(
    expect.stringContaining('Failed to prune projection value rows'),
    pruneFailure,
  );
});

it('writes stored-stat scores and market-shaped values through the public application workflow', async () => {
  mockDraftFindUnique.mockImplementation(async (args) =>
    args.select.activeProjectionValueSetId
      ? { activeProjectionValueSetId: 10 }
      : {
          ...draft,
          scoringSettings: { ...draft.scoringSettings, passTD: 6 },
        },
  );
  mockPlayerFindMany.mockResolvedValue([
    { id: 1, name: 'Elite QB', pos: 'QB', sleeperId: '10', budget: 300 },
    { id: 2, name: 'Touchdown QB', pos: 'QB', sleeperId: '20', budget: 200 },
    { id: 3, name: 'Yardage QB', pos: 'QB', sleeperId: '30', budget: 100 },
    { id: 4, name: 'Depth Touchdown QB', pos: 'QB', sleeperId: '40', budget: 50 },
  ]);
  mockPlayerProjectionFindMany.mockResolvedValue([
    {
      sleeperId: '10',
      position: 'QB',
      games: 17,
      passAtt: 520,
      passCmp: 330,
      passYds: 4500,
      passTd: 30,
      passInt: 0,
      passSacks: 35,
      rushAtt: 0,
      rushYds: 0,
      rushTd: 0,
      targets: 0,
      receptions: 0,
      recYds: 0,
      recTd: 0,
      baseFantasyPoints: 0,
      projectionRank: 1,
      isRookie: false,
    },
    {
      sleeperId: '20',
      position: 'QB',
      games: 17,
      passAtt: 520,
      passCmp: 330,
      passYds: 4000,
      passTd: 40,
      passInt: 0,
      passSacks: 35,
      rushAtt: 0,
      rushYds: 0,
      rushTd: 0,
      targets: 0,
      receptions: 0,
      recYds: 0,
      recTd: 0,
      baseFantasyPoints: 0,
      projectionRank: 2,
      isRookie: false,
    },
    {
      sleeperId: '30',
      position: 'QB',
      games: 17,
      passAtt: 520,
      passCmp: 330,
      passYds: 4000,
      passTd: 10,
      passInt: 0,
      passSacks: 35,
      rushAtt: 0,
      rushYds: 0,
      rushTd: 0,
      targets: 0,
      receptions: 0,
      recYds: 0,
      recTd: 0,
      baseFantasyPoints: 0,
      projectionRank: 3,
      isRookie: false,
    },
    {
      sleeperId: '40',
      position: 'QB',
      games: 17,
      passAtt: 520,
      passCmp: 330,
      passYds: 0,
      passTd: 40,
      passInt: 0,
      passSacks: 35,
      rushAtt: 0,
      rushYds: 0,
      rushTd: 0,
      targets: 0,
      receptions: 0,
      recYds: 0,
      recTd: 0,
      baseFantasyPoints: 0,
      projectionRank: 4,
      isRookie: false,
    },
  ]);

  await applyProjectionValuesToDraft(prisma, { draftId: 5 });

  expect(mockDraftPlayerValueCreateMany).toHaveBeenCalledWith({
    data: expect.arrayContaining([
      expect.objectContaining({
        playerId: 3,
        projectedPoints: 220,
        fallbackAuctionValue: 100,
        activeAuctionValue: 90,
        valueSource: 'projection_adjusted_market',
      }),
    ]),
  });
});
