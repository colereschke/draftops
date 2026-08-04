import {
  DraftMutationFailure,
  completeOwnedDraft,
  withActiveOwnedDraftMutation,
} from '@/lib/draftMutation';
import type { AuctionResult, Draft, Trade, TradePickAsset } from '@prisma/client';

interface TradeWithPickAssets extends Trade {
  pickAssets: TradePickAsset[];
}

type SerializedDraft = Omit<Draft, 'createdAt'> & { createdAt: string };
type SerializedAuctionResult = Omit<
  AuctionResult,
  'createdAt' | 'updatedAt' | 'deletedAt' | 'supersededAt'
> & {
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  supersededAt: string | null;
};
type SerializedTrade = Omit<TradeWithPickAssets, 'createdAt' | 'updatedAt' | 'deletedAt'> & {
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

interface CompletionSnapshotV2Payload {
  draft: SerializedDraft;
  auctionResults: SerializedAuctionResult[];
  trades: SerializedTrade[];
}

const mockTransaction = jest.fn();
const mockExecuteRaw = jest.fn();
const mockDraftFindFirst = jest.fn();
const mockDraftUpdate = jest.fn();
const mockAuctionResultFindMany = jest.fn();
const mockTradeFindMany = jest.fn();
const mockSnapshotCreate = jest.fn();

const mockTx = {
  $executeRaw: mockExecuteRaw,
  draft: {
    findFirst: mockDraftFindFirst,
    update: mockDraftUpdate,
  },
  auctionResult: {
    findMany: mockAuctionResultFindMany,
  },
  trade: {
    findMany: mockTradeFindMany,
  },
  draftCompletionSnapshot: {
    create: mockSnapshotCreate,
  },
};

jest.mock('@/lib/db', () => ({
  getPrisma: () => ({
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  }),
}));

const ACTIVE_DRAFT: Draft = {
  id: 4,
  name: 'Integrity Draft',
  ownerId: 'owner-1',
  ownerTeamId: 7,
  status: 'ACTIVE',
  createdAt: new Date('2026-07-16T00:00:00.000Z'),
  teamCount: 12,
  rosterSize: 30,
  budget: 1000,
  playerValueSourceBudget: 1000,
  startingLineup: null,
  scoringSettings: null,
  targetRoster: null,
  futurePickAuctionMode: 'PACKAGES',
  sleeperLeagueId: 'league-1',
  activeProjectionValueSetId: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockExecuteRaw.mockResolvedValue(1);
  mockDraftFindFirst.mockResolvedValue(ACTIVE_DRAFT);
  mockDraftUpdate.mockResolvedValue({ ...ACTIVE_DRAFT, status: 'COMPLETE' });
  mockAuctionResultFindMany.mockResolvedValue([]);
  mockTradeFindMany.mockResolvedValue([]);
  mockSnapshotCreate.mockResolvedValue({ id: 1, draftId: 4 });
  mockTransaction.mockImplementation((operation: (tx: typeof mockTx) => Promise<unknown>) =>
    operation(mockTx),
  );
});

describe('withActiveOwnedDraftMutation', () => {
  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid draft ID %p before opening a transaction',
    async (draftId) => {
      const operation = jest.fn();

      await expect(withActiveOwnedDraftMutation('owner-1', draftId, operation)).resolves.toEqual({
        ok: false,
        code: 'INVALID_INPUT',
      });
      expect(mockTransaction).not.toHaveBeenCalled();
      expect(operation).not.toHaveBeenCalled();
    },
  );

  it('takes the draft advisory lock before rechecking ownership', async () => {
    const operation = jest.fn().mockResolvedValue('written');

    await expect(withActiveOwnedDraftMutation('owner-1', 4, operation)).resolves.toEqual({
      ok: true,
      data: 'written',
    });

    expect(mockExecuteRaw).toHaveBeenCalledTimes(1);
    expect(mockExecuteRaw.mock.calls[0][0].join('')).toContain('pg_advisory_xact_lock');
    expect(mockExecuteRaw.mock.calls[0]).toEqual([expect.any(Array), 1_144_002_001, 4]);
    expect(mockExecuteRaw.mock.invocationCallOrder[0]).toBeLessThan(
      mockDraftFindFirst.mock.invocationCallOrder[0],
    );
    expect(mockDraftFindFirst).toHaveBeenCalledWith({
      where: { id: 4, ownerId: 'owner-1' },
    });
    expect(operation).toHaveBeenCalledWith(mockTx, ACTIVE_DRAFT);
  });

  it('returns NOT_FOUND without running the write when ownership does not match', async () => {
    mockDraftFindFirst.mockResolvedValue(null);
    const operation = jest.fn();

    await expect(withActiveOwnedDraftMutation('other-owner', 4, operation)).resolves.toEqual({
      ok: false,
      code: 'NOT_FOUND',
    });
    expect(operation).not.toHaveBeenCalled();
  });

  it('returns DRAFT_COMPLETE without running the write after the locked status recheck', async () => {
    mockDraftFindFirst.mockResolvedValue({ ...ACTIVE_DRAFT, status: 'COMPLETE' });
    const operation = jest.fn();

    await expect(withActiveOwnedDraftMutation('owner-1', 4, operation)).resolves.toEqual({
      ok: false,
      code: 'DRAFT_COMPLETE',
    });
    expect(operation).not.toHaveBeenCalled();
  });

  it('converts an expected domain failure into a typed result', async () => {
    const operation = jest
      .fn()
      .mockRejectedValue(new DraftMutationFailure('PLAYER_ALREADY_CLAIMED'));

    await expect(withActiveOwnedDraftMutation('owner-1', 4, operation)).resolves.toEqual({
      ok: false,
      code: 'PLAYER_ALREADY_CLAIMED',
    });
  });

  it('propagates unexpected infrastructure failures', async () => {
    const operation = jest.fn().mockRejectedValue(new Error('database unavailable'));

    await expect(withActiveOwnedDraftMutation('owner-1', 4, operation)).rejects.toThrow(
      'database unavailable',
    );
  });
});

describe('completeOwnedDraft', () => {
  it('captures a complete version 2 recovery payload before completing the draft', async () => {
    const activeBid: AuctionResult = {
      id: 12,
      draftId: 4,
      player: 'Josh Allen',
      playerId: 10,
      position: 'QB',
      nflTeam: 'BUF',
      price: 120,
      sfRank: null,
      notes: null,
      teamId: 7,
      createdAt: new Date('2026-07-16T01:00:00.000Z'),
      updatedAt: new Date('2026-07-16T01:00:00.000Z'),
      deletedAt: null,
      supersededAt: null,
    };
    const activeTrade: TradeWithPickAssets = {
      id: 21,
      draftId: 4,
      budgetTeamId: 7,
      pickTeamId: 9,
      budgetAmount: 75,
      notes: '2028 capital',
      createdAt: new Date('2026-07-23T12:00:00.000Z'),
      updatedAt: new Date('2026-07-23T13:00:00.000Z'),
      deletedAt: null,
      pickAssets: [
        {
          id: 31,
          tradeId: 21,
          draftId: 4,
          originTeamId: 9,
          futurePickYear: 2028,
          futurePickRound: 1,
        },
      ],
    };
    const payload: CompletionSnapshotV2Payload = {
      draft: { ...ACTIVE_DRAFT, createdAt: ACTIVE_DRAFT.createdAt.toISOString() },
      auctionResults: [
        {
          ...activeBid,
          createdAt: activeBid.createdAt.toISOString(),
          updatedAt: activeBid.updatedAt.toISOString(),
          deletedAt: null,
          supersededAt: null,
        },
      ],
      trades: [
        {
          ...activeTrade,
          createdAt: activeTrade.createdAt.toISOString(),
          updatedAt: activeTrade.updatedAt.toISOString(),
          deletedAt: null,
        },
      ],
    };
    mockAuctionResultFindMany.mockResolvedValue([activeBid]);
    mockTradeFindMany.mockResolvedValue([activeTrade]);

    await expect(completeOwnedDraft('owner-1', 4)).resolves.toEqual({ ok: true, data: null });

    expect(mockAuctionResultFindMany).toHaveBeenCalledWith({
      where: { draftId: 4, deletedAt: null },
      orderBy: { id: 'asc' },
    });
    expect(mockTradeFindMany).toHaveBeenCalledWith({
      where: { draftId: 4, deletedAt: null },
      include: { pickAssets: true },
      orderBy: { id: 'asc' },
    });
    expect(mockSnapshotCreate).toHaveBeenCalledWith({
      data: {
        draftId: 4,
        schemaVersion: 2,
        payload,
      },
    });
    expect(mockSnapshotCreate.mock.invocationCallOrder[0]).toBeLessThan(
      mockDraftUpdate.mock.invocationCallOrder[0],
    );
  });

  it('rolls back completion when snapshot creation fails', async () => {
    mockSnapshotCreate.mockRejectedValue(new Error('snapshot failed'));

    await expect(completeOwnedDraft('owner-1', 4)).rejects.toThrow('snapshot failed');
    expect(mockDraftUpdate).not.toHaveBeenCalled();
  });

  it('uses the same advisory lock namespace as draft mutations', async () => {
    await expect(completeOwnedDraft('owner-1', 4)).resolves.toEqual({
      ok: true,
      data: null,
    });

    expect(mockExecuteRaw.mock.calls[0]).toEqual([expect.any(Array), 1_144_002_001, 4]);
    expect(mockDraftUpdate).toHaveBeenCalledWith({
      where: { id: 4 },
      data: { status: 'COMPLETE' },
    });
  });

  it('is idempotent when the owned draft is already complete', async () => {
    mockDraftFindFirst.mockResolvedValue({ ...ACTIVE_DRAFT, status: 'COMPLETE' });

    await expect(completeOwnedDraft('owner-1', 4)).resolves.toEqual({
      ok: true,
      data: null,
    });
    expect(mockDraftUpdate).not.toHaveBeenCalled();
  });

  it('returns NOT_FOUND when the draft is not owned', async () => {
    mockDraftFindFirst.mockResolvedValue(null);

    await expect(completeOwnedDraft('other-owner', 4)).resolves.toEqual({
      ok: false,
      code: 'NOT_FOUND',
    });
    expect(mockDraftUpdate).not.toHaveBeenCalled();
  });
});

describe('new trade mutation codes', () => {
  it.each([
    'TRADE_NOT_FOUND',
    'TRADE_NOT_DELETED',
    'TRADE_EXCEEDS_BUDGET',
    'PICK_NOT_HELD',
    'PICK_ALREADY_RETRADED',
    'PICK_HAS_ACTIVE_TRADES',
  ] as const)('constructs a DraftMutationFailure with code %s', (code) => {
    const failure = new DraftMutationFailure(code);
    expect(failure.code).toBe(code);
  });
});
