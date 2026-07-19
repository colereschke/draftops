'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { getDraft } from '@/lib/draft';
import {
  fetchSleeperLeague,
  fetchSleeperLeagueRosters,
  fetchSleeperLeagueUsers,
  matchSleeperRostersToTeams,
  SleeperClientError,
  validateSleeperLeagueId,
} from '@/lib/sleeper';
import type { SleeperRosterCandidate } from '@/lib/sleeper';
import type { LeagueTeam } from '@/types';
import { reconcileSleeperRosters } from '@/lib/sleeperRosterSync';
import type { SleeperRosterPreview } from '@/lib/sleeperRosterSync';
import { DraftMutationFailure, withActiveOwnedDraftMutation } from '@/lib/draftMutation';
import { createBidInTransaction } from '@/lib/bidMutation';

export interface SleeperRosterMappingInput {
  teamId: number;
  sleeperRosterId: number;
}

export interface SleeperRosterCatchUpEntry {
  playerId: number;
  teamId: number;
  price: number;
}

export type SleeperRosterSyncResponse =
  | { ok: true; preview: SleeperRosterPreview }
  | {
      ok: false;
      code:
        | 'configuration_required'
        | 'mapping_required'
        | 'not_found'
        | 'invalid_league_id'
        | 'timeout'
        | 'rate_limited'
        | 'malformed_response'
        | 'sleeper_error'
        | 'draft_complete';
    };

export type SleeperRosterCatchUpResponse =
  | {
      ok: false;
      code:
        | 'invalid_input'
        | 'not_found'
        | 'configuration_required'
        | 'invalid_league_id'
        | 'timeout'
        | 'rate_limited'
        | 'malformed_response'
        | 'sleeper_error'
        | 'draft_complete';
    }
  | {
      ok: true;
      createdPlayerIds: number[];
      conflicts: Array<{
        playerId: number;
        reason: 'already_logged' | 'assignment_changed' | 'roster_full' | 'bid_exceeds_max';
      }>;
    };

export type SleeperRosterMatchResponse =
  | { ok: true; leagueName: string; rosters: SleeperRosterCandidate[]; teams: LeagueTeam[] }
  | {
      ok: false;
      code:
        | 'not_found'
        | 'sleeper_error'
        | 'invalid_league_id'
        | 'timeout'
        | 'rate_limited'
        | 'malformed_response';
    };

interface OwnedDraft {
  id: number;
  sleeperLeagueId: string | null;
  userId: string;
}

async function requireOwnedDraft(draftId: number): Promise<OwnedDraft | null> {
  if (!Number.isSafeInteger(draftId) || draftId <= 0) return null;
  const session = await auth();
  if (!session?.user.id) return null;
  const draft = await getDraft(session.user.id, draftId);
  return draft
    ? { id: draft.id, sleeperLeagueId: draft.sleeperLeagueId, userId: session.user.id }
    : null;
}

type SleeperRosterExternalFailureCode =
  'invalid_league_id' | 'timeout' | 'rate_limited' | 'malformed_response' | 'sleeper_error';

function mapSleeperRosterFailure(error: unknown): SleeperRosterExternalFailureCode | null {
  if (!(error instanceof SleeperClientError)) return null;

  switch (error.code) {
    case 'INVALID_LEAGUE_ID':
      return 'invalid_league_id';
    case 'TIMEOUT':
      return 'timeout';
    case 'RATE_LIMITED':
      return 'rate_limited';
    case 'MALFORMED_RESPONSE':
      return 'malformed_response';
    default:
      return 'sleeper_error';
  }
}

function hasDuplicateValues(values: number[]): boolean {
  return new Set(values).size !== values.length;
}

async function getPreview(
  draftId: number,
  rosters: Awaited<ReturnType<typeof fetchSleeperLeagueRosters>>,
) {
  const [teams, players, loggedResults] = await Promise.all([
    prisma.team.findMany({
      where: { draftId },
      select: { id: true, sleeperRosterId: true, handle: true, displayName: true },
    }),
    prisma.player.findMany({
      where: { draftId },
      select: { id: true, sleeperId: true, name: true, pos: true, nflTeam: true, budget: true },
    }),
    prisma.auctionResult.findMany({ where: { draftId }, select: { playerId: true } }),
  ]);
  return reconcileSleeperRosters({
    rosters,
    teams,
    players,
    loggedPlayerIds: new Set(loggedResults.map((result) => result.playerId)),
  });
}

export async function previewSleeperRosterSync(input: {
  draftId: number;
}): Promise<SleeperRosterSyncResponse> {
  const draft = await requireOwnedDraft(input.draftId);
  if (!draft) return { ok: false, code: 'not_found' };
  if (!draft.sleeperLeagueId) return { ok: false, code: 'configuration_required' };

  try {
    const leagueId = validateSleeperLeagueId(draft.sleeperLeagueId);
    const rosters = await fetchSleeperLeagueRosters(leagueId);
    const preview = await getPreview(draft.id, rosters);
    if (preview.diagnostics.unmappedRosterIds.length > 0)
      return { ok: false, code: 'mapping_required' };
    return { ok: true, preview };
  } catch (error) {
    const code = mapSleeperRosterFailure(error);
    if (code) return { ok: false, code };
    throw error;
  }
}

export async function previewSleeperRosterMatch(input: {
  draftId: number;
  leagueId: string;
}): Promise<SleeperRosterMatchResponse> {
  const draft = await requireOwnedDraft(input.draftId);
  if (!draft) return { ok: false, code: 'not_found' };

  let league: Awaited<ReturnType<typeof fetchSleeperLeague>>;
  let users: Awaited<ReturnType<typeof fetchSleeperLeagueUsers>>;
  let rosters: Awaited<ReturnType<typeof fetchSleeperLeagueRosters>>;
  try {
    const leagueId = validateSleeperLeagueId(input.leagueId);
    [league, users, rosters] = await Promise.all([
      fetchSleeperLeague(leagueId),
      fetchSleeperLeagueUsers(leagueId),
      fetchSleeperLeagueRosters(leagueId),
    ]);
  } catch (error) {
    const code = mapSleeperRosterFailure(error);
    if (code) return { ok: false, code };
    throw error;
  }

  const teams = await prisma.team.findMany({
    where: { draftId: draft.id },
    select: { id: true, handle: true, displayName: true, sleeperRosterId: true },
  });

  return {
    ok: true,
    leagueName: league.name ?? '',
    rosters: matchSleeperRostersToTeams(rosters, users, teams),
    teams: teams.map((team) => ({
      id: team.id,
      handle: team.handle,
      displayName: team.displayName,
    })),
  };
}

export async function saveSleeperRosterMapping(input: {
  draftId: number;
  leagueId: string;
  mappings: SleeperRosterMappingInput[];
}): Promise<SleeperRosterSyncResponse> {
  const draft = await requireOwnedDraft(input.draftId);
  if (!draft) return { ok: false, code: 'not_found' };
  if (input.mappings.length === 0) {
    return { ok: false, code: 'configuration_required' };
  }

  const teamIds = input.mappings.map((mapping) => mapping.teamId);
  const rosterIds = input.mappings.map((mapping) => mapping.sleeperRosterId);
  if (
    input.mappings.some(
      (mapping) =>
        !Number.isSafeInteger(mapping.teamId) ||
        mapping.teamId <= 0 ||
        !Number.isSafeInteger(mapping.sleeperRosterId) ||
        mapping.sleeperRosterId <= 0,
    ) ||
    hasDuplicateValues(teamIds) ||
    hasDuplicateValues(rosterIds)
  ) {
    return { ok: false, code: 'mapping_required' };
  }

  let rosters: Awaited<ReturnType<typeof fetchSleeperLeagueRosters>>;
  let leagueId: string;
  try {
    leagueId = validateSleeperLeagueId(input.leagueId);
    [, , rosters] = await Promise.all([
      fetchSleeperLeague(leagueId),
      fetchSleeperLeagueUsers(leagueId),
      fetchSleeperLeagueRosters(leagueId),
    ]);
  } catch (error) {
    const code = mapSleeperRosterFailure(error);
    if (code) return { ok: false, code };
    throw error;
  }

  const sleeperRosterIds = new Set(rosters.map((roster) => roster.roster_id));
  if (rosterIds.some((rosterId) => !sleeperRosterIds.has(rosterId))) {
    return { ok: false, code: 'mapping_required' };
  }

  const mutation = await withActiveOwnedDraftMutation(
    draft.userId,
    draft.id,
    async (tx, lockedDraft) => {
      const [teams, players, loggedResults] = await Promise.all([
        tx.team.findMany({
          where: { draftId: lockedDraft.id },
          select: { id: true, sleeperRosterId: true, handle: true, displayName: true },
        }),
        tx.player.findMany({
          where: { draftId: lockedDraft.id },
          select: { id: true, sleeperId: true, name: true, pos: true, nflTeam: true, budget: true },
        }),
        tx.auctionResult.findMany({
          where: { draftId: lockedDraft.id },
          select: { playerId: true },
        }),
      ]);
      if (teamIds.some((teamId) => !teams.some((team) => team.id === teamId))) {
        throw new DraftMutationFailure('INVALID_INPUT');
      }

      await tx.team.updateMany({
        where: { draftId: lockedDraft.id },
        data: { sleeperRosterId: null },
      });
      await tx.draft.update({
        where: { id: lockedDraft.id },
        data: { sleeperLeagueId: leagueId },
      });
      for (const mapping of input.mappings) {
        await tx.team.update({
          where: { id: mapping.teamId },
          data: { sleeperRosterId: mapping.sleeperRosterId },
        });
      }
      return { teams, players, loggedResults };
    },
  );
  if (!mutation.ok) {
    if (mutation.code === 'DRAFT_COMPLETE') return { ok: false, code: 'draft_complete' };
    if (mutation.code === 'INVALID_INPUT') return { ok: false, code: 'mapping_required' };
    return { ok: false, code: 'not_found' };
  }

  const { teams, players, loggedResults } = mutation.data;

  const mappedTeams = teams.map((team) => ({
    ...team,
    sleeperRosterId:
      input.mappings.find((mapping) => mapping.teamId === team.id)?.sleeperRosterId ?? null,
  }));
  return {
    ok: true,
    preview: reconcileSleeperRosters({
      rosters,
      teams: mappedTeams,
      players,
      loggedPlayerIds: new Set(loggedResults.map((result) => result.playerId)),
    }),
  };
}

function isValidCatchUpInput(input: {
  draftId: number;
  entries: SleeperRosterCatchUpEntry[];
}): boolean {
  return (
    Number.isSafeInteger(input.draftId) &&
    input.draftId > 0 &&
    input.entries.length > 0 &&
    !hasDuplicateValues(input.entries.map((entry) => entry.playerId)) &&
    input.entries.every(
      (entry) =>
        Number.isSafeInteger(entry.playerId) &&
        entry.playerId > 0 &&
        Number.isSafeInteger(entry.teamId) &&
        entry.teamId > 0 &&
        Number.isSafeInteger(entry.price) &&
        entry.price > 0,
    )
  );
}

export async function logSleeperRosterCatchUp(input: {
  draftId: number;
  entries: SleeperRosterCatchUpEntry[];
}): Promise<SleeperRosterCatchUpResponse> {
  if (!isValidCatchUpInput(input)) return { ok: false, code: 'invalid_input' };
  const draft = await requireOwnedDraft(input.draftId);
  if (!draft) return { ok: false, code: 'not_found' };
  if (!draft.sleeperLeagueId) return { ok: false, code: 'configuration_required' };

  let rosters: Awaited<ReturnType<typeof fetchSleeperLeagueRosters>>;
  try {
    const leagueId = validateSleeperLeagueId(draft.sleeperLeagueId);
    rosters = await fetchSleeperLeagueRosters(leagueId);
  } catch (error) {
    const code = mapSleeperRosterFailure(error);
    if (code) return { ok: false, code };
    throw error;
  }

  const mutation = await withActiveOwnedDraftMutation(
    draft.userId,
    draft.id,
    async (tx, lockedDraft) => {
      const playerIds = input.entries.map((entry) => entry.playerId);
      const [teams, players, existingResults] = await Promise.all([
        tx.team.findMany({
          where: { draftId: lockedDraft.id },
          select: { id: true, sleeperRosterId: true },
        }),
        tx.player.findMany({
          where: { draftId: lockedDraft.id, id: { in: playerIds } },
          select: { id: true, sleeperId: true, name: true, pos: true, nflTeam: true, sfRank: true },
        }),
        tx.auctionResult.findMany({
          where: { draftId: lockedDraft.id, playerId: { in: playerIds } },
          select: { playerId: true },
        }),
      ]);
      const teamById = new Map(teams.map((team) => [team.id, team]));
      const playerById = new Map(players.map((player) => [player.id, player]));
      const loggedPlayerIds = new Set(existingResults.map((entry) => entry.playerId));
      const sleeperRosterByPlayerId = new Map<string, number>();
      for (const roster of rosters) {
        for (const sleeperId of roster.players ?? [])
          sleeperRosterByPlayerId.set(sleeperId, roster.roster_id);
      }

      type ConflictReason =
        'already_logged' | 'assignment_changed' | 'roster_full' | 'bid_exceeds_max';
      const conflictByPlayerId = new Map<number, ConflictReason>();
      const createdPlayerIdSet = new Set<number>();
      for (const entry of input.entries) {
        if (loggedPlayerIds.has(entry.playerId)) {
          conflictByPlayerId.set(entry.playerId, 'already_logged');
          continue;
        }
        const player = playerById.get(entry.playerId);
        const team = teamById.get(entry.teamId);
        if (
          !player ||
          !player.sleeperId ||
          !team?.sleeperRosterId ||
          sleeperRosterByPlayerId.get(player.sleeperId) !== team.sleeperRosterId
        ) {
          conflictByPlayerId.set(entry.playerId, 'assignment_changed');
          continue;
        }
        try {
          await createBidInTransaction(tx, lockedDraft, {
            player,
            teamId: team.id,
            price: entry.price,
            actorId: draft.userId,
          });
          createdPlayerIdSet.add(player.id);
        } catch (error) {
          if (error instanceof DraftMutationFailure) {
            if (error.code === 'PLAYER_ALREADY_CLAIMED') {
              conflictByPlayerId.set(entry.playerId, 'already_logged');
              continue;
            }
            if (error.code === 'ROSTER_FULL') {
              conflictByPlayerId.set(entry.playerId, 'roster_full');
              continue;
            }
            if (error.code === 'BID_EXCEEDS_MAX') {
              conflictByPlayerId.set(entry.playerId, 'bid_exceeds_max');
              continue;
            }
          }
          throw error;
        }
      }
      return {
        ok: true as const,
        createdPlayerIds: input.entries
          .map((entry) => entry.playerId)
          .filter((playerId) => createdPlayerIdSet.has(playerId)),
        conflicts: input.entries.flatMap((entry) => {
          const reason = conflictByPlayerId.get(entry.playerId);
          return reason === undefined ? [] : [{ playerId: entry.playerId, reason }];
        }),
      };
    },
  );
  if (!mutation.ok) {
    if (mutation.code === 'DRAFT_COMPLETE') return { ok: false, code: 'draft_complete' };
    return { ok: false, code: 'not_found' };
  }
  if (mutation.data.createdPlayerIds.length > 0) revalidatePath(`/draft/${draft.id}`);
  return mutation.data;
}
