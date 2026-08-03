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

export interface ResolvedPick {
  originTeamId: number;
  futurePickYear: number;
  futurePickRound: 1 | 2 | 3;
  holderTeamId: number;
  eventKind: PickAcquisitionKind;
  eventId: number | null;
}

export async function resolveAllPickHolders(
  client: PrismaClientLike,
  draftId: number,
): Promise<ResolvedPick[]> {
  const [tradedAssets, wonResults, teams] = await Promise.all([
    client.tradePickAsset.findMany({
      where: { draftId, trade: { deletedAt: null } },
      select: {
        originTeamId: true,
        futurePickYear: true,
        futurePickRound: true,
        tradeId: true,
        trade: { select: { budgetTeamId: true, createdAt: true } },
      },
    }),
    client.auctionResult.findMany({
      where: {
        draftId,
        deletedAt: null,
        playerRow: { futurePickAssetKind: { in: ['package', 'pick'] } },
      },
      select: {
        id: true,
        teamId: true,
        playerRow: {
          select: {
            futurePickOriginHandle: true,
            futurePickYear: true,
            futurePickRound: true,
            futurePickAssetKind: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' }, // ascending, so the later `auctionByKey.set` for a duplicate
      // key (see below) deterministically keeps the most recent win, matching resolvePickHolder's
      // single-row equivalent
    }),
    client.team.findMany({ where: { draftId }, select: { id: true, handle: true } }),
  ]);

  const teamIdByHandle = new Map(teams.map((team) => [team.handle, team.id]));

  // Sort ascending by trade.createdAt so each key ends up holding its most recent trade —
  // a later Map.set for the same key simply overwrites the earlier one.
  const sortedAssets = [...tradedAssets].sort(
    (a, b) => a.trade.createdAt.getTime() - b.trade.createdAt.getTime(),
  );
  const latestTradeByKey = new Map<string, ResolvedPick>();
  for (const asset of sortedAssets) {
    if (asset.futurePickRound < 1 || asset.futurePickRound > 3) continue;
    const round = asset.futurePickRound as 1 | 2 | 3;
    const key = `${asset.originTeamId}:${asset.futurePickYear}:${round}`;
    latestTradeByKey.set(key, {
      originTeamId: asset.originTeamId,
      futurePickYear: asset.futurePickYear,
      futurePickRound: round,
      // budgetTeamId is the new holder — it sent budget and received the pick.
      holderTeamId: asset.trade.budgetTeamId,
      eventKind: 'trade',
      eventId: asset.tradeId,
    });
  }

  const auctionByKey = new Map<string, ResolvedPick>();
  for (const win of wonResults) {
    const originTeamId = teamIdByHandle.get(win.playerRow.futurePickOriginHandle ?? '');
    const year = win.playerRow.futurePickYear;
    if (originTeamId === undefined || year === null) continue;
    const rounds: Array<1 | 2 | 3> =
      win.playerRow.futurePickAssetKind === 'package'
        ? [1, 2, 3]
        : win.playerRow.futurePickRound !== null
          ? [win.playerRow.futurePickRound as 1 | 2 | 3]
          : [];
    for (const round of rounds) {
      const key = `${originTeamId}:${year}:${round}`;
      auctionByKey.set(key, {
        originTeamId,
        futurePickYear: year,
        futurePickRound: round,
        holderTeamId: win.teamId,
        eventKind: 'auction',
        eventId: win.id,
      });
    }
  }

  const merged = new Map<string, ResolvedPick>(auctionByKey);
  for (const [key, pick] of latestTradeByKey) merged.set(key, pick);
  return [...merged.values()];
}

export interface PickGroup {
  originTeamId: number;
  futurePickYear: number;
  holderTeamId: number;
  isIntactPackage: boolean;
  rounds: ResolvedPick[];
}

export function groupResolvedPicks(picks: ResolvedPick[]): PickGroup[] {
  const byOriginYear = new Map<string, ResolvedPick[]>();
  for (const pick of picks) {
    const key = `${pick.originTeamId}:${pick.futurePickYear}`;
    const existing = byOriginYear.get(key);
    if (existing) existing.push(pick);
    else byOriginYear.set(key, [pick]);
  }

  const groups: PickGroup[] = [];
  for (const rounds of byOriginYear.values()) {
    const [first, ...rest] = rounds;
    const sameHolder = rest.every((round) => round.holderTeamId === first.holderTeamId);
    const sameEvent = rest.every(
      (round) => round.eventKind === first.eventKind && round.eventId === first.eventId,
    );
    const isIntactPackage = rounds.length === 3 && sameHolder && sameEvent;

    if (isIntactPackage) {
      groups.push({
        originTeamId: first.originTeamId,
        futurePickYear: first.futurePickYear,
        holderTeamId: first.holderTeamId,
        isIntactPackage: true,
        rounds,
      });
    } else {
      for (const round of rounds) {
        groups.push({
          originTeamId: round.originTeamId,
          futurePickYear: round.futurePickYear,
          holderTeamId: round.holderTeamId,
          isIntactPackage: false,
          rounds: [round],
        });
      }
    }
  }
  return groups;
}
