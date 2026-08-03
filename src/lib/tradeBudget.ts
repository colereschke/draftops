import type { Prisma, PrismaClient } from '@prisma/client';

export async function getTradeBudgetDeltaByTeamId(
  client: Prisma.TransactionClient | PrismaClient,
  draftId: number,
  options?: { excludeTradeId?: number },
): Promise<Map<number, number>> {
  const trades = await client.trade.findMany({
    where: {
      draftId,
      deletedAt: null,
      ...(options?.excludeTradeId === undefined ? {} : { id: { not: options.excludeTradeId } }),
    },
    select: { budgetTeamId: true, pickTeamId: true, budgetAmount: true },
  });

  const deltas = new Map<number, number>();
  for (const trade of trades) {
    deltas.set(trade.budgetTeamId, (deltas.get(trade.budgetTeamId) ?? 0) - trade.budgetAmount);
    deltas.set(trade.pickTeamId, (deltas.get(trade.pickTeamId) ?? 0) + trade.budgetAmount);
  }
  return deltas;
}
