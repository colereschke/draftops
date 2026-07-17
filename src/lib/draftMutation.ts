import type { Draft, Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';

const DRAFT_MUTATION_LOCK_NAMESPACE = 1_144_002_001;

export type DraftMutationCode =
  | 'UNAUTHORIZED'
  | 'INVALID_INPUT'
  | 'NOT_FOUND'
  | 'DRAFT_COMPLETE'
  | 'TEAM_NOT_FOUND'
  | 'PLAYER_NOT_FOUND'
  | 'BID_NOT_FOUND'
  | 'PLAYER_ALREADY_CLAIMED'
  | 'ROSTER_FULL'
  | 'BID_EXCEEDS_MAX';

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

async function lockDraftMutation(tx: Prisma.TransactionClient, draftId: number): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${DRAFT_MUTATION_LOCK_NAMESPACE}, ${draftId})`;
}

export async function withActiveOwnedDraftMutation<T>(
  userId: string,
  draftId: number,
  operation: (tx: Prisma.TransactionClient, draft: Draft) => Promise<T>,
): Promise<DraftMutationResult<T>> {
  if (!isPositiveSafeInteger(draftId)) return { ok: false, code: 'INVALID_INPUT' };

  try {
    return await prisma.$transaction(async (tx) => {
      await lockDraftMutation(tx, draftId);
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
      await lockDraftMutation(tx, draftId);
      const draft = await tx.draft.findFirst({ where: { id: draftId, ownerId: userId } });
      if (!draft) throw new DraftMutationFailure('NOT_FOUND');

      if (draft.status === 'ACTIVE') {
        await tx.draft.update({ where: { id: draft.id }, data: { status: 'COMPLETE' } });
      }
      return { ok: true, data: null };
    });
  } catch (error) {
    if (error instanceof DraftMutationFailure) return { ok: false, code: error.code };
    throw error;
  }
}
