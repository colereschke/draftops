import { createTradeRecord, updateTradeRecord } from '@/lib/tradeMutation';

const mockTransaction = jest.fn();
const mockExecuteRaw = jest.fn();
const mockQueryRaw = jest.fn();
const mockDraftFindFirst = jest.fn();
const mockTeamFindFirst = jest.fn(); // serves both the budget-legality lookup and resolvePickHolder's origin-team lookup — both now call `team.findFirst`, since Task 5 fixed resolvePickHolder to use `findFirst` + an explicit `TEAM_NOT_FOUND` throw instead of `findFirstOrThrow`
const mockAuctionFindMany = jest.fn();
const mockAuctionFindFirst = jest.fn();
const mockTradeFindMany = jest.fn();
const mockTradeFindFirst = jest.fn(); // used by Tasks 13-15, declared here since the harness is shared
const mockTradePickAssetFindFirst = jest.fn();
const mockTradeCreate = jest.fn();
const mockTradeUpdate = jest.fn(); // used by Tasks 13-15
const mockTradeAuditCreate = jest.fn();

const mockTx = {
  $executeRaw: mockExecuteRaw,
  $queryRaw: mockQueryRaw,
  draft: { findFirst: mockDraftFindFirst },
  team: { findFirst: mockTeamFindFirst },
  auctionResult: { findMany: mockAuctionFindMany, findFirst: mockAuctionFindFirst },
  trade: {
    findMany: mockTradeFindMany,
    findFirst: mockTradeFindFirst,
    create: mockTradeCreate,
    update: mockTradeUpdate,
  },
  tradePickAsset: { findFirst: mockTradePickAssetFindFirst },
  tradeAuditEvent: { create: mockTradeAuditCreate },
};

jest.mock('@/lib/db', () => ({
  getPrisma: () => ({ $transaction: (...args: unknown[]) => mockTransaction(...args) }),
}));

const ACTIVE_DRAFT = {
  id: 4,
  ownerId: 'owner-1',
  ownerTeamId: 7,
  status: 'ACTIVE',
  rosterSize: 30,
};

const BASE_INPUT = {
  userId: 'owner-1',
  draftId: 4,
  budgetTeamId: 7,
  pickTeamId: 9,
  budgetAmount: 80,
  picks: [{ originTeamId: 9, futurePickYear: 2028, futurePickRound: 1 as const }],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockTransaction.mockImplementation((operation: (tx: typeof mockTx) => Promise<unknown>) =>
    operation(mockTx),
  );
  mockQueryRaw.mockResolvedValue([{ now: new Date('2026-08-02T00:00:00.000Z') }]);
  mockDraftFindFirst.mockResolvedValue(ACTIVE_DRAFT);
  // Includes both `budget` (for assertTeamCanAbsorbBudgetChange) and `handle` (for
  // resolvePickHolder's origin-team lookup) — the same mock now backs both call sites.
  mockTeamFindFirst.mockImplementation(({ where }: { where: { id: number } }) =>
    Promise.resolve({ id: where.id, budget: 1000, handle: 'origin-team' }),
  );
  mockAuctionFindMany.mockResolvedValue([]);
  mockAuctionFindFirst.mockResolvedValue(null);
  mockTradeFindMany.mockResolvedValue([]);
  mockTradeFindFirst.mockResolvedValue(null); // Tasks 13-15 override per test
  mockTradePickAssetFindFirst.mockResolvedValue(null); // no trade yet -> resolves to origin default
  mockTradeCreate.mockResolvedValue({
    id: 501,
    draftId: 4,
    budgetTeamId: 7,
    pickTeamId: 9,
    budgetAmount: 80,
    notes: null,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    deletedAt: null,
    pickAssets: [{ id: 1, originTeamId: 9, futurePickYear: 2028, futurePickRound: 1 }],
  });
  mockTradeUpdate.mockResolvedValue(undefined); // Tasks 13-15 override per test
});

describe('createTradeRecord', () => {
  it('creates a trade when the pick-team currently holds every submitted pick and budget is legal', async () => {
    const result = await createTradeRecord(BASE_INPUT);
    expect(result).toEqual({ ok: true, data: { tradeId: 501 } });
    expect(mockTradeCreate).toHaveBeenCalled();
  });

  it('rejects with PICK_NOT_HELD when the pick-team does not currently hold a submitted pick', async () => {
    mockTradePickAssetFindFirst.mockResolvedValue(null);
    // origin default resolves to originTeamId (9), but pickTeamId is also 9 in BASE_INPUT,
    // so make it fail by pointing pickTeamId elsewhere:
    const result = await createTradeRecord({ ...BASE_INPUT, pickTeamId: 11 });
    expect(result).toEqual({ ok: false, code: 'PICK_NOT_HELD' });
  });

  it('rejects with INVALID_INPUT when budgetAmount is not positive', async () => {
    const result = await createTradeRecord({ ...BASE_INPUT, budgetAmount: 0 });
    expect(result).toEqual({ ok: false, code: 'INVALID_INPUT' });
  });

  it('rejects with INVALID_INPUT when no picks are submitted', async () => {
    const result = await createTradeRecord({ ...BASE_INPUT, picks: [] });
    expect(result).toEqual({ ok: false, code: 'INVALID_INPUT' });
  });

  it('rejects with INVALID_INPUT when the same pick appears twice in one submission', async () => {
    const result = await createTradeRecord({
      ...BASE_INPUT,
      picks: [BASE_INPUT.picks[0], BASE_INPUT.picks[0]],
    });
    expect(result).toEqual({ ok: false, code: 'INVALID_INPUT' });
  });

  it('rejects with TEAM_NOT_FOUND when budgetTeamId equals pickTeamId', async () => {
    const result = await createTradeRecord({ ...BASE_INPUT, pickTeamId: BASE_INPUT.budgetTeamId });
    expect(result).toEqual({ ok: false, code: 'TEAM_NOT_FOUND' });
  });

  it('rejects with TRADE_EXCEEDS_BUDGET when budgetTeam cannot cover the amount', async () => {
    mockTeamFindFirst.mockImplementation(({ where }: { where: { id: number } }) =>
      Promise.resolve({ id: where.id, budget: 50 }),
    );
    const result = await createTradeRecord(BASE_INPUT); // 50 - 80 < 0
    expect(result).toEqual({ ok: false, code: 'TRADE_EXCEEDS_BUDGET' });
  });
});

const EXISTING_TRADE = {
  id: 501,
  draftId: 4,
  budgetTeamId: 7,
  pickTeamId: 9,
  budgetAmount: 80,
  notes: null,
  createdAt: new Date('2026-08-01T00:00:00.000Z'),
  updatedAt: new Date('2026-08-01T00:00:00.000Z'),
  deletedAt: null,
};

describe('updateTradeRecord', () => {
  beforeEach(() => {
    mockTradeFindFirst.mockResolvedValue(EXISTING_TRADE);
    mockTradeUpdate.mockResolvedValue({ ...EXISTING_TRADE, budgetAmount: 60 });
  });

  it('updates budgetAmount when both teams remain legal', async () => {
    const result = await updateTradeRecord({
      userId: 'owner-1',
      draftId: 4,
      tradeId: 501,
      budgetAmount: 60,
    });
    expect(result).toEqual({ ok: true, data: { tradeId: 501 } });
    expect(mockTradeUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ budgetAmount: 60 }) }),
    );
  });

  it('rejects with TRADE_EXCEEDS_BUDGET when the new amount exceeds budgetTeam capacity', async () => {
    mockTeamFindFirst.mockImplementation(({ where }: { where: { id: number } }) =>
      Promise.resolve({ id: where.id, budget: 50 }),
    );
    const result = await updateTradeRecord({
      userId: 'owner-1',
      draftId: 4,
      tradeId: 501,
      budgetAmount: 60,
    });
    expect(result).toEqual({ ok: false, code: 'TRADE_EXCEEDS_BUDGET' });
  });

  it('rejects with TRADE_NOT_FOUND for a missing or deleted trade', async () => {
    mockTradeFindFirst.mockResolvedValue(null);
    const result = await updateTradeRecord({
      userId: 'owner-1',
      draftId: 4,
      tradeId: 999,
      budgetAmount: 60,
    });
    expect(result).toEqual({ ok: false, code: 'TRADE_NOT_FOUND' });
  });

  it('preserves existing notes when the caller updates only the amount', async () => {
    mockTradeFindFirst.mockResolvedValue({ ...EXISTING_TRADE, notes: 'Pre-deadline swap' });
    const result = await updateTradeRecord({
      userId: 'owner-1',
      draftId: 4,
      tradeId: 501,
      budgetAmount: 60,
      // notes intentionally omitted — this is the shape TradeHistoryList's amount-only edit sends
    });
    expect(result).toEqual({ ok: true, data: { tradeId: 501 } });
    expect(mockTradeUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ notes: 'Pre-deadline swap' }) }),
    );
  });
});
