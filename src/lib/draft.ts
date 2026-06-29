import { prisma } from '@/lib/db';
import type { Prisma } from '@prisma/client';

export type DraftWithOwnerTeam = Prisma.DraftGetPayload<{ include: { ownerTeam: true } }>;

// Returns the draft owned by this Discord userId, or null if none.
// No auto-claim: ownerId must be set explicitly at backfill/seed time via OWNER_DISCORD_ID.
export async function getDraftForUser(userId: string): Promise<DraftWithOwnerTeam | null> {
  return prisma.draft.findFirst({
    where: { ownerId: userId },
    include: { ownerTeam: true },
  });
}
