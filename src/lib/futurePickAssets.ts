import type { FuturePickAuctionMode, Player } from '@/types';

export const FUTURE_PICK_AUCTION_MODES = ['packages', 'individual', 'none'] as const;

const PACKAGE_BASELINE = { budget: 109, ceiling: 131, floor: 75 };
const ROUND_BASELINES: Record<1 | 2 | 3, { budget: number; ceiling: number; floor: number }> = {
  1: { budget: 75, ceiling: 90, floor: 52 },
  2: { budget: 15, ceiling: 18, floor: 10 },
  3: { budget: 5, ceiling: 6, floor: 5 },
};

interface FuturePickTeamInput {
  handle: string;
  displayName: string | null;
}

interface GenerateFuturePickAssetsInput {
  teams: FuturePickTeamInput[];
  year: number;
  startingRank: number;
}

export function isFuturePickAuctionMode(value: unknown): value is FuturePickAuctionMode {
  return (
    typeof value === 'string' && FUTURE_PICK_AUCTION_MODES.includes(value as FuturePickAuctionMode)
  );
}

export function generateFuturePickAssets({
  teams,
  year,
  startingRank,
}: GenerateFuturePickAssetsInput): Player[] {
  return teams.flatMap((team, teamIndex) => {
    const rankBase = startingRank + teamIndex * 4;
    const packageAsset: Player = {
      player: `${team.handle} ${year} Pick Package`,
      team: team.handle,
      pos: 'PKG',
      age: null,
      sfRank: rankBase,
      budget: PACKAGE_BASELINE.budget,
      ceiling: PACKAGE_BASELINE.ceiling,
      floor: PACKAGE_BASELINE.floor,
      notes: `${team.handle}'s ${year} 1st+2nd+3rd`,
      baseBudget: PACKAGE_BASELINE.budget,
      baseCeiling: PACKAGE_BASELINE.ceiling,
      baseFloor: PACKAGE_BASELINE.floor,
      futurePickYear: year,
      futurePickRound: null,
      futurePickOriginHandle: team.handle,
      futurePickAssetKind: 'package',
    };

    const picks: Player[] = ([1, 2, 3] as const).map((round) => {
      const baseline = ROUND_BASELINES[round];
      return {
        player: `${team.handle} ${year} ${ordinal(round)}`,
        team: team.handle,
        pos: 'PICK',
        age: null,
        sfRank: rankBase + round,
        budget: baseline.budget,
        ceiling: baseline.ceiling,
        floor: baseline.floor,
        notes: `${team.handle}'s ${year} ${ordinal(round)} round pick`,
        baseBudget: baseline.budget,
        baseCeiling: baseline.ceiling,
        baseFloor: baseline.floor,
        futurePickYear: year,
        futurePickRound: round,
        futurePickOriginHandle: team.handle,
        futurePickAssetKind: 'pick',
      };
    });

    return [packageAsset, ...picks];
  });
}

export function filterFuturePickAssetsForMode(
  players: Player[],
  mode: FuturePickAuctionMode,
): Player[] {
  return players.filter((player) => {
    if (!player.futurePickAssetKind) return true;
    if (mode === 'none') return false;
    if (mode === 'packages') return player.futurePickAssetKind === 'package';
    return player.futurePickAssetKind === 'pick';
  });
}

function ordinal(round: 1 | 2 | 3): string {
  if (round === 1) return '1st';
  if (round === 2) return '2nd';
  return '3rd';
}
