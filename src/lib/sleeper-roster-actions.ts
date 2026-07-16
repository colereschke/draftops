'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { getDraft } from '@/lib/draft';
import {
  fetchSleeperLeague,
  fetchSleeperLeagueRosters,
  fetchSleeperLeagueUsers,
} from '@/lib/sleeper';
import { reconcileSleeperRosters } from '@/lib/sleeperRosterSync';
import type { SleeperRosterPreview } from '@/lib/sleeperRosterSync';

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
      code: 'configuration_required' | 'mapping_required' | 'not_found' | 'sleeper_error';
    };

export type SleeperRosterCatchUpResponse =
  | {
      ok: false;
      code: 'invalid_input' | 'not_found' | 'configuration_required' | 'sleeper_error';
    }
  | {
      ok: true;
      createdPlayerIds: number[];
      conflicts: Array<{ playerId: number; reason: 'already_logged' | 'assignment_changed' }>;
    };

interface OwnedDraft {
  id: number;
  sleeperLeagueId: string | null;
}

async function requireOwnedDraft(draftId: number): Promise<OwnedDraft | null> {
  if (!Number.isSafeInteger(draftId) || draftId <= 0) return null;
  const session = await auth();
  if (!session?.user.id) return null;
  return getDraft(session.user.id, draftId);
}

function isSleeperError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message === 'NOT_FOUND' || error.message.startsWith('SLEEPER_ERROR:'))
  );
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
    loggedPlayerIds: new Set(
      loggedResults.flatMap((result) => (result.playerId === null ? [] : [result.playerId])),
    ),
  });
}

export async function previewSleeperRosterSync(input: {
  draftId: number;
}): Promise<SleeperRosterSyncResponse> {
  const draft = await requireOwnedDraft(input.draftId);
  if (!draft) return { ok: false, code: 'not_found' };
  if (!draft.sleeperLeagueId) return { ok: false, code: 'configuration_required' };

  try {
    const rosters = await fetchSleeperLeagueRosters(draft.sleeperLeagueId);
    const preview = await getPreview(draft.id, rosters);
    if (preview.diagnostics.unmappedRosterIds.length > 0)
      return { ok: false, code: 'mapping_required' };
    return { ok: true, preview };
  } catch (error) {
    if (isSleeperError(error)) return { ok: false, code: 'sleeper_error' };
    throw error;
  }
}

export async function saveSleeperRosterMapping(input: {
  draftId: number;
  leagueId: string;
  mappings: SleeperRosterMappingInput[];
}): Promise<SleeperRosterSyncResponse> {
  const draft = await requireOwnedDraft(input.draftId);
  if (!draft) return { ok: false, code: 'not_found' };
  if (!input.leagueId.trim() || input.mappings.length === 0) {
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
  try {
    [, , rosters] = await Promise.all([
      fetchSleeperLeague(input.leagueId),
      fetchSleeperLeagueUsers(input.leagueId),
      fetchSleeperLeagueRosters(input.leagueId),
    ]);
  } catch (error) {
    if (isSleeperError(error)) return { ok: false, code: 'sleeper_error' };
    throw error;
  }

  const [teams, players, loggedResults] = await Promise.all([
    prisma.team.findMany({
      where: { draftId: draft.id },
      select: { id: true, sleeperRosterId: true, handle: true, displayName: true },
    }),
    prisma.player.findMany({
      where: { draftId: draft.id },
      select: { id: true, sleeperId: true, name: true, pos: true, nflTeam: true, budget: true },
    }),
    prisma.auctionResult.findMany({ where: { draftId: draft.id }, select: { playerId: true } }),
  ]);
  if (teamIds.some((teamId) => !teams.some((team) => team.id === teamId))) {
    return { ok: false, code: 'mapping_required' };
  }
  const sleeperRosterIds = new Set(rosters.map((roster) => roster.roster_id));
  if (rosterIds.some((rosterId) => !sleeperRosterIds.has(rosterId))) {
    return { ok: false, code: 'mapping_required' };
  }

  await prisma.$transaction(async (tx) => {
    await tx.team.updateMany({ where: { draftId: draft.id }, data: { sleeperRosterId: null } });
    await tx.draft.update({ where: { id: draft.id }, data: { sleeperLeagueId: input.leagueId } });
    for (const mapping of input.mappings) {
      await tx.team.update({
        where: { id: mapping.teamId },
        data: { sleeperRosterId: mapping.sleeperRosterId },
      });
    }
  });

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
      loggedPlayerIds: new Set(
        loggedResults.flatMap((result) => (result.playerId === null ? [] : [result.playerId])),
      ),
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
    rosters = await fetchSleeperLeagueRosters(draft.sleeperLeagueId);
  } catch {
    return { ok: false, code: 'sleeper_error' };
  }

  const result = await prisma.$transaction(async (tx) => {
    const playerIds = input.entries.map((entry) => entry.playerId);
    const [teams, players, existingResults] = await Promise.all([
      tx.team.findMany({
        where: { draftId: draft.id },
        select: { id: true, sleeperRosterId: true },
      }),
      tx.player.findMany({
        where: { draftId: draft.id, id: { in: playerIds } },
        select: { id: true, sleeperId: true, name: true, pos: true, nflTeam: true, sfRank: true },
      }),
      tx.auctionResult.findMany({
        where: { draftId: draft.id, playerId: { in: playerIds } },
        select: { playerId: true },
      }),
    ]);
    const teamById = new Map(teams.map((team) => [team.id, team]));
    const playerById = new Map(players.map((player) => [player.id, player]));
    const loggedPlayerIds = new Set(
      existingResults.flatMap((entry) => (entry.playerId === null ? [] : [entry.playerId])),
    );
    const sleeperRosterByPlayerId = new Map<string, number>();
    for (const roster of rosters) {
      for (const sleeperId of roster.players ?? [])
        sleeperRosterByPlayerId.set(sleeperId, roster.roster_id);
    }

    const conflictByPlayerId = new Map<number, 'already_logged' | 'assignment_changed'>();
    const candidates: Array<{
      player: string;
      playerId: number;
      position: string;
      nflTeam: string;
      price: number;
      sfRank: number;
      teamId: number;
      draftId: number;
    }> = [];
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
      candidates.push({
        player: player.name,
        playerId: player.id,
        position: player.pos,
        nflTeam: player.nflTeam,
        price: entry.price,
        sfRank: player.sfRank,
        teamId: team.id,
        draftId: draft.id,
      });
    }
    const insertedResults = await tx.auctionResult.createManyAndReturn({
      data: candidates,
      skipDuplicates: true,
      select: { playerId: true },
    });
    const createdPlayerIdSet = new Set(
      insertedResults.flatMap((result) => (result.playerId === null ? [] : [result.playerId])),
    );
    for (const candidate of candidates) {
      if (!createdPlayerIdSet.has(candidate.playerId)) {
        conflictByPlayerId.set(candidate.playerId, 'already_logged');
      }
    }
    await Promise.all(
      [...createdPlayerIdSet].map((playerId) =>
        tx.nominatedPlayer.deleteMany({ where: { draftId: draft.id, playerId } }),
      ),
    );
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
  });
  if (result.createdPlayerIds.length > 0) revalidatePath(`/draft/${draft.id}`);
  return result;
}
