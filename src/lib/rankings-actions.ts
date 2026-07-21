'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { getPrisma } from '@/lib/db';
import { parseRankingsCsv } from '@/lib/rankingsImport';
import { buildSleeperPlayerIndex, matchToSleeperIndexed } from '@/lib/sleeperMatch';
import { DEFAULT_RANKING_SOURCE_BUDGET } from '@/lib/valuationBudget';

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

  const set = await getPrisma().userRankingSet.findUnique({
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

  const sleeperPlayers = await getPrisma().sleeperPlayer.findMany({
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
  const usedSleeperIds = new Set<string>();
  const rowsWithUniqueSleeperMatches = matchedRows.map((row) => {
    if (!row.sleeperId || row.matchStatus !== 'matched') return row;
    if (usedSleeperIds.has(row.sleeperId)) {
      return { ...row, sleeperId: null as string | null, matchStatus: 'unmatched' };
    }
    usedSleeperIds.add(row.sleeperId);
    return row;
  });

  await getPrisma().$transaction(async (tx) => {
    const set = await tx.userRankingSet.upsert({
      where: { userId: session.user.id },
      create: {
        userId: session.user.id,
        fileName,
        sourceBudget: DEFAULT_RANKING_SOURCE_BUDGET,
        uploadedAt: new Date(),
      },
      update: {
        fileName,
        sourceBudget: DEFAULT_RANKING_SOURCE_BUDGET,
        uploadedAt: new Date(),
      },
    });
    await tx.userRankingPlayer.deleteMany({ where: { rankingSetId: set.id } });
    await tx.userRankingPlayer.createMany({
      data: rowsWithUniqueSleeperMatches.map((row) => ({
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

  const player = await getPrisma().userRankingPlayer.findUnique({
    where: { id: rankingPlayerId },
    select: {
      id: true,
      pos: true,
      rankingSetId: true,
      rankingSet: { select: { userId: true } },
    },
  });
  if (!player || player.rankingSet.userId !== session.user.id) throw new Error('Not found');

  const sleeperPlayer = await getPrisma().sleeperPlayer.findUnique({
    where: { id: sleeperId },
    select: { id: true, pos: true },
  });
  if (!sleeperPlayer) throw new Error('Sleeper player not found');
  if (sleeperPlayer.pos !== player.pos) throw new Error('Position mismatch');

  const assignedPlayer = await getPrisma().userRankingPlayer.findFirst({
    where: {
      rankingSetId: player.rankingSetId,
      sleeperId,
      NOT: { id: rankingPlayerId },
    },
    select: { id: true },
  });
  if (assignedPlayer) throw new Error('Sleeper player is already assigned in this ranking set');

  try {
    await getPrisma().userRankingPlayer.update({
      where: { id: rankingPlayerId },
      data: { sleeperId, matchStatus: 'manual' },
    });
  } catch (error) {
    if ((error as { code?: unknown }).code === 'P2002') {
      throw new Error('Sleeper player is already assigned in this ranking set');
    }
    throw error;
  }
  revalidatePath('/rankings');
}
