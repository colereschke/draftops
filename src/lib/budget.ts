import type { TeamStats } from '@/types';

type TeamWithResults = {
  id: number;
  handle: string;
  displayName: string | null;
  budget: number;
  results: { price: number; position: string }[];
};

export function computeTeamStats(teams: TeamWithResults[], rosterSize: number): TeamStats[] {
  return teams
    .map((team) => {
      const spent = team.results.reduce((s, r) => s + r.price, 0);
      const remaining = team.budget - spent;
      const rosterCount = team.results.filter((r) => isRosterPosition(r.position)).length;
      const rosterRemaining = rosterSize - rosterCount;
      const buyingPower = remaining - rosterRemaining;
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
        pkgCount: 0,
        avgAge: null,
      };
    })
    .sort((a, b) => b.buyingPower - a.buyingPower);
}

function isRosterPosition(position: string): boolean {
  return position === 'QB' || position === 'RB' || position === 'WR' || position === 'TE';
}
