import type { TeamWithRoster, RosterEntry } from '@/types';
import { ROSTER_SIZE } from '@/lib/teams';

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

export function computeTeamStats(teams: TeamInput[]): TeamWithRoster[] {
  return teams.map((team) => {
    const spent = team.results.reduce((sum, r) => sum + r.price, 0);
    const remaining = team.budget - spent;
    const rosterCount = team.results.length;
    const rosterRemaining = ROSTER_SIZE - rosterCount;
    const buyingPower = remaining - rosterRemaining;
    const pkgCount = team.results.filter((r) => r.position === 'PKG').length;

    const results: RosterEntry[] = team.results.map((r) => ({
      id: r.id,
      player: r.player,
      position: r.position,
      nflTeam: r.nflTeam,
      price: r.price,
      sfRank: r.sfRank,
      teamId: r.teamId,
      teamHandle: team.handle,
    }));

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
