import type { Player, TeamWithRoster, RosterEntry } from '@/types';

interface TeamInput {
  id: number;
  handle: string;
  displayName: string | null;
  budget: number;
  results: Array<{
    id: number;
    player: string;
    position: string;
    nflTeam: string;
    price: number;
    sfRank: number | null;
    teamId: number;
  }>;
}

export function computeTeamStats(
  teams: TeamInput[],
  players: Player[],
  rosterSize: number,
): TeamWithRoster[] {
  return teams.map((team) => {
    const spent = team.results.reduce((sum, r) => sum + r.price, 0);
    const remaining = team.budget - spent;
    const rosterCount = team.results.filter((r) => isRosterPosition(r.position)).length;
    const rosterRemaining = rosterSize - rosterCount;
    const buyingPower = remaining - rosterRemaining;
    const pkgCount = team.results.filter((r) => r.position === 'PKG').length;

    const results: RosterEntry[] = team.results.map((r) => {
      const target = players.find((p) => p.player === r.player);
      const delta = target != null ? r.price - target.budget : null;
      return {
        id: r.id,
        player: r.player,
        position: r.position,
        nflTeam: r.nflTeam,
        price: r.price,
        sfRank: r.sfRank,
        teamId: r.teamId,
        teamHandle: team.handle,
        delta,
      };
    });

    return {
      id: team.id,
      handle: team.handle,
      displayName: team.displayName,
      budget: team.budget,
      spent,
      remaining,
      rosterCount,
      rosterRemaining,
      buyingPower,
      pkgCount,
      results,
    };
  });
}

function isRosterPosition(position: string): boolean {
  return position === 'QB' || position === 'RB' || position === 'WR' || position === 'TE';
}
