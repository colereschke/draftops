import type { Draft, Prisma } from '@prisma/client';
import {
  DraftMutationFailure,
  isPositiveSafeInteger,
  withActiveOwnedDraftMutation,
  type DraftMutationResult,
} from '@/lib/draftMutation';
import { createBidAuditEvent, toBidSnapshot, type AuditableBid } from '@/lib/bidAudit';
import { countsTowardRoster } from '@/lib/rosterPolicy';
import { getTradeBudgetDeltaByTeamId } from '@/lib/tradeBudget';

interface CreateBidRecordInput {
  userId: string;
  draftId: number;
  playerId: number;
  teamId: number;
  price: number;
}

interface UpdateBidRecordInput {
  userId: string;
  draftId: number;
  bidId: number;
  teamId: number;
  price: number;
}

interface DeleteBidRecordInput {
  userId: string;
  draftId: number;
  bidId: number;
}

interface RestoreBidRecordInput {
  userId: string;
  draftId: number;
  bidId: number;
}

export interface BidLegalityInput {
  teamId: number;
  position: string;
  price: number;
  excludeBidId?: number;
}

interface LegalBidState {
  teamId: number;
}

export interface BidPlayerMetadata {
  id: number;
  name: string;
  pos: string;
  nflTeam: string;
  sfRank: number;
}

interface CreateBidInTransactionInput {
  player: BidPlayerMetadata;
  teamId: number;
  price: number;
  actorId: string;
}

function hasValidCreateInput(input: CreateBidRecordInput): boolean {
  return (
    isPositiveSafeInteger(input.draftId) &&
    isPositiveSafeInteger(input.playerId) &&
    isPositiveSafeInteger(input.teamId) &&
    isPositiveSafeInteger(input.price)
  );
}

function hasValidUpdateInput(input: UpdateBidRecordInput): boolean {
  return (
    isPositiveSafeInteger(input.draftId) &&
    isPositiveSafeInteger(input.bidId) &&
    isPositiveSafeInteger(input.teamId) &&
    isPositiveSafeInteger(input.price)
  );
}

function isPlayerClaimUniqueConflict(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) return false;
  if ((error as { code?: unknown }).code !== 'P2002') return false;

  const target = (error as { meta?: { target?: unknown } }).meta?.target;
  return Array.isArray(target) && target.includes('draftId') && target.includes('playerId');
}

async function getTransactionTimestamp(tx: Prisma.TransactionClient): Promise<Date> {
  const clock = await tx.$queryRaw<Array<{ now: Date }>>`SELECT transaction_timestamp() AS now`;
  return clock[0].now;
}

async function assertNoLaterTradeDependsOnBid(
  tx: Prisma.TransactionClient,
  draftId: number,
  bid: { id: number; teamId: number; playerId: number; position: string; createdAt: Date },
): Promise<void> {
  if (bid.position !== 'PKG' && bid.position !== 'PICK') return;

  const playerRow = await tx.player.findFirst({
    where: { id: bid.playerId, draftId },
    select: { futurePickOriginHandle: true, futurePickYear: true, futurePickRound: true },
  });
  if (!playerRow?.futurePickOriginHandle || playerRow.futurePickYear === null) return;

  const origin = await tx.team.findFirst({
    where: { draftId, handle: playerRow.futurePickOriginHandle },
    select: { id: true },
  });
  if (!origin) return;

  const rounds =
    bid.position === 'PKG'
      ? [1, 2, 3]
      : playerRow.futurePickRound !== null
        ? [playerRow.futurePickRound]
        : [];
  if (rounds.length === 0) return;

  const laterTrade = await tx.tradePickAsset.findFirst({
    where: {
      draftId,
      originTeamId: origin.id,
      futurePickYear: playerRow.futurePickYear,
      futurePickRound: { in: rounds },
      trade: { deletedAt: null, createdAt: { gt: bid.createdAt } },
    },
    select: { id: true },
  });
  if (laterTrade) throw new DraftMutationFailure('PICK_HAS_ACTIVE_TRADES');
}

export async function assertBidLegalInTransaction(
  tx: Prisma.TransactionClient,
  draft: Draft,
  input: BidLegalityInput,
  prefetchedBudgetDeltaByTeamId?: ReadonlyMap<number, number>,
): Promise<LegalBidState> {
  const [team, existingResults, budgetDeltaByTeamId] = await Promise.all([
    tx.team.findFirst({
      where: { id: input.teamId, draftId: draft.id },
      select: { id: true, budget: true },
    }),
    tx.auctionResult.findMany({
      where: {
        draftId: draft.id,
        teamId: input.teamId,
        deletedAt: null,
        ...(input.excludeBidId === undefined ? {} : { id: { not: input.excludeBidId } }),
      },
      select: { id: true, price: true, position: true },
    }),
    prefetchedBudgetDeltaByTeamId
      ? Promise.resolve(prefetchedBudgetDeltaByTeamId)
      : getTradeBudgetDeltaByTeamId(tx, draft.id),
  ]);
  if (!team) throw new DraftMutationFailure('TEAM_NOT_FOUND');

  const currentSpend = existingResults.reduce((sum, result) => sum + result.price, 0);
  const currentRosterCount = existingResults.reduce(
    (count, result) => count + (countsTowardRoster(result.position) ? 1 : 0),
    0,
  );
  const resultingRosterCount = currentRosterCount + (countsTowardRoster(input.position) ? 1 : 0);
  if (resultingRosterCount > draft.rosterSize) {
    throw new DraftMutationFailure('ROSTER_FULL');
  }

  const resultingSpend = currentSpend + input.price;
  const netBudgetDelta = budgetDeltaByTeamId.get(team.id) ?? 0;
  const requiredRosterDollars = Math.max(0, draft.rosterSize - resultingRosterCount);
  if (team.budget + netBudgetDelta - resultingSpend < requiredRosterDollars) {
    throw new DraftMutationFailure('BID_EXCEEDS_MAX');
  }

  return { teamId: team.id };
}

export async function createBidInTransaction(
  tx: Prisma.TransactionClient,
  draft: Draft,
  input: CreateBidInTransactionInput,
  prefetchedBudgetDeltaByTeamId?: ReadonlyMap<number, number>,
): Promise<{ bidId: number }> {
  await assertBidLegalInTransaction(
    tx,
    draft,
    { teamId: input.teamId, position: input.player.pos, price: input.price },
    prefetchedBudgetDeltaByTeamId,
  );

  const deletedClaims = await tx.auctionResult.findMany({
    where: {
      playerId: input.player.id,
      draftId: draft.id,
      deletedAt: { not: null },
      supersededAt: null,
    },
  });
  const transactionTimestamp =
    deletedClaims.length > 0 ? await getTransactionTimestamp(tx) : undefined;
  for (const deletedClaim of deletedClaims) {
    const superseded = await tx.auctionResult.update({
      where: { id: deletedClaim.id },
      data: { supersededAt: transactionTimestamp, updatedAt: transactionTimestamp },
    });
    await createBidAuditEvent(tx, {
      draftId: draft.id,
      bidId: superseded.id,
      actorId: input.actorId,
      type: 'SUPERSEDE',
      before: toBidSnapshot(deletedClaim),
      after: toBidSnapshot(superseded),
    });
  }

  let bid: AuditableBid;
  try {
    bid = await tx.auctionResult.create({
      data: {
        player: input.player.name,
        playerId: input.player.id,
        position: input.player.pos,
        nflTeam: input.player.nflTeam,
        price: input.price,
        sfRank: input.player.sfRank,
        teamId: input.teamId,
        draftId: draft.id,
      },
    });
  } catch (error) {
    if (isPlayerClaimUniqueConflict(error)) {
      throw new DraftMutationFailure('PLAYER_ALREADY_CLAIMED');
    }
    throw error;
  }

  await createBidAuditEvent(tx, {
    draftId: draft.id,
    bidId: bid.id,
    actorId: input.actorId,
    type: 'CREATE',
    before: null,
    after: toBidSnapshot(bid),
  });

  await tx.nominatedPlayer.deleteMany({
    where: { playerId: input.player.id, draftId: draft.id },
  });
  return { bidId: bid.id };
}

export async function createBidRecord(
  input: CreateBidRecordInput,
  prefetchedBudgetDeltaByTeamId?: ReadonlyMap<number, number>,
): Promise<DraftMutationResult<{ bidId: number }>> {
  if (!hasValidCreateInput(input)) return { ok: false, code: 'INVALID_INPUT' };

  return withActiveOwnedDraftMutation(input.userId, input.draftId, async (tx, draft) => {
    const [player, existingResult] = await Promise.all([
      tx.player.findFirst({
        where: { id: input.playerId, draftId: draft.id },
        select: { id: true, name: true, pos: true, nflTeam: true, sfRank: true },
      }),
      tx.auctionResult.findFirst({
        where: { playerId: input.playerId, draftId: draft.id, deletedAt: null },
        select: { id: true },
      }),
    ]);
    if (!player) throw new DraftMutationFailure('PLAYER_NOT_FOUND');
    if (existingResult) throw new DraftMutationFailure('PLAYER_ALREADY_CLAIMED');

    return createBidInTransaction(
      tx,
      draft,
      { player, teamId: input.teamId, price: input.price, actorId: input.userId },
      prefetchedBudgetDeltaByTeamId,
    );
  });
}

export async function updateBidRecord(
  input: UpdateBidRecordInput,
): Promise<DraftMutationResult<{ bidId: number }>> {
  if (!hasValidUpdateInput(input)) return { ok: false, code: 'INVALID_INPUT' };

  return withActiveOwnedDraftMutation(input.userId, input.draftId, async (tx, draft) => {
    const existingBid = await tx.auctionResult.findFirst({
      where: { id: input.bidId, draftId: draft.id, deletedAt: null },
    });
    if (!existingBid) throw new DraftMutationFailure('BID_NOT_FOUND');

    if (existingBid.teamId !== input.teamId) {
      await assertNoLaterTradeDependsOnBid(tx, draft.id, existingBid);
    }

    await assertBidLegalInTransaction(tx, draft, {
      teamId: input.teamId,
      position: existingBid.position,
      price: input.price,
      excludeBidId: existingBid.id,
    });

    const updated = await tx.auctionResult.update({
      where: { id: existingBid.id },
      data: { price: input.price, teamId: input.teamId },
    });
    await createBidAuditEvent(tx, {
      draftId: draft.id,
      bidId: updated.id,
      actorId: input.userId,
      type: 'UPDATE',
      before: toBidSnapshot(existingBid),
      after: toBidSnapshot(updated),
    });
    return { bidId: updated.id };
  });
}

export async function deleteBidRecord(
  input: DeleteBidRecordInput,
): Promise<DraftMutationResult<null>> {
  if (!isPositiveSafeInteger(input.draftId) || !isPositiveSafeInteger(input.bidId)) {
    return { ok: false, code: 'INVALID_INPUT' };
  }

  return withActiveOwnedDraftMutation(input.userId, input.draftId, async (tx, draft) => {
    const existingBid = await tx.auctionResult.findFirst({
      where: { id: input.bidId, draftId: draft.id, deletedAt: null },
    });
    if (!existingBid) throw new DraftMutationFailure('BID_NOT_FOUND');

    await assertNoLaterTradeDependsOnBid(tx, draft.id, existingBid);

    const transactionTimestamp = await getTransactionTimestamp(tx);
    const deleted = await tx.auctionResult.update({
      where: { id: existingBid.id },
      data: { deletedAt: transactionTimestamp, updatedAt: transactionTimestamp },
    });
    await createBidAuditEvent(tx, {
      draftId: draft.id,
      bidId: deleted.id,
      actorId: input.userId,
      type: 'DELETE',
      before: toBidSnapshot(existingBid as AuditableBid),
      after: toBidSnapshot(deleted),
    });
    return null;
  });
}

export async function restoreBidRecord(
  input: RestoreBidRecordInput,
): Promise<DraftMutationResult<{ bidId: number }>> {
  if (!isPositiveSafeInteger(input.draftId) || !isPositiveSafeInteger(input.bidId)) {
    return { ok: false, code: 'INVALID_INPUT' };
  }

  return withActiveOwnedDraftMutation(input.userId, input.draftId, async (tx, draft) => {
    const bid = await tx.auctionResult.findFirst({
      where: { id: input.bidId, draftId: draft.id },
    });
    if (!bid) throw new DraftMutationFailure('BID_NOT_FOUND');
    if (bid.deletedAt === null) throw new DraftMutationFailure('BID_NOT_DELETED');
    if (bid.supersededAt !== null) throw new DraftMutationFailure('BID_SUPERSEDED');

    const transactionTimestamp = await getTransactionTimestamp(tx);
    if (bid.deletedAt.getTime() <= transactionTimestamp.getTime() - 30 * 60 * 1000) {
      throw new DraftMutationFailure('RESTORE_WINDOW_EXPIRED');
    }
    const activeClaim = await tx.auctionResult.findFirst({
      where: { draftId: draft.id, playerId: bid.playerId, deletedAt: null },
      select: { id: true },
    });
    if (activeClaim) throw new DraftMutationFailure('BID_SUPERSEDED');

    await assertBidLegalInTransaction(tx, draft, {
      teamId: bid.teamId,
      position: bid.position,
      price: bid.price,
    });
    const restored = await tx.auctionResult.update({
      where: { id: bid.id },
      data: { deletedAt: null },
    });
    await createBidAuditEvent(tx, {
      draftId: draft.id,
      bidId: restored.id,
      actorId: input.userId,
      type: 'RESTORE',
      before: toBidSnapshot(bid),
      after: toBidSnapshot(restored),
    });
    return { bidId: restored.id };
  });
}
