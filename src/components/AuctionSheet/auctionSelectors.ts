import type { ClaimedBid, LeagueTeam, Player } from '@/types';
import type { PositionFilter, StrategyFilter } from './FilterControls';
import type { SortKey } from './PlayerTable';

export type AuctionIdentityKey = number | string;

type AuctionPosition = 'QB' | 'RB' | 'WR' | 'TE';

export interface AuctionPositionStats {
  count: number;
  total: number;
}

export interface AuctionMetrics {
  mySpent: number;
  posStats: Record<AuctionPosition, AuctionPositionStats>;
  grandTotal: number;
  totalPlayerCount: number;
  futurePickYear: number | null;
}

export interface AuctionPlayerSelectionOptions {
  players: Player[];
  claimMap: Map<AuctionIdentityKey, ClaimedBid>;
  posFilter: PositionFilter;
  strategyFilter: StrategyFilter;
  hasStrategyTags: boolean;
  search: string;
  availableOnly: boolean;
  sortBy: SortKey;
  sortDir: 'asc' | 'desc';
}

const AUCTION_POSITIONS: AuctionPosition[] = ['QB', 'RB', 'WR', 'TE'];

export function getPlayerIdentityKey(player: Player): AuctionIdentityKey {
  return player.id ?? player.player;
}

export function getBidIdentityKey(bid: ClaimedBid): AuctionIdentityKey {
  return bid.playerId ?? bid.player;
}

export function createClaimMap(bids: ClaimedBid[]): Map<AuctionIdentityKey, ClaimedBid> {
  return new Map(bids.map((bid) => [getBidIdentityKey(bid), bid]));
}

export function createNominatedSet(
  nominatedPlayers: Array<number | string>,
  extraNominated: Array<number | string>,
  clearedNominations: Set<number | string>,
): Set<AuctionIdentityKey> {
  return new Set(
    [...nominatedPlayers, ...extraNominated].filter(
      (playerId) => !clearedNominations.has(playerId),
    ),
  );
}

export function selectAuctionPlayers(options: AuctionPlayerSelectionOptions): Player[] {
  return options.players
    .filter((player) => matchesAuctionFilters(player, options))
    .sort((left, right) => compareAuctionPlayers(left, right, options));
}

export function getAuctionMetrics(
  players: Player[],
  claimMap: Map<AuctionIdentityKey, ClaimedBid>,
  teams: LeagueTeam[],
  ownerHandle: string | null,
): AuctionMetrics {
  const myTeam = ownerHandle ? teams.find((team) => team.handle === ownerHandle) : null;
  const mySpent = myTeam
    ? Array.from(claimMap.values())
        .filter((bid) => bid.teamId === myTeam.id)
        .reduce((total, bid) => total + bid.price, 0)
    : 0;
  const posStats = {} as Record<AuctionPosition, AuctionPositionStats>;

  for (const position of AUCTION_POSITIONS) {
    const availablePlayers = players.filter(
      (player) => player.pos === position && !claimMap.has(getPlayerIdentityKey(player)),
    );
    posStats[position] = {
      count: availablePlayers.length,
      total: availablePlayers.reduce((total, player) => total + player.budget, 0),
    };
  }

  const grandTotal = Object.values(posStats).reduce((total, stats) => total + stats.total, 0);
  const totalPlayerCount = players.filter(
    (player) => player.pos !== 'PKG' && player.pos !== 'PICK',
  ).length;
  const futurePickYear =
    players.find((player) => player.futurePickYear != null)?.futurePickYear ?? null;

  return { mySpent, posStats, grandTotal, totalPlayerCount, futurePickYear };
}

function matchesAuctionFilters(player: Player, options: AuctionPlayerSelectionOptions): boolean {
  if (options.posFilter !== 'ALL' && player.pos !== options.posFilter) return false;
  if (options.availableOnly && options.claimMap.has(getPlayerIdentityKey(player))) return false;
  if (
    options.strategyFilter !== 'ALL' &&
    options.hasStrategyTags &&
    player.strategyTag !== options.strategyFilter
  ) {
    return false;
  }
  if (!options.search) return true;

  const query = options.search.toLowerCase();
  return player.player.toLowerCase().includes(query) || player.team.toLowerCase().includes(query);
}

function compareAuctionPlayers(
  left: Player,
  right: Player,
  options: AuctionPlayerSelectionOptions,
): number {
  if (options.sortBy === 'spread') return compareSpread(left, right, options.sortDir);
  if (options.sortBy === 'claimedPrice') return compareClaimedPrice(left, right, options);
  return compareGenericValue(left, right, options.sortBy, options.sortDir);
}

function compareSpread(left: Player, right: Player, sortDir: 'asc' | 'desc'): number {
  const leftValue = left.spread ?? null;
  const rightValue = right.spread ?? null;
  if (leftValue === null && rightValue === null) return left.sfRank - right.sfRank;
  if (leftValue === null) return 1;
  if (rightValue === null) return -1;
  if (leftValue !== rightValue)
    return sortDir === 'asc' ? leftValue - rightValue : rightValue - leftValue;
  return left.sfRank - right.sfRank;
}

function compareClaimedPrice(
  left: Player,
  right: Player,
  options: AuctionPlayerSelectionOptions,
): number {
  const leftValue = options.claimMap.get(getPlayerIdentityKey(left))?.price ?? null;
  const rightValue = options.claimMap.get(getPlayerIdentityKey(right))?.price ?? null;
  if (leftValue === null && rightValue === null) {
    if (left.budget !== right.budget)
      return options.sortDir === 'asc' ? left.budget - right.budget : right.budget - left.budget;
    return left.sfRank - right.sfRank;
  }
  if (leftValue === null) return 1;
  if (rightValue === null) return -1;
  if (leftValue !== rightValue)
    return options.sortDir === 'asc' ? leftValue - rightValue : rightValue - leftValue;
  return left.sfRank - right.sfRank;
}

function compareGenericValue(
  left: Player,
  right: Player,
  sortBy: Exclude<SortKey, 'claimedPrice' | 'spread'>,
  sortDir: 'asc' | 'desc',
): number {
  let leftValue = getGenericSortValue(left, sortBy);
  let rightValue = getGenericSortValue(right, sortBy);
  if (typeof leftValue === 'string') leftValue = leftValue.toLowerCase();
  if (typeof rightValue === 'string') rightValue = rightValue.toLowerCase();
  if (leftValue < rightValue) return sortDir === 'asc' ? -1 : 1;
  if (leftValue > rightValue) return sortDir === 'asc' ? 1 : -1;
  return left.sfRank - right.sfRank;
}

function getGenericSortValue(
  player: Player,
  sortBy: Exclude<SortKey, 'claimedPrice' | 'spread'>,
): string | number {
  const value = player[sortBy] as string | number | null | undefined;
  return value ?? 9999;
}
