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
    const rosterCount = team.results.length;
    const rosterRemaining = rosterSize - rosterCount;
    const buyingPower = remaining - rosterRemaining;
    const pkgCount = team.results.filter((r) => r.position === 'PKG').length;

    const results: RosterEntry[] = [];
    const knownAges: number[] = [];
    for (const r of team.results) {
      const target = players.find((p) => p.player === r.player);
      const delta = target != null ? r.price - target.budget : null;
      results.push({
        id: r.id,
        player: r.player,
        position: r.position,
        nflTeam: r.nflTeam,
        price: r.price,
        sfRank: r.sfRank,
        teamId: r.teamId,
        teamHandle: team.handle,
        delta,
      });
      if (target?.age != null) knownAges.push(target.age);
    }
    const avgAge =
      knownAges.length > 0 ? knownAges.reduce((sum, age) => sum + age, 0) / knownAges.length : null;

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
      avgAge,
      results,
    };
  });
}
