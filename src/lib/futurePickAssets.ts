import type { FuturePickAuctionMode, Player } from '@/types';

export const FUTURE_PICK_AUCTION_MODES = ['packages', 'individual', 'none'] as const;

const PACKAGE_BASELINE = { budget: 109, ceiling: 131, floor: 75 };
const ROUND_BASELINES: Record<1 | 2 | 3, { budget: number; ceiling: number; floor: number }> = {
  1: { budget: 75, ceiling: 90, floor: 52 },
  2: { budget: 15, ceiling: 18, floor: 10 },
  3: { budget: 5, ceiling: 6, floor: 5 },
};

interface PickBaseline {
  budget: number;
  ceiling: number;
  floor: number;
}

interface FuturePickTeamInput {
  handle: string;
  displayName: string | null;
}

export interface FuturePickBaselines {
  package?: PickBaseline;
  rounds?: Partial<Record<1 | 2 | 3, PickBaseline>>;
}

interface GenerateFuturePickAssetsInput {
  teams: FuturePickTeamInput[];
  year: number;
  startingRank: number;
  baselines?: FuturePickBaselines;
}

export function isFuturePickAuctionMode(value: unknown): value is FuturePickAuctionMode {
  return (
    typeof value === 'string' && FUTURE_PICK_AUCTION_MODES.includes(value as FuturePickAuctionMode)
  );
}

export function getNextFuturePickYear(createdAt: Date | string | null | undefined): number {
  const createdDate =
    createdAt instanceof Date
      ? createdAt
      : createdAt
        ? new Date(createdAt)
        : new Date('2026-01-01');
  const createdYear = createdDate.getUTCFullYear();
  return createdYear + 1;
}

export function fromPrismaFuturePickMode(mode: string | null | undefined): FuturePickAuctionMode {
  if (mode === 'INDIVIDUAL') return 'individual';
  if (mode === 'NONE') return 'none';
  return 'packages';
}

export function generateFuturePickAssets({
  teams,
  year,
  startingRank,
  baselines,
}: GenerateFuturePickAssetsInput): Player[] {
  const roundBaselines = {
    1: baselines?.rounds?.[1] ?? ROUND_BASELINES[1],
    2: baselines?.rounds?.[2] ?? ROUND_BASELINES[2],
    3: baselines?.rounds?.[3] ?? ROUND_BASELINES[3],
  } satisfies Record<1 | 2 | 3, PickBaseline>;
  const hasRoundOverrides = Object.keys(baselines?.rounds ?? {}).length > 0;
  const packageBaseline =
    baselines?.package ??
    (hasRoundOverrides ? sumPackageBaseline(roundBaselines) : PACKAGE_BASELINE);

  return teams.flatMap((team, teamIndex) => {
    const rankBase = startingRank + teamIndex * 4;
    const packageAsset: Player = {
      player: `${team.handle}'s ${year} package`,
      team: team.handle,
      pos: 'PKG',
      age: null,
      sfRank: rankBase,
      budget: packageBaseline.budget,
      ceiling: packageBaseline.ceiling,
      floor: packageBaseline.floor,
      notes: `${team.handle}'s ${year} 1st+2nd+3rd`,
      baseBudget: packageBaseline.budget,
      baseCeiling: packageBaseline.ceiling,
      baseFloor: packageBaseline.floor,
      futurePickYear: year,
      futurePickRound: null,
      futurePickOriginHandle: team.handle,
      futurePickAssetKind: 'package',
    };

    const picks: Player[] = ([1, 2, 3] as const).map((round) => {
      const baseline = roundBaselines[round];
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

export function inferFuturePickBaselines(players: Player[]): FuturePickBaselines | undefined {
  const packageBaseline = players.find((player) => player.pos === 'PKG');
  const rounds = ([1, 2, 3] as const).reduce<Partial<Record<1 | 2 | 3, PickBaseline>>>(
    (acc, round) => {
      const roundPick = players.find(
        (player) =>
          player.pos === 'PICK' &&
          (player.futurePickRound === round || hasRoundInName(player.player, round)),
      );
      if (roundPick) acc[round] = toPickBaseline(roundPick);
      return acc;
    },
    {},
  );

  if (!packageBaseline && Object.keys(rounds).length === 0) return undefined;

  return {
    package: packageBaseline ? toPickBaseline(packageBaseline) : undefined,
    rounds,
  };
}

export function filterFuturePickAssetsForMode(
  players: Player[],
  mode: FuturePickAuctionMode,
): Player[] {
  return players.filter((player) => {
    const assetKind = player.futurePickAssetKind;
    if (!assetKind) return !isStaticFuturePickRow(player);
    if (mode === 'none') return false;
    if (mode === 'packages') return assetKind === 'package';
    return assetKind === 'pick';
  });
}

export function excludeStaticFuturePickRows(players: Player[]): Player[] {
  return players.filter((player) => !(player.pos === 'PICK' || player.pos === 'PKG'));
}

function isStaticFuturePickRow(player: Player): boolean {
  return !player.futurePickAssetKind && (player.pos === 'PKG' || player.pos === 'PICK');
}

function sumPackageBaseline(rounds: Record<1 | 2 | 3, PickBaseline>): PickBaseline {
  const budget = rounds[1].budget + rounds[2].budget + rounds[3].budget;
  return {
    budget,
    ceiling: Math.round(budget * 1.15),
    floor: Math.max(5, Math.round(budget * 0.87)),
  };
}

function toPickBaseline(player: Player): PickBaseline {
  return {
    budget: player.budget,
    ceiling: player.ceiling,
    floor: player.floor,
  };
}

function hasRoundInName(name: string, round: 1 | 2 | 3): boolean {
  return name.toLowerCase().includes(ordinal(round));
}

function ordinal(round: 1 | 2 | 3): string {
  if (round === 1) return '1st';
  if (round === 2) return '2nd';
  return '3rd';
}
