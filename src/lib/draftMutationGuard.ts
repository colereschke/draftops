import { prisma } from '@/lib/db';
import { getDraft, type DraftWithOwnerTeam } from '@/lib/draft';

export class DraftMutationError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'DraftMutationError';
    this.status = status;
  }
}

export async function requireActiveDraft(
  userId: string,
  draftId: number,
): Promise<DraftWithOwnerTeam> {
  const draft = await getDraft(userId, draftId);
  if (!draft) throw new DraftMutationError('No draft found', 404);
  if (draft.status !== 'ACTIVE') throw new DraftMutationError('Draft is not active', 409);
  return draft;
}

export function requirePositiveInteger(value: number, field: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new DraftMutationError(`${field} must be a positive integer`, 400);
  }
}

export async function requirePlayerNotWon(draftId: number, playerId: number): Promise<void> {
  const existingResult = await prisma.auctionResult.findFirst({
    where: { playerId, draftId },
  });
  if (existingResult) throw new DraftMutationError('Player already has a winning bid', 409);
}

interface AvailablePlayer {
  id: number;
  name: string;
  pos: string;
  nflTeam: string;
  sfRank: number;
}

export async function requireAvailablePlayer(
  draftId: number,
  playerId: number,
): Promise<AvailablePlayer> {
  const [player, existingResult] = await Promise.all([
    prisma.player.findFirst({
      where: { id: playerId, draftId },
      select: { id: true, name: true, pos: true, nflTeam: true, sfRank: true },
    }),
    prisma.auctionResult.findFirst({ where: { playerId, draftId } }),
  ]);
  if (!player) throw new DraftMutationError('Player not found in draft', 404);
  if (existingResult) throw new DraftMutationError('Player already has a winning bid', 409);
  return player;
}

export function isDuplicateAuctionResultError(e: unknown): boolean {
  return (e as { code?: string } | null)?.code === 'P2002';
}
