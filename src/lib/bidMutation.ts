import type { Draft, Prisma } from '@prisma/client';
import {
  DraftMutationFailure,
  isPositiveSafeInteger,
  withActiveOwnedDraftMutation,
  type DraftMutationResult,
} from '@/lib/draftMutation';
import { createBidAuditEvent, toBidSnapshot, type AuditableBid } from '@/lib/bidAudit';
import { countsTowardRoster } from '@/lib/rosterPolicy';

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

export async function assertBidLegalInTransaction(
  tx: Prisma.TransactionClient,
  draft: Draft,
  input: BidLegalityInput,
): Promise<LegalBidState> {
  const [team, existingResults] = await Promise.all([
    tx.team.findFirst({
      where: { id: input.teamId, draftId: draft.id },
      select: { id: true, budget: true },
    }),
    tx.auctionResult.findMany({
      where: {
        draftId: draft.id,
        teamId: input.teamId,
        ...(input.excludeBidId === undefined ? {} : { id: { not: input.excludeBidId } }),
      },
      select: { id: true, price: true, position: true },
    }),
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
  const requiredRosterDollars = Math.max(0, draft.rosterSize - resultingRosterCount);
  if (team.budget - resultingSpend < requiredRosterDollars) {
    throw new DraftMutationFailure('BID_EXCEEDS_MAX');
  }

  return { teamId: team.id };
}

export async function createBidInTransaction(
  tx: Prisma.TransactionClient,
  draft: Draft,
  input: CreateBidInTransactionInput,
): Promise<{ bidId: number }> {
  await assertBidLegalInTransaction(tx, draft, {
    teamId: input.teamId,
    position: input.player.pos,
    price: input.price,
  });

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
): Promise<DraftMutationResult<{ bidId: number }>> {
  if (!hasValidCreateInput(input)) return { ok: false, code: 'INVALID_INPUT' };

  return withActiveOwnedDraftMutation(input.userId, input.draftId, async (tx, draft) => {
    const [player, existingResult] = await Promise.all([
      tx.player.findFirst({
        where: { id: input.playerId, draftId: draft.id },
        select: { id: true, name: true, pos: true, nflTeam: true, sfRank: true },
      }),
      tx.auctionResult.findFirst({
        where: { playerId: input.playerId, draftId: draft.id },
        select: { id: true },
      }),
    ]);
    if (!player) throw new DraftMutationFailure('PLAYER_NOT_FOUND');
    if (existingResult) throw new DraftMutationFailure('PLAYER_ALREADY_CLAIMED');

    return createBidInTransaction(tx, draft, {
      player,
      teamId: input.teamId,
      price: input.price,
      actorId: input.userId,
    });
  });
}

export async function updateBidRecord(
  input: UpdateBidRecordInput,
): Promise<DraftMutationResult<{ bidId: number }>> {
  if (!hasValidUpdateInput(input)) return { ok: false, code: 'INVALID_INPUT' };

  return withActiveOwnedDraftMutation(input.userId, input.draftId, async (tx, draft) => {
    const existingBid = await tx.auctionResult.findFirst({
      where: { id: input.bidId, draftId: draft.id },
      select: { id: true, playerId: true, position: true, price: true, teamId: true },
    });
    if (!existingBid) throw new DraftMutationFailure('BID_NOT_FOUND');

    await assertBidLegalInTransaction(tx, draft, {
      teamId: input.teamId,
      position: existingBid.position,
      price: input.price,
      excludeBidId: existingBid.id,
    });

    const updated = await tx.auctionResult.update({
      where: { id: existingBid.id },
      data: { price: input.price, teamId: input.teamId },
      select: { id: true },
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

    const deleted = await tx.auctionResult.update({
      where: { id: existingBid.id },
      data: { deletedAt: new Date() },
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

    const clock = await tx.$queryRaw<Array<{ now: Date }>>`SELECT transaction_timestamp() AS now`;
    if (bid.deletedAt.getTime() <= clock[0].now.getTime() - 30 * 60 * 1000) {
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
