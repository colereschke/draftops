import type { Draft, Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { lockDraftForMutation } from '@/lib/draftLock';

export type DraftMutationCode =
  | 'UNAUTHORIZED'
  | 'INVALID_INPUT'
  | 'NOT_FOUND'
  | 'DRAFT_COMPLETE'
  | 'TEAM_NOT_FOUND'
  | 'PLAYER_NOT_FOUND'
  | 'BID_NOT_FOUND'
  | 'BID_NOT_DELETED'
  | 'BID_SUPERSEDED'
  | 'RESTORE_WINDOW_EXPIRED'
  | 'PLAYER_ALREADY_CLAIMED'
  | 'ROSTER_FULL'
  | 'BID_EXCEEDS_MAX'
  | 'NO_RANKING_SET'
  | 'DUPLICATE_TEAM';

export type DraftMutationResult<T> = { ok: true; data: T } | { ok: false; code: DraftMutationCode };

export class DraftMutationFailure extends Error {
  code: DraftMutationCode;

  constructor(code: DraftMutationCode) {
    super(code);
    this.name = 'DraftMutationFailure';
    this.code = code;
  }
}

export function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

export async function withActiveOwnedDraftMutation<T>(
  userId: string,
  draftId: number,
  operation: (tx: Prisma.TransactionClient, draft: Draft) => Promise<T>,
): Promise<DraftMutationResult<T>> {
  if (!isPositiveSafeInteger(draftId)) return { ok: false, code: 'INVALID_INPUT' };

  try {
    return await prisma.$transaction(async (tx) => {
      await lockDraftForMutation(tx, draftId);
      const draft = await tx.draft.findFirst({ where: { id: draftId, ownerId: userId } });
      if (!draft) throw new DraftMutationFailure('NOT_FOUND');
      if (draft.status !== 'ACTIVE') throw new DraftMutationFailure('DRAFT_COMPLETE');

      return { ok: true, data: await operation(tx, draft) };
    });
  } catch (error) {
    if (error instanceof DraftMutationFailure) return { ok: false, code: error.code };
    throw error;
  }
}

export async function completeOwnedDraft(
  userId: string,
  draftId: number,
): Promise<DraftMutationResult<null>> {
  if (!isPositiveSafeInteger(draftId)) return { ok: false, code: 'INVALID_INPUT' };

  try {
    return await prisma.$transaction(async (tx) => {
      await lockDraftForMutation(tx, draftId);
      const draft = await tx.draft.findFirst({ where: { id: draftId, ownerId: userId } });
      if (!draft) throw new DraftMutationFailure('NOT_FOUND');

      if (draft.status === 'ACTIVE') {
        const auctionResults = await tx.auctionResult.findMany({
          where: { draftId: draft.id, deletedAt: null },
          orderBy: { id: 'asc' },
        });
        const payload = JSON.parse(
          JSON.stringify({ draft, auctionResults }),
        ) as Prisma.InputJsonValue;
        await tx.draftCompletionSnapshot.create({
          data: {
            draftId: draft.id,
            schemaVersion: 1,
            payload,
          },
        });
        await tx.draft.update({ where: { id: draft.id }, data: { status: 'COMPLETE' } });
      }
      return { ok: true, data: null };
    });
  } catch (error) {
    if (error instanceof DraftMutationFailure) return { ok: false, code: error.code };
    throw error;
  }
}
