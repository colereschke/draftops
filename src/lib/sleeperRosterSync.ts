import type { SleeperRoster } from '@/lib/sleeper';

export interface SleeperRosterActionableRow {
  playerId: number;
  sleeperId: string;
  playerName: string;
  position: string;
  nflTeam: string;
  targetBudget: number;
  teamId: number;
  teamHandle: string;
  teamDisplayName: string | null;
  sleeperRosterId: number;
}

export interface SleeperRosterUnresolvedRow {
  sleeperId: string;
  sleeperRosterId: number;
}

export interface SleeperRosterDiagnostics {
  alreadyLoggedCount: number;
  unmappedRosterIds: number[];
  duplicateMappedRosterIds: number[];
}

export interface SleeperRosterPreview {
  actionable: SleeperRosterActionableRow[];
  unresolved: SleeperRosterUnresolvedRow[];
  diagnostics: SleeperRosterDiagnostics;
}

export interface ReconcileSleeperRostersInput {
  rosters: SleeperRoster[];
  players: SleeperRosterSyncPlayer[];
  teams: SleeperRosterSyncTeam[];
  loggedPlayerIds: Set<number>;
}

export interface SleeperRosterSyncPlayer {
  id: number;
  sleeperId: string | null;
  name: string;
  pos: string;
  nflTeam: string;
  budget: number;
}

export interface SleeperRosterSyncTeam {
  id: number;
  sleeperRosterId: number | null;
  handle: string;
  displayName: string | null;
}

export function reconcileSleeperRosters(input: ReconcileSleeperRostersInput): SleeperRosterPreview {
  const teamsByRosterId = new Map<number, SleeperRosterSyncTeam>();
  const duplicateMappedRosterIds = new Set<number>();

  for (const team of input.teams) {
    if (team.sleeperRosterId === null) continue;

    if (teamsByRosterId.has(team.sleeperRosterId)) {
      duplicateMappedRosterIds.add(team.sleeperRosterId);
      continue;
    }

    teamsByRosterId.set(team.sleeperRosterId, team);
  }

  const playersBySleeperId = new Map(
    input.players.flatMap((player) =>
      player.sleeperId ? [[player.sleeperId, player] as const] : [],
    ),
  );
  const actionable: SleeperRosterActionableRow[] = [];
  const unresolved: SleeperRosterUnresolvedRow[] = [];
  const unmappedRosterIds: number[] = [];
  let alreadyLoggedCount = 0;

  for (const roster of input.rosters) {
    const team = teamsByRosterId.get(roster.roster_id);
    if (!team) {
      unmappedRosterIds.push(roster.roster_id);
      continue;
    }

    if (duplicateMappedRosterIds.has(roster.roster_id)) continue;

    for (const sleeperId of roster.players ?? []) {
      const player = playersBySleeperId.get(sleeperId);
      if (!player) {
        unresolved.push({ sleeperId, sleeperRosterId: roster.roster_id });
        continue;
      }

      if (input.loggedPlayerIds.has(player.id)) {
        alreadyLoggedCount++;
        continue;
      }

      actionable.push({
        playerId: player.id,
        sleeperId,
        playerName: player.name,
        position: player.pos,
        nflTeam: player.nflTeam,
        targetBudget: player.budget,
        teamId: team.id,
        teamHandle: team.handle,
        teamDisplayName: team.displayName,
        sleeperRosterId: roster.roster_id,
      });
    }
  }

  return {
    actionable,
    unresolved,
    diagnostics: {
      alreadyLoggedCount,
      unmappedRosterIds,
      duplicateMappedRosterIds: [...duplicateMappedRosterIds],
    },
  };
}
