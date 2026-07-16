'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
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
import { getCustomPlayerKey } from '@/lib/playerIdentity';
import { buildSleeperPlayerIndex, matchToSleeperIndexed } from '@/lib/sleeperMatch';
import { completeOwnedDraft } from '@/lib/draftMutation';
import type { DraftMutationResult } from '@/lib/draftMutation';
import { createBidRecord, deleteBidRecord, updateBidRecord } from '@/lib/bidMutation';

export async function logBid(data: {
  playerId: number;
  price: number;
  teamId: number;
  draftId: number;
}): Promise<DraftMutationResult<{ bidId: number }>> {
  const session = await auth();
  if (!session) return { ok: false, code: 'UNAUTHORIZED' };

  const result = await createBidRecord({
    ...data,
    userId: session.user.id,
  });
  if (result.ok) revalidatePath(`/draft/${data.draftId}`);
  return result;
}

export async function updateBid(data: {
  id: number;
  price: number;
  teamId: number;
  draftId: number;
}): Promise<DraftMutationResult<{ bidId: number }>> {
  const session = await auth();
  if (!session) return { ok: false, code: 'UNAUTHORIZED' };

  const result = await updateBidRecord({
    userId: session.user.id,
    draftId: data.draftId,
    bidId: data.id,
    teamId: data.teamId,
    price: data.price,
  });
  if (result.ok) revalidatePath(`/draft/${data.draftId}`);
  return result;
}

export async function deleteBid(data: {
  id: number;
  draftId: number;
}): Promise<DraftMutationResult<null>> {
  const session = await auth();
  if (!session) return { ok: false, code: 'UNAUTHORIZED' };

  const result = await deleteBidRecord({
    userId: session.user.id,
    draftId: data.draftId,
    bidId: data.id,
  });
  if (result.ok) revalidatePath(`/draft/${data.draftId}`);
  return result;
}

interface TeamInput {
  handle: string;
  displayName: string;
  isMine: boolean;
  sleeperRosterId?: number;
}

function toPrismaFuturePickMode(mode: FuturePickAuctionMode): 'PACKAGES' | 'INDIVIDUAL' | 'NONE' {
  if (mode === 'individual') return 'INDIVIDUAL';
  if (mode === 'none') return 'NONE';
  return 'PACKAGES';
}

async function resolveEtrSleeperMatches(): Promise<Map<string, string>> {
  const sleeperPlayers = await prisma.sleeperPlayer.findMany({
    select: { id: true, name: true, normalizedName: true, team: true, pos: true },
  });
  const index = buildSleeperPlayerIndex(sleeperPlayers);
  const matches = new Map<string, string>();
  for (const p of BASE_PLAYERS) {
    const outcome = matchToSleeperIndexed({ name: p.player, team: p.team, pos: p.pos }, index);
    if (outcome.status === 'matched') matches.set(p.player, outcome.sleeperId);
  }
  return matches;
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
  sleeperLeagueId?: string;
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
    sleeperRosterId: t.sleeperRosterId,
  }));
  const etrMatches =
    data.playerSource === 'custom' ? new Map<string, string>() : await resolveEtrSleeperMatches();

  const draftId = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${session.user.id}))`;
    const ownerDraftCount = await tx.draft.count({ where: { ownerId: session.user.id } });
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
        sleeperLeagueId: data.sleeperLeagueId,
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
          sleeperRosterId: team.sleeperRosterId,
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
      data: seededPlayers.map((p, index) => ({
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
        customKey: getCustomPlayerKey(p, index),
        notes: p.notes,
        futurePickYear: p.futurePickYear ?? null,
        futurePickRound: p.futurePickRound ?? null,
        futurePickOriginHandle: p.futurePickOriginHandle ?? null,
        futurePickAssetKind: p.futurePickAssetKind ?? null,
        draftId: draft.id,
      })),
    });

    await applyProjectionValuesToDraft(tx, {
      draftId: draft.id,
      etrMatches,
      useBatchTransaction: false,
    });

    if (ownerDraftCount === 0) {
      const transition = await tx.onboardingProgress.updateMany({
        where: { userId: session.user.id, phase: 'DRAFT_SETUP' },
        data: {
          phase: 'FEATURE_TOUR',
          draftId: draft.id,
          step: 'VALUE_SHEET_INTRO',
          subjectPlayerName: null,
        },
      });
      if (transition.count === 0) {
        const onboarding = await tx.onboardingProgress.findUnique({
          where: { userId: session.user.id },
        });
        if (!onboarding) {
          await tx.onboardingProgress.create({
            data: {
              userId: session.user.id,
              phase: 'FEATURE_TOUR',
              draftId: draft.id,
              step: 'VALUE_SHEET_INTRO',
            },
          });
        }
      }
    }

    return draft.id;
  });

  redirect(`/draft/${draftId}`);
}

export async function completeDraft(draftId: number): Promise<void> {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');

  const result = await completeOwnedDraft(session.user.id, draftId);
  if (!result.ok) {
    if (result.code === 'NOT_FOUND') throw new Error('Draft not found');
    throw new Error('Invalid draft ID');
  }

  revalidatePath('/drafts');
}
