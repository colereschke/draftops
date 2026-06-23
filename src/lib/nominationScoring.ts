import type { Player, TeamStats, AuctionResultEntry } from '@/types';
import { TARGET_ROSTER } from '@/lib/teams';

export interface RivalContribution {
  handle: string;
  contribution: number;
  pct: number;
}

export interface ScoredPlayer {
  player: Player;
  nominationScore: number;
  rivalContributions: RivalContribution[];
}

export function computeNominationScores(
  players: Player[],
  teamStats: TeamStats[],
  auctionResults: AuctionResultEntry[],
  watchlist: string[],
  myHandle: string,
): ScoredPlayer[] {
  const wonPlayerNames = new Set(auctionResults.map((r) => r.player));
  const watchlistSet = new Set(watchlist);
  const rivals = teamStats.filter((t) => t.handle !== myHandle && t.buyingPower > 0);

  const teamPosCounts: Record<number, Partial<Record<string, number>>> = {};
  for (const result of auctionResults) {
    if (!teamPosCounts[result.teamId]) teamPosCounts[result.teamId] = {};
    const counts = teamPosCounts[result.teamId];
    counts[result.position] = (counts[result.position] ?? 0) + 1;
  }

  const available = players.filter(
    (p) => !wonPlayerNames.has(p.player) && !watchlistSet.has(p.player),
  );

  const scored: ScoredPlayer[] = available.map((player) => {
    const target = TARGET_ROSTER[player.pos];
    if (target === undefined) {
      return { player, nominationScore: 0, rivalContributions: [] };
    }

    const rivalContributions: RivalContribution[] = rivals.map((team) => {
      const countAtPos = teamPosCounts[team.id]?.[player.pos] ?? 0;
      const needRatio = Math.max(0, (target - countAtPos) / target);
      const contribution = team.buyingPower * needRatio;
      return { handle: team.handle, contribution, pct: 0 };
    });

    const rivalDemand = rivalContributions.reduce((sum, r) => sum + r.contribution, 0);
    const nominationScore = rivalDemand * player.ceiling;

    for (const r of rivalContributions) {
      r.pct = rivalDemand > 0 ? (r.contribution / rivalDemand) * 100 : 0;
    }

    return {
      player,
      nominationScore,
      rivalContributions: rivalContributions
        .filter((r) => r.contribution > 0)
        .sort((a, b) => b.contribution - a.contribution),
    };
  });

  return scored.sort((a, b) => b.nominationScore - a.nominationScore);
}
