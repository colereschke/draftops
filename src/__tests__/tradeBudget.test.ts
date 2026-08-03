import { getTradeBudgetDeltaByTeamId } from '@/lib/tradeBudget';

const mockTradeFindMany = jest.fn();
jest.mock('@/lib/db', () => ({
  getPrisma: () => ({ trade: { findMany: mockTradeFindMany } }),
}));
const client = { trade: { findMany: mockTradeFindMany } } as never;

beforeEach(() => jest.clearAllMocks());

describe('getTradeBudgetDeltaByTeamId', () => {
  it('sums negative for budgetTeam and positive for pickTeam across trades', async () => {
    mockTradeFindMany.mockResolvedValue([
      { id: 1, budgetTeamId: 5, pickTeamId: 9, budgetAmount: 80 },
      { id: 2, budgetTeamId: 9, pickTeamId: 5, budgetAmount: 20 },
    ]);
    const deltas = await getTradeBudgetDeltaByTeamId(client, 1);
    expect(deltas.get(5)).toBe(-80 + 20);
    expect(deltas.get(9)).toBe(80 - 20);
  });

  it('excludes the given trade id when computing the sum', async () => {
    mockTradeFindMany.mockResolvedValue([
      { id: 1, budgetTeamId: 5, pickTeamId: 9, budgetAmount: 80 },
    ]);
    await getTradeBudgetDeltaByTeamId(client, 1, { excludeTradeId: 1 });
    expect(mockTradeFindMany.mock.calls[0][0].where).toMatchObject({
      draftId: 1,
      deletedAt: null,
      id: { not: 1 },
    });
  });
});
