'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { parseRankingsCsv } from '@/lib/rankingsImport';
import { buildSleeperPlayerIndex, matchToSleeperIndexed } from '@/lib/sleeperMatch';

export interface RankingSummary {
  fileName: string | null;
  uploadedAt: Date;
  totalCount: number;
  matchedCount: number;
  unmatchedCount: number;
}

export async function getRankingSummary(): Promise<RankingSummary | null> {
  const session = await auth();
  if (!session) return null;

  const set = await prisma.userRankingSet.findUnique({
    where: { userId: session.user.id },
    select: { fileName: true, uploadedAt: true, players: { select: { matchStatus: true } } },
  });
  if (!set) return null;

  return {
    fileName: set.fileName,
    uploadedAt: set.uploadedAt,
    totalCount: set.players.length,
    matchedCount: set.players.filter(
      (p) => p.matchStatus === 'matched' || p.matchStatus === 'manual',
    ).length,
    unmatchedCount: set.players.filter((p) => p.matchStatus === 'unmatched').length,
  };
}

export type UploadResult = { ok: true } | { ok: false; errors: string[] };

export async function uploadRankingsCsv(fileName: string, csvText: string): Promise<UploadResult> {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');

  const parsed = parseRankingsCsv(csvText);
  if (!parsed.ok) return { ok: false, errors: parsed.errors };

  const sleeperPlayers = await prisma.sleeperPlayer.findMany({
    select: { id: true, name: true, normalizedName: true, team: true, pos: true },
  });
  const sleeperIndex = buildSleeperPlayerIndex(sleeperPlayers);

  const matchedRows = parsed.rows.map((row) => {
    if (row.pos === 'PICK') {
      return { ...row, sleeperId: null as string | null, matchStatus: 'n_a' };
    }
    const outcome = matchToSleeperIndexed(
      { name: row.name, team: row.team, pos: row.pos },
      sleeperIndex,
    );
    return outcome.status === 'matched'
      ? { ...row, sleeperId: outcome.sleeperId as string | null, matchStatus: 'matched' }
      : { ...row, sleeperId: null as string | null, matchStatus: 'unmatched' };
  });

  await prisma.$transaction(async (tx) => {
    const set = await tx.userRankingSet.upsert({
      where: { userId: session.user.id },
      create: { userId: session.user.id, fileName, uploadedAt: new Date() },
      update: { fileName, uploadedAt: new Date() },
    });
    await tx.userRankingPlayer.deleteMany({ where: { rankingSetId: set.id } });
    await tx.userRankingPlayer.createMany({
      data: matchedRows.map((row) => ({
        rankingSetId: set.id,
        name: row.name,
        team: row.team,
        pos: row.pos,
        age: row.age,
        sfRank: row.sfRank,
        budget: row.budget,
        ceiling: row.ceiling,
        floor: row.floor,
        notes: row.notes,
        sleeperId: row.sleeperId,
        matchStatus: row.matchStatus,
      })),
    });
  });

  revalidatePath('/rankings');
  revalidatePath('/drafts/new');
  return { ok: true };
}

export async function resolveRankingMatch(
  rankingPlayerId: number,
  sleeperId: string,
): Promise<void> {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');

  const player = await prisma.userRankingPlayer.findUnique({
    where: { id: rankingPlayerId },
    select: { rankingSet: { select: { userId: true } } },
  });
  if (!player || player.rankingSet.userId !== session.user.id) throw new Error('Not found');

  await prisma.userRankingPlayer.update({
    where: { id: rankingPlayerId },
    data: { sleeperId, matchStatus: 'manual' },
  });
  revalidatePath('/rankings');
}
