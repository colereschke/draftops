import type { TeamStats } from '@/types';
import { ROSTER_SIZE } from '@/lib/teams';

type TeamWithResults = {
  id: number;
  handle: string;
  displayName: string | null;
  budget: number;
  results: { price: number }[];
};

export function computeTeamStats(teams: TeamWithResults[]): TeamStats[] {
  return teams
    .map((team) => {
      const spent = team.results.reduce((s, r) => s + r.price, 0);
      const remaining = team.budget - spent;
      const rosterCount = team.results.length;
      const rosterRemaining = ROSTER_SIZE - rosterCount;
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
      };
    })
    .sort((a, b) => b.buyingPower - a.buyingPower);
}
