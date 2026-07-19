'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import {
  excludeStaticFuturePickRows,
  generateFuturePickAssets,
  getNextFuturePickYear,
  inferFuturePickBaselines,
} from '@/lib/futurePickAssets';
import type { FuturePickAuctionMode, Position } from '@/types';
import { players as BASE_PLAYERS } from '@/data/players';
import { adjustPlayerValues } from '@/lib/valueAdjustment';
import { applyProjectionValuesToDraft } from '@/lib/projectionApplication';
import { getCustomPlayerKey } from '@/lib/playerIdentity';
import { buildSleeperPlayerIndex, matchToSleeperIndexed } from '@/lib/sleeperMatch';
import { DEFAULT_RANKING_SOURCE_BUDGET } from '@/lib/valuationBudget';
import {
  completeOwnedDraft,
  DraftMutationFailure,
  type DraftMutationResult,
} from '@/lib/draftMutation';
import { createBidRecord, deleteBidRecord, updateBidRecord } from '@/lib/bidMutation';
import { draftInputSchema, type DraftInput } from '@/lib/draftInputSchema';

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

// Measured baseline against local Postgres (2026-07-18, draft-creation.postgres.test.ts): the full
// no-injected-latency stage sequence (advisory-lock + owner-draft-count + draft-create + team-insert
// + owner-team-update + player-insert + projection-application) totaled ~99ms; with an injected 2s
// AFTER INSERT ... FOR EACH STATEMENT sleep on the player-insert stage, total wall time was ~2.2s.
// 15s leaves >100x headroom above the unloaded local baseline and comfortably covers Neon cold-path
// latency on top of it, so the provisional value stands unchanged.
const TRANSACTION_TIMEOUT_MS = 15_000;

function logStage(previousMark: number, stage: string): number {
  const now = performance.now();
  console.info(`[createDraft] stage=${stage} durationMs=${Math.round(now - previousMark)}`);
  return now;
}

function isTeamConflictError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) return false;
  if ((error as { code?: unknown }).code !== 'P2002') return false;
  const target = (error as { meta?: { target?: unknown } }).meta?.target;
  if (!Array.isArray(target)) return false;
  return (
    (target.includes('handle') && target.includes('draftId')) ||
    (target.includes('draftId') && target.includes('sleeperRosterId'))
  );
}

export async function createDraft(
  data: DraftInput,
): Promise<DraftMutationResult<{ draftId: number }>> {
  const session = await auth();
  if (!session) return { ok: false, code: 'UNAUTHORIZED' };

  const parsed = draftInputSchema.safeParse(data);
  if (!parsed.success) return { ok: false, code: 'INVALID_INPUT' };
  const input = parsed.data;

  const coerced = input.teams.map((team) => ({
    handle: team.handle,
    displayName: team.displayName || team.handle,
    isMine: team.isMine,
    sleeperRosterId: team.sleeperRosterId,
  }));

  const etrMatches =
    input.playerSource === 'custom' ? new Map<string, string>() : await resolveEtrSleeperMatches();

  const rankingSet =
    input.playerSource === 'custom'
      ? await prisma.userRankingSet.findUnique({
          where: { userId: session.user.id },
          include: { players: true },
        })
      : null;
  if (input.playerSource === 'custom' && !rankingSet) {
    return { ok: false, code: 'NO_RANKING_SET' };
  }

  const sourceBudget = rankingSet?.sourceBudget ?? DEFAULT_RANKING_SOURCE_BUDGET;
  const basePlayers = rankingSet
    ? rankingSet.players.map((player) => ({
        player: player.name,
        team: player.team,
        pos: player.pos as Position,
        age: player.age,
        sfRank: player.sfRank,
        budget: player.budget,
        ceiling: player.ceiling,
        floor: player.floor,
        notes: player.notes,
        sleeperId: player.sleeperId,
      }))
    : BASE_PLAYERS;

  const creationTimestamp = new Date();
  const nextPickYear = getNextFuturePickYear(creationTimestamp);
  const futurePickAssets = generateFuturePickAssets({
    teams: coerced,
    year: nextPickYear,
    startingRank: 900,
    sourceBudget,
    baselines: inferFuturePickBaselines(basePlayers),
  });
  const sourcePlayers = [...excludeStaticFuturePickRows(basePlayers), ...futurePickAssets];
  const seededPlayers = adjustPlayerValues(sourcePlayers, {
    startingLineup: input.startingLineup,
    scoringSettings: input.scoringSettings,
    teamCount: input.teams.length,
    sourceBudget,
    draftBudget: input.budgetPerTeam,
  });

  let draftId: number;
  try {
    draftId = await prisma.$transaction(
      async (tx) => {
        let stageMark = performance.now();
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${session.user.id}))`;
        stageMark = logStage(stageMark, 'advisory-lock');

        const ownerDraftCount = await tx.draft.count({ where: { ownerId: session.user.id } });
        stageMark = logStage(stageMark, 'owner-draft-count');

        const draft = await tx.draft.create({
          data: {
            name: input.name,
            ownerId: session.user.id,
            createdAt: creationTimestamp,
            status: 'ACTIVE',
            teamCount: input.teams.length,
            rosterSize: input.rosterSize,
            budget: input.budgetPerTeam,
            playerValueSourceBudget: sourceBudget,
            futurePickAuctionMode: toPrismaFuturePickMode(input.futurePickAuctionMode),
            startingLineup: input.startingLineup,
            scoringSettings: input.scoringSettings,
            targetRoster: input.targetRoster,
            sleeperLeagueId: input.sleeperLeagueId,
          },
        });
        stageMark = logStage(stageMark, 'draft-create');

        let createdTeams: Array<{ id: number; handle: string }>;
        try {
          createdTeams = await tx.team.createManyAndReturn({
            data: coerced.map((team) => ({
              handle: team.handle,
              displayName: team.displayName,
              budget: input.budgetPerTeam,
              draftId: draft.id,
              sleeperRosterId: team.sleeperRosterId,
            })),
            select: { id: true, handle: true },
          });
        } catch (error) {
          if (isTeamConflictError(error)) throw new DraftMutationFailure('DUPLICATE_TEAM');
          throw error;
        }
        stageMark = logStage(stageMark, 'team-insert');

        const teamIdByHandle = new Map(createdTeams.map((team) => [team.handle, team.id]));
        const mineTeam = coerced.find((team) => team.isMine);
        const ownerTeamId = mineTeam ? (teamIdByHandle.get(mineTeam.handle) ?? null) : null;
        await tx.draft.update({ where: { id: draft.id }, data: { ownerTeamId } });
        stageMark = logStage(stageMark, 'owner-team-update');

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
        stageMark = logStage(stageMark, 'player-insert');

        await applyProjectionValuesToDraft(tx, {
          draftId: draft.id,
          etrMatches,
          useBatchTransaction: false,
        });
        stageMark = logStage(stageMark, 'projection-application');

        if (ownerDraftCount === 0) {
          await tx.onboardingProgress.createMany({
            data: {
              userId: session.user.id,
              phase: 'FEATURE_TOUR',
              draftId: draft.id,
              step: 'VALUE_SHEET_INTRO',
            },
            skipDuplicates: true,
          });
          await tx.onboardingProgress.updateMany({
            where: { userId: session.user.id, phase: 'DRAFT_SETUP' },
            data: {
              phase: 'FEATURE_TOUR',
              draftId: draft.id,
              step: 'VALUE_SHEET_INTRO',
              subjectPlayerName: null,
            },
          });
        }
        logStage(stageMark, 'onboarding-transition');

        return draft.id;
      },
      { timeout: TRANSACTION_TIMEOUT_MS },
    );
  } catch (error) {
    if (error instanceof DraftMutationFailure) return { ok: false, code: error.code };
    throw error;
  }

  return { ok: true, data: { draftId } };
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
