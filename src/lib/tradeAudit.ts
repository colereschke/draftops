import type { BidAuditEventType, Prisma } from '@prisma/client';

export interface AuditableTrade {
  id: number;
  draftId: number;
  budgetTeamId: number;
  pickTeamId: number;
  budgetAmount: number;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface TradeSnapshot {
  id: number;
  draftId: number;
  budgetTeamId: number;
  pickTeamId: number;
  budgetAmount: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface TradeAuditInput {
  draftId: number;
  tradeId: number;
  actorId: string;
  type: BidAuditEventType;
  before: TradeSnapshot | null;
  after: TradeSnapshot | null;
}

export function toTradeSnapshot(trade: AuditableTrade): TradeSnapshot {
  return {
    id: trade.id,
    draftId: trade.draftId,
    budgetTeamId: trade.budgetTeamId,
    pickTeamId: trade.pickTeamId,
    budgetAmount: trade.budgetAmount,
    notes: trade.notes,
    createdAt: trade.createdAt.toISOString(),
    updatedAt: trade.updatedAt.toISOString(),
    deletedAt: trade.deletedAt?.toISOString() ?? null,
  };
}

export async function createTradeAuditEvent(
  tx: Prisma.TransactionClient,
  input: TradeAuditInput,
): Promise<void> {
  await tx.tradeAuditEvent.create({
    data: {
      draftId: input.draftId,
      tradeId: input.tradeId,
      actorId: input.actorId,
      type: input.type,
      before: input.before
        ? (input.before as unknown as Prisma.InputJsonObject)
        : (null as unknown as Prisma.NullableJsonNullValueInput),
      after: input.after
        ? (input.after as unknown as Prisma.InputJsonObject)
        : (null as unknown as Prisma.NullableJsonNullValueInput),
    },
  });
}
