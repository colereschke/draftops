'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';

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

  await prisma.auctionResult.create({
    data: {
      player: data.player,
      position: data.position,
      nflTeam: data.nflTeam,
      price: data.price,
      sfRank: data.sfRank,
      teamId: data.teamId,
    },
  });
  await prisma.nominatedPlayer.deleteMany({ where: { playerName: data.player } });
  revalidatePath('/');
}

export async function updateBid(data: {
  id: number;
  price: number;
  teamId: number;
}): Promise<void> {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');

  await prisma.auctionResult.update({
    where: { id: data.id },
    data: { price: data.price, teamId: data.teamId },
  });
  revalidatePath('/');
}

export async function deleteBid(data: { id: number }): Promise<void> {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');

  await prisma.auctionResult.delete({ where: { id: data.id } });
  revalidatePath('/');
}
