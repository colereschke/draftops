import {
  deleteBid,
  deleteTrade,
  logBid,
  logTrade,
  restoreBid,
  restoreTrade,
  updateBid,
  updateTrade,
} from '@/lib/actions';

const mockAuth = jest.fn();
const mockRevalidatePath = jest.fn();
const mockCreateBidRecord = jest.fn();
const mockUpdateBidRecord = jest.fn();
const mockDeleteBidRecord = jest.fn();
const mockRestoreBidRecord = jest.fn();
const mockCreateTradeRecord = jest.fn();
const mockUpdateTradeRecord = jest.fn();
const mockDeleteTradeRecord = jest.fn();
const mockRestoreTradeRecord = jest.fn();

jest.mock('@/auth', () => ({ auth: () => mockAuth() }));
jest.mock('@/lib/db', () => ({ getPrisma: () => ({}) }));
jest.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => mockRevalidatePath(...args),
}));
jest.mock('@/lib/bidMutation', () => ({
  createBidRecord: (...args: unknown[]) => mockCreateBidRecord(...args),
  updateBidRecord: (...args: unknown[]) => mockUpdateBidRecord(...args),
  deleteBidRecord: (...args: unknown[]) => mockDeleteBidRecord(...args),
  restoreBidRecord: (...args: unknown[]) => mockRestoreBidRecord(...args),
}));
jest.mock('@/lib/tradeMutation', () => ({
  createTradeRecord: (...args: unknown[]) => mockCreateTradeRecord(...args),
  updateTradeRecord: (...args: unknown[]) => mockUpdateTradeRecord(...args),
  deleteTradeRecord: (...args: unknown[]) => mockDeleteTradeRecord(...args),
  restoreTradeRecord: (...args: unknown[]) => mockRestoreTradeRecord(...args),
}));

const SESSION = { user: { id: 'owner-1', name: 'Cole' } };

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockResolvedValue(SESSION);
  mockCreateBidRecord.mockResolvedValue({ ok: true, data: { bidId: 99 } });
  mockUpdateBidRecord.mockResolvedValue({ ok: true, data: { bidId: 12 } });
  mockDeleteBidRecord.mockResolvedValue({ ok: true, data: null });
  mockRestoreBidRecord.mockResolvedValue({ ok: true, data: { bidId: 12 } });
  mockCreateTradeRecord.mockResolvedValue({ ok: true, data: { tradeId: 501 } });
  mockUpdateTradeRecord.mockResolvedValue({ ok: true, data: { tradeId: 501 } });
  mockDeleteTradeRecord.mockResolvedValue({ ok: true, data: null });
  mockRestoreTradeRecord.mockResolvedValue({ ok: true, data: { tradeId: 501 } });
});

describe('restoreBid', () => {
  it('passes the bid ID to the serialized restore service and revalidates on success', async () => {
    await expect(restoreBid({ draftId: 4, id: 12 })).resolves.toEqual({
      ok: true,
      data: { bidId: 12 },
    });
    expect(mockRestoreBidRecord).toHaveBeenCalledWith({ userId: 'owner-1', draftId: 4, bidId: 12 });
    expect(mockRevalidatePath).toHaveBeenCalledWith('/draft/4');
  });
});

describe('logBid', () => {
  const input = { draftId: 4, playerId: 10, teamId: 7, price: 120 };

  it('returns a typed authorization failure without calling the mutation service', async () => {
    mockAuth.mockResolvedValue(null);

    await expect(logBid(input)).resolves.toEqual({ ok: false, code: 'UNAUTHORIZED' });
    expect(mockCreateBidRecord).not.toHaveBeenCalled();
  });

  it('passes authenticated input to the bid service and revalidates on success', async () => {
    await expect(logBid(input)).resolves.toEqual({ ok: true, data: { bidId: 99 } });
    expect(mockCreateBidRecord).toHaveBeenCalledWith({ ...input, userId: 'owner-1' });
    expect(mockRevalidatePath).toHaveBeenCalledWith('/draft/4');
  });

  it('returns a domain failure without revalidating', async () => {
    mockCreateBidRecord.mockResolvedValue({ ok: false, code: 'BID_EXCEEDS_MAX' });

    await expect(logBid(input)).resolves.toEqual({ ok: false, code: 'BID_EXCEEDS_MAX' });
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });
});

describe('updateBid', () => {
  const input = { draftId: 4, id: 12, teamId: 8, price: 95 };

  it('passes the bid ID to the serialized update service', async () => {
    await expect(updateBid(input)).resolves.toEqual({ ok: true, data: { bidId: 12 } });
    expect(mockUpdateBidRecord).toHaveBeenCalledWith({
      userId: 'owner-1',
      draftId: 4,
      bidId: 12,
      teamId: 8,
      price: 95,
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith('/draft/4');
  });

  it('returns a typed authorization failure', async () => {
    mockAuth.mockResolvedValue(null);

    await expect(updateBid(input)).resolves.toEqual({ ok: false, code: 'UNAUTHORIZED' });
    expect(mockUpdateBidRecord).not.toHaveBeenCalled();
  });
});

describe('deleteBid', () => {
  const input = { draftId: 4, id: 12 };

  it('passes the bid ID to the serialized delete service', async () => {
    await expect(deleteBid(input)).resolves.toEqual({ ok: true, data: null });
    expect(mockDeleteBidRecord).toHaveBeenCalledWith({
      userId: 'owner-1',
      draftId: 4,
      bidId: 12,
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith('/draft/4');
  });

  it('does not revalidate a lifecycle rejection', async () => {
    mockDeleteBidRecord.mockResolvedValue({ ok: false, code: 'DRAFT_COMPLETE' });

    await expect(deleteBid(input)).resolves.toEqual({ ok: false, code: 'DRAFT_COMPLETE' });
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });
});

describe('logTrade', () => {
  it('creates a trade and revalidates the teams page', async () => {
    mockCreateTradeRecord.mockResolvedValue({ ok: true, data: { tradeId: 501 } });
    const result = await logTrade({
      budgetTeamId: 7,
      pickTeamId: 9,
      budgetAmount: 80,
      picks: [{ originTeamId: 9, futurePickYear: 2028, futurePickRound: 1 }],
      draftId: 4,
    });
    expect(result).toEqual({ ok: true, data: { tradeId: 501 } });
    expect(mockRevalidatePath).toHaveBeenCalledWith('/draft/4/teams');
    expect(mockRevalidatePath).toHaveBeenCalledWith('/draft/4');
    expect(mockRevalidatePath).toHaveBeenCalledWith('/draft/4/budget');
  });

  it('returns UNAUTHORIZED without calling the mutation when unauthenticated', async () => {
    mockAuth.mockResolvedValue(null);
    const result = await logTrade({
      budgetTeamId: 7,
      pickTeamId: 9,
      budgetAmount: 80,
      picks: [{ originTeamId: 9, futurePickYear: 2028, futurePickRound: 1 }],
      draftId: 4,
    });
    expect(result).toEqual({ ok: false, code: 'UNAUTHORIZED' });
    expect(mockCreateTradeRecord).not.toHaveBeenCalled();
  });
});

describe('deleteTrade', () => {
  it('does not revalidate on failure', async () => {
    mockDeleteTradeRecord.mockResolvedValue({ ok: false, code: 'PICK_ALREADY_RETRADED' });
    const result = await deleteTrade({ id: 501, draftId: 4 });
    expect(result).toEqual({ ok: false, code: 'PICK_ALREADY_RETRADED' });
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });
});

describe('updateTrade', () => {
  const input = { id: 501, budgetAmount: 65, draftId: 4 };

  it('passes the trade ID to the serialized update service and revalidates all three surfaces', async () => {
    await expect(updateTrade(input)).resolves.toEqual({ ok: true, data: { tradeId: 501 } });
    expect(mockUpdateTradeRecord).toHaveBeenCalledWith({
      userId: 'owner-1',
      draftId: 4,
      tradeId: 501,
      budgetAmount: 65,
      notes: undefined,
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith('/draft/4');
    expect(mockRevalidatePath).toHaveBeenCalledWith('/draft/4/teams');
    expect(mockRevalidatePath).toHaveBeenCalledWith('/draft/4/budget');
  });

  it('returns a typed authorization failure without calling the mutation service', async () => {
    mockAuth.mockResolvedValue(null);

    await expect(updateTrade(input)).resolves.toEqual({ ok: false, code: 'UNAUTHORIZED' });
    expect(mockUpdateTradeRecord).not.toHaveBeenCalled();
  });
});

describe('restoreTrade', () => {
  it('passes the trade ID to the serialized restore service and revalidates all three surfaces', async () => {
    await expect(restoreTrade({ id: 501, draftId: 4 })).resolves.toEqual({
      ok: true,
      data: { tradeId: 501 },
    });
    expect(mockRestoreTradeRecord).toHaveBeenCalledWith({
      userId: 'owner-1',
      draftId: 4,
      tradeId: 501,
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith('/draft/4');
    expect(mockRevalidatePath).toHaveBeenCalledWith('/draft/4/teams');
    expect(mockRevalidatePath).toHaveBeenCalledWith('/draft/4/budget');
  });

  it('returns a typed authorization failure without calling the mutation service', async () => {
    mockAuth.mockResolvedValue(null);

    await expect(restoreTrade({ id: 501, draftId: 4 })).resolves.toEqual({
      ok: false,
      code: 'UNAUTHORIZED',
    });
    expect(mockRestoreTradeRecord).not.toHaveBeenCalled();
  });
});
