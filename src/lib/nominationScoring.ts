import type { Player, TeamStats, AuctionResultEntry, Position } from '@/types';

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
  watchlist: Array<number | string>,
  nominated: Array<number | string>,
  myHandle: string,
  targetRoster: Partial<Record<Position, number>>,
): ScoredPlayer[] {
  const wonPlayerIds = new Set(
    auctionResults.flatMap((result) =>
      typeof result.playerId === 'number' ? [result.playerId] : [],
    ),
  );
  const legacyWonPlayerNames = new Set(
    auctionResults.flatMap((result) =>
      typeof result.playerId === 'number' ? [] : [result.player],
    ),
  );
  const watchlistSet = new Set(watchlist);
  const nominatedSet = new Set(nominated);
  const rivals = teamStats.filter((t) => t.handle !== myHandle && t.buyingPower > 0);

  const teamPosCounts: Record<number, Partial<Record<string, number>>> = {};
  for (const result of auctionResults) {
    if (!teamPosCounts[result.teamId]) teamPosCounts[result.teamId] = {};
    const counts = teamPosCounts[result.teamId];
    counts[result.position] = (counts[result.position] ?? 0) + 1;
  }

  const available = players.filter(
    (p) =>
      !isExcludedByIdentity(p, wonPlayerIds, legacyWonPlayerNames) &&
      !isListedByIdentity(p, watchlistSet) &&
      !isListedByIdentity(p, nominatedSet),
  );

  const scored: ScoredPlayer[] = available.map((player) => {
    const target = targetRoster[player.pos];
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

  return scored
    .filter((s) => s.nominationScore > 0)
    .sort((a, b) => b.nominationScore - a.nominationScore);
}

function isListedByIdentity(player: Player, identities: Set<number | string>): boolean {
  if (player.id !== undefined && identities.has(player.id)) return true;
  return identities.has(player.player);
}

function isExcludedByIdentity(
  player: Player,
  wonPlayerIds: Set<number>,
  legacyWonPlayerNames: Set<string>,
): boolean {
  if (player.id !== undefined) return wonPlayerIds.has(player.id);
  return legacyWonPlayerNames.has(player.player);
}
