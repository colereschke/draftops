'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { getDraft } from '@/lib/draft';

export async function logBid(data: {
  player: string;
  position: string;
  nflTeam: string;
  price: number;
  sfRank: number | null;
  teamId: number;
  draftId: number;
}): Promise<void> {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');

  const draft = await getDraft(session.user.id, data.draftId);
  if (!draft) throw new Error('No draft found');

  const team = await prisma.team.findFirst({ where: { id: data.teamId, draftId: draft.id } });
  if (!team) throw new Error('Team not found in draft');

  await prisma.auctionResult.create({
    data: {
      player: data.player,
      position: data.position,
      nflTeam: data.nflTeam,
      price: data.price,
      sfRank: data.sfRank,
      teamId: data.teamId,
      draftId: draft.id,
    },
  });
  await prisma.nominatedPlayer.deleteMany({
    where: { playerName: data.player, draftId: draft.id },
  });
  revalidatePath(`/draft/${data.draftId}`);
}

export async function updateBid(data: {
  id: number;
  price: number;
  teamId: number;
  draftId: number;
}): Promise<void> {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');

  const draft = await getDraft(session.user.id, data.draftId);
  if (!draft) throw new Error('No draft found');

  const team = await prisma.team.findFirst({ where: { id: data.teamId, draftId: draft.id } });
  if (!team) throw new Error('Team not found in draft');

  const updateResult = await prisma.auctionResult.updateMany({
    where: { id: data.id, draftId: draft.id },
    data: { price: data.price, teamId: data.teamId },
  });
  if (updateResult.count === 0) throw new Error('Bid not found');
  revalidatePath(`/draft/${data.draftId}`);
}

export async function deleteBid(data: { id: number; draftId: number }): Promise<void> {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');

  const draft = await getDraft(session.user.id, data.draftId);
  if (!draft) throw new Error('No draft found');

  const deleteResult = await prisma.auctionResult.deleteMany({
    where: { id: data.id, draftId: draft.id },
  });
  if (deleteResult.count === 0) throw new Error('Bid not found');
  revalidatePath(`/draft/${data.draftId}`);
}

export async function completeDraft(draftId: number): Promise<void> {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');

  const draft = await prisma.draft.findFirst({
    where: { id: draftId, ownerId: session.user.id },
  });
  if (!draft) throw new Error('Draft not found');

  await prisma.draft.update({
    where: { id: draftId },
    data: { status: 'COMPLETE' },
  });
  revalidatePath('/drafts');
}
