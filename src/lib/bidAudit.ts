import { Prisma, type BidAuditEventType } from '@prisma/client';

export interface AuditableBid {
  id: number;
  draftId: number;
  playerId: number;
  player: string;
  position: string;
  nflTeam: string;
  price: number;
  sfRank: number | null;
  notes: string | null;
  teamId: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  supersededAt: Date | null;
}

export interface BidSnapshot {
  id: number;
  draftId: number;
  playerId: number;
  player: string;
  position: string;
  nflTeam: string;
  price: number;
  sfRank: number | null;
  notes: string | null;
  teamId: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  supersededAt: string | null;
}

export interface BidAuditInput {
  draftId: number;
  bidId: number;
  actorId: string;
  type: BidAuditEventType;
  before: BidSnapshot | null;
  after: BidSnapshot | null;
}

export function toBidSnapshot(bid: AuditableBid): BidSnapshot {
  return {
    id: bid.id,
    draftId: bid.draftId,
    playerId: bid.playerId,
    player: bid.player,
    position: bid.position,
    nflTeam: bid.nflTeam,
    price: bid.price,
    sfRank: bid.sfRank,
    notes: bid.notes,
    teamId: bid.teamId,
    createdAt: bid.createdAt.toISOString(),
    updatedAt: bid.updatedAt.toISOString(),
    deletedAt: bid.deletedAt?.toISOString() ?? null,
    supersededAt: bid.supersededAt?.toISOString() ?? null,
  };
}

export async function createBidAuditEvent(
  tx: Prisma.TransactionClient,
  input: BidAuditInput,
): Promise<void> {
  await tx.bidAuditEvent.create({
    data: {
      draftId: input.draftId,
      bidId: input.bidId,
      actorId: input.actorId,
      type: input.type,
      before: input.before ? (input.before as unknown as Prisma.InputJsonObject) : Prisma.JsonNull,
      after: input.after ? (input.after as unknown as Prisma.InputJsonObject) : Prisma.JsonNull,
    },
  });
}
