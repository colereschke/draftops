import type { Prisma } from '@prisma/client';

const DRAFT_MUTATION_LOCK_NAMESPACE = 1_144_002_001;

export async function lockDraftForMutation(
  tx: Prisma.TransactionClient,
  draftId: number,
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${DRAFT_MUTATION_LOCK_NAMESPACE}, ${draftId})`;
}
