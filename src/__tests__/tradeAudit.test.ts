import { createTradeAuditEvent, toTradeSnapshot } from '@/lib/tradeAudit';

const mockCreate = jest.fn();
const tx = { tradeAuditEvent: { create: mockCreate } } as never;

beforeEach(() => jest.clearAllMocks());

describe('toTradeSnapshot', () => {
  it('serializes dates to ISO strings and preserves null deletedAt', () => {
    const snapshot = toTradeSnapshot({
      id: 1,
      draftId: 4,
      budgetTeamId: 5,
      pickTeamId: 9,
      budgetAmount: 80,
      notes: null,
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
      updatedAt: new Date('2026-08-01T00:00:00.000Z'),
      deletedAt: null,
    });
    expect(snapshot.createdAt).toBe('2026-08-01T00:00:00.000Z');
    expect(snapshot.deletedAt).toBeNull();
  });
});

describe('createTradeAuditEvent', () => {
  it('creates a TradeAuditEvent row with the given type', async () => {
    await createTradeAuditEvent(tx, {
      draftId: 4,
      tradeId: 1,
      actorId: 'owner-1',
      type: 'CREATE',
      before: null,
      after: null,
    });
    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ draftId: 4, tradeId: 1, actorId: 'owner-1', type: 'CREATE' }),
    });
  });
});
