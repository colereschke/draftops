'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { getDraft } from '@/lib/draft';
import {
  excludeStaticFuturePickRows,
  generateFuturePickAssets,
  getNextFuturePickYear,
  inferFuturePickBaselines,
} from '@/lib/futurePickAssets';
import type { FuturePickAuctionMode, Position, StartingSlot, ScoringSettings } from '@/types';
import { players as BASE_PLAYERS } from '@/data/players';
import { adjustPlayerValues } from '@/lib/valueAdjustment';
import { applyProjectionValuesToDraft } from '@/lib/projectionApplication';
import { getEtrSleeperMatches } from '@/lib/projectionIdentity';

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

interface TeamInput {
  handle: string;
  displayName: string;
  isMine: boolean;
}

function toPrismaFuturePickMode(mode: FuturePickAuctionMode): 'PACKAGES' | 'INDIVIDUAL' | 'NONE' {
  if (mode === 'individual') return 'INDIVIDUAL';
  if (mode === 'none') return 'NONE';
  return 'PACKAGES';
}

export async function createDraft(data: {
  name: string;
  budgetPerTeam: number;
  rosterSize: number;
  futurePickAuctionMode: FuturePickAuctionMode;
  targetRoster: Partial<Record<Position, number>>;
  startingLineup: StartingSlot[];
  scoringSettings: ScoringSettings;
  teams: TeamInput[];
  playerSource?: 'etr' | 'custom';
}): Promise<void> {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');

  const handles = data.teams.map((t) => t.handle.trim());
  if (new Set(handles).size !== handles.length) throw new Error('Duplicate handles');
  if (!data.teams.some((t) => t.isMine)) throw new Error('No team marked as mine');

  const coerced = data.teams.map((t) => ({
    handle: t.handle.trim(),
    displayName: t.displayName.trim() || t.handle.trim(),
    isMine: t.isMine,
  }));
  const etrMatches =
    data.playerSource === 'custom' ? new Map<string, string>() : getEtrSleeperMatches();

  const draftId = await prisma.$transaction(async (tx) => {
    const draft = await tx.draft.create({
      data: {
        name: data.name.trim(),
        ownerId: session.user.id,
        status: 'ACTIVE',
        teamCount: data.teams.length,
        rosterSize: data.rosterSize,
        budget: data.budgetPerTeam,
        futurePickAuctionMode: toPrismaFuturePickMode(data.futurePickAuctionMode),
        startingLineup: data.startingLineup,
        scoringSettings: data.scoringSettings,
        targetRoster: data.targetRoster,
      },
    });

    let ownerTeamId: number | null = null;
    for (const team of coerced) {
      const created = await tx.team.create({
        data: {
          handle: team.handle,
          displayName: team.displayName,
          budget: data.budgetPerTeam,
          draftId: draft.id,
        },
      });
      if (team.isMine) ownerTeamId = created.id;
    }

    await tx.draft.update({ where: { id: draft.id }, data: { ownerTeamId } });

    let basePlayers = BASE_PLAYERS;
    if (data.playerSource === 'custom') {
      const rankingSet = await tx.userRankingSet.findUnique({
        where: { userId: session.user.id },
        include: { players: true },
      });
      if (!rankingSet) throw new Error('No custom ranking set found');
      basePlayers = [
        ...rankingSet.players.map((p) => ({
          player: p.name,
          team: p.team,
          pos: p.pos as Position,
          age: p.age,
          sfRank: p.sfRank,
          budget: p.budget,
          ceiling: p.ceiling,
          floor: p.floor,
          notes: p.notes,
          sleeperId: p.sleeperId,
        })),
      ];
    }

    const valued = adjustPlayerValues(basePlayers, {
      startingLineup: data.startingLineup,
      scoringSettings: data.scoringSettings,
      teamCount: data.teams.length,
    });
    const nextPickYear = getNextFuturePickYear(draft.createdAt);
    const futurePickAssets = generateFuturePickAssets({
      teams: coerced,
      year: nextPickYear,
      startingRank: 900,
      baselines: inferFuturePickBaselines(valued),
    });
    const seededPlayers = [...excludeStaticFuturePickRows(valued), ...futurePickAssets];

    await tx.player.createMany({
      data: seededPlayers.map((p) => ({
        name: p.player,
        nflTeam: p.team,
        pos: p.pos,
        age: p.age,
        sfRank: p.sfRank,
        budget: p.budget,
        ceiling: p.ceiling,
        floor: p.floor,
        baseBudget: p.baseBudget ?? p.budget,
        baseCeiling: p.baseCeiling ?? p.ceiling,
        baseFloor: p.baseFloor ?? p.floor,
        sleeperId: p.sleeperId ?? etrMatches.get(p.player) ?? null,
        notes: p.notes,
        futurePickYear: p.futurePickYear ?? null,
        futurePickRound: p.futurePickRound ?? null,
        futurePickOriginHandle: p.futurePickOriginHandle ?? null,
        futurePickAssetKind: p.futurePickAssetKind ?? null,
        draftId: draft.id,
      })),
    });

    await applyProjectionValuesToDraft(tx, { draftId: draft.id, etrMatches });

    return draft.id;
  });

  redirect(`/draft/${draftId}`);
}

export async function completeDraft(draftId: number): Promise<void> {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');

  const result = await prisma.draft.updateMany({
    where: { id: draftId, ownerId: session.user.id },
    data: { status: 'COMPLETE' },
  });
  if (result.count === 0) throw new Error('Draft not found');

  revalidatePath('/drafts');
}
