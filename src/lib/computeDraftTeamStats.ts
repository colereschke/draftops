import { countsTowardRoster } from '@/lib/rosterPolicy';
import type { Player, RosterEntry, TeamWithRoster } from '@/types';

export interface DraftTeamResultInput {
  id: number;
  playerId: number;
  player: string;
  position: string;
  nflTeam: string;
  price: number;
  sfRank: number | null;
  teamId: number;
}

export interface DraftTeamStatsInput {
  id: number;
  handle: string;
  displayName: string | null;
  budget: number;
  results: DraftTeamResultInput[];
}

export interface ComputeDraftTeamStatsInput {
  teams: DraftTeamStatsInput[];
  players: Player[];
  rosterSize: number;
  budgetDeltaByTeamId?: ReadonlyMap<number, number>;
}

export function computeDraftTeamStats({
  teams,
  players,
  rosterSize,
  budgetDeltaByTeamId,
}: ComputeDraftTeamStatsInput): TeamWithRoster[] {
  const playersById = new Map(
    players.flatMap((player) => (player.id === undefined ? [] : [[player.id, player] as const])),
  );
  return teams.map((team) => {
    const spent = team.results.reduce((sum, result) => sum + result.price, 0);
    const remaining = team.budget + (budgetDeltaByTeamId?.get(team.id) ?? 0) - spent;
    const rosterCount = team.results.filter((result) => countsTowardRoster(result.position)).length;
    const rosterRemaining = rosterSize - rosterCount;
    const results: RosterEntry[] = [];
    const knownAges: number[] = [];

    for (const result of team.results) {
      const player = playersById.get(result.playerId);

      results.push({
        ...result,
        teamHandle: team.handle,
        delta: player === undefined ? null : result.price - player.budget,
      });

      if (countsTowardRoster(result.position) && player?.age !== undefined && player.age !== null) {
        knownAges.push(player.age);
      }
    }

    return {
      id: team.id,
      handle: team.handle,
      displayName: team.displayName,
      budget: team.budget,
      spent,
      remaining,
      rosterCount,
      rosterRemaining,
      buyingPower: remaining - rosterRemaining,
      pkgCount: team.results.filter((result) => result.position === 'PKG').length,
      avgAge:
        knownAges.length === 0
          ? null
          : knownAges.reduce((sum, age) => sum + age, 0) / knownAges.length,
      results,
    };
  });
}
