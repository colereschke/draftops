import { deleteBid, logBid, restoreBid, updateBid } from '@/lib/actions';

const mockAuth = jest.fn();
const mockRevalidatePath = jest.fn();
const mockCreateBidRecord = jest.fn();
const mockUpdateBidRecord = jest.fn();
const mockDeleteBidRecord = jest.fn();
const mockRestoreBidRecord = jest.fn();

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

const SESSION = { user: { id: 'owner-1', name: 'Cole' } };

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockResolvedValue(SESSION);
  mockCreateBidRecord.mockResolvedValue({ ok: true, data: { bidId: 99 } });
  mockUpdateBidRecord.mockResolvedValue({ ok: true, data: { bidId: 12 } });
  mockDeleteBidRecord.mockResolvedValue({ ok: true, data: null });
  mockRestoreBidRecord.mockResolvedValue({ ok: true, data: { bidId: 12 } });
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
