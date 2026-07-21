import { cache } from 'react';
import { getPrisma } from '@/lib/db';
import type { Prisma } from '@prisma/client';

export type DraftWithOwnerTeam = Prisma.DraftGetPayload<{ include: { ownerTeam: true } }>;

// Wrapped in React.cache so the layout and child page share the same DB result per request.
export const getDraft = cache(
  async (userId: string, draftId: number): Promise<DraftWithOwnerTeam | null> => {
    return getPrisma().draft.findFirst({
      where: { id: draftId, ownerId: userId },
      include: { ownerTeam: true },
    });
  },
);

// For smart redirect and draft list.
export async function getActiveDraftsForUser(
  userId: string,
): Promise<{ id: number; name: string }[]> {
  return getPrisma().draft.findMany({
    where: { ownerId: userId, status: 'ACTIVE' },
    select: { id: true, name: true },
    orderBy: { createdAt: 'asc' },
  });
}
