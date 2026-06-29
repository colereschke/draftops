'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { getDraftForUser } from '@/lib/draft';

export async function logBid(data: {
  player: string;
  position: string;
  nflTeam: string;
  price: number;
  sfRank: number | null;
  teamId: number;
}): Promise<void> {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');

  const draft = await getDraftForUser(session.user.id);
  if (!draft) throw new Error('No draft found');

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
  revalidatePath('/');
}

export async function updateBid(data: {
  id: number;
  price: number;
  teamId: number;
}): Promise<void> {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');

  const draft = await getDraftForUser(session.user.id);
  if (!draft) throw new Error('No draft found');

  // updateMany with { id, draftId } prevents editing bids from other drafts
  await prisma.auctionResult.updateMany({
    where: { id: data.id, draftId: draft.id },
    data: { price: data.price, teamId: data.teamId },
  });
  revalidatePath('/');
}

export async function deleteBid(data: { id: number }): Promise<void> {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');

  const draft = await getDraftForUser(session.user.id);
  if (!draft) throw new Error('No draft found');

  // deleteMany with { id, draftId } prevents deleting bids from other drafts
  await prisma.auctionResult.deleteMany({ where: { id: data.id, draftId: draft.id } });
  revalidatePath('/');
}
