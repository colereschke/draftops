import type { Prisma, PrismaClient } from '@prisma/client';
import { DraftMutationFailure } from '@/lib/draftMutation';

type PrismaClientLike = Prisma.TransactionClient | PrismaClient;

export type PickAcquisitionKind = 'trade' | 'auction' | 'default';

export interface PickResolution {
  holderTeamId: number;
  eventKind: PickAcquisitionKind;
  eventId: number | null;
}

export async function resolvePickHolder(
  client: PrismaClientLike,
  draftId: number,
  originTeamId: number,
  futurePickYear: number,
  futurePickRound: 1 | 2 | 3,
): Promise<PickResolution> {
  const latestTrade = await client.tradePickAsset.findFirst({
    where: {
      draftId,
      originTeamId,
      futurePickYear,
      futurePickRound,
      trade: { deletedAt: null },
    },
    orderBy: { trade: { createdAt: 'desc' } },
    select: { tradeId: true, trade: { select: { budgetTeamId: true } } },
  });
  if (latestTrade) {
    // budgetTeamId sent budget and received the pick — it's the new holder. pickTeamId (the
    // seller) is only relevant to PICK_NOT_HELD, which checks who held the pick BEFORE this trade.
    return {
      holderTeamId: latestTrade.trade.budgetTeamId,
      eventKind: 'trade',
      eventId: latestTrade.tradeId,
    };
  }

  // findFirst + an explicit throw, not findFirstOrThrow — a stale or hand-crafted originTeamId
  // (e.g. a manually-entered off-book pick) should surface as a typed DraftMutationFailure that
  // callers already know how to handle, not a raw Prisma P2025 that propagates as an unhandled
  // rejection past withActiveOwnedDraftMutation's DraftMutationFailure-only catch.
  const origin = await client.team.findFirst({
    where: { id: originTeamId, draftId },
    select: { handle: true },
  });
  if (!origin) throw new DraftMutationFailure('TEAM_NOT_FOUND');

  const win = await client.auctionResult.findFirst({
    where: {
      draftId,
      deletedAt: null,
      playerRow: {
        futurePickOriginHandle: origin.handle,
        futurePickYear,
        OR: [{ futurePickAssetKind: 'package' }, { futurePickAssetKind: 'pick', futurePickRound }],
      },
    },
    select: { id: true, teamId: true },
    orderBy: { createdAt: 'desc' }, // deterministic: if both a PKG and a matching PICK row somehow
    // both have live wins for the same round (e.g. futurePickAuctionMode changed mid-draft), the
    // most recent one wins, rather than leaving it to whatever order Postgres happens to return
  });
  if (win) {
    return { holderTeamId: win.teamId, eventKind: 'auction', eventId: win.id };
  }

  return { holderTeamId: originTeamId, eventKind: 'default', eventId: null };
}

export async function getGeneratedPickYear(
  client: PrismaClientLike,
  draftId: number,
): Promise<number | null> {
  const result = await client.player.aggregate({
    where: { draftId },
    _max: { futurePickYear: true },
  });
  return result._max.futurePickYear;
}
