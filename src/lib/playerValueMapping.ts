import type { FuturePickAssetKind, Player, Position } from '@/types';

export interface DbPlayerValueRow {
  id: number;
  name: string;
  nflTeam: string;
  pos: string;
  age: number | null;
  sfRank: number;
  budget: number;
  ceiling: number;
  floor: number;
  notes: string;
  sleeperId: string | null;
  futurePickYear?: number | null;
  futurePickRound?: number | null;
  futurePickOriginHandle?: string | null;
  futurePickAssetKind?: string | null;
}

export interface DraftPlayerValueRow {
  playerId: number;
  projectionSourceId: number | null;
  projectedPoints: number | null;
  replacementPoints: number | null;
  vor: number | null;
  projectionAuctionValue: number | null;
  fallbackAuctionValue: number;
  activeAuctionValue: number;
  valueSource: string;
  updatedAt: Date;
}

export function mapPlayersWithDraftValues(
  players: DbPlayerValueRow[],
  draftValues: DraftPlayerValueRow[],
): Player[] {
  const valuesByPlayerId = new Map<number, DraftPlayerValueRow>();

  for (const value of draftValues) {
    const current = valuesByPlayerId.get(value.playerId);
    if (!current || compareDraftValueRows(value, current) < 0) {
      valuesByPlayerId.set(value.playerId, value);
    }
  }

  return players.map((player) => {
    const draftValue = valuesByPlayerId.get(player.id);
    if (!draftValue) {
      return mapFallbackPlayer(player);
    }

    const activeTarget = draftValue.activeAuctionValue;

    return {
      player: player.name,
      team: player.nflTeam,
      pos: player.pos as Position,
      age: player.age,
      sfRank: player.sfRank,
      budget: activeTarget,
      ceiling: calculateCeiling(activeTarget),
      floor: calculateFloor(activeTarget),
      notes: player.notes,
      sleeperId: player.sleeperId,
      baseBudget: player.budget,
      baseCeiling: player.ceiling,
      baseFloor: player.floor,
      projectionAuctionValue: draftValue.projectionAuctionValue,
      projectedPoints: draftValue.projectedPoints,
      replacementPoints: draftValue.replacementPoints,
      vor: draftValue.vor,
      futurePickYear: player.futurePickYear ?? null,
      futurePickRound: player.futurePickRound ?? null,
      futurePickOriginHandle: player.futurePickOriginHandle ?? null,
      futurePickAssetKind: normalizeFuturePickAssetKind(player.futurePickAssetKind ?? null),
      valueSource: draftValue.valueSource,
    };
  });
}

function mapFallbackPlayer(player: DbPlayerValueRow): Player {
  return {
    player: player.name,
    team: player.nflTeam,
    pos: player.pos as Position,
    age: player.age,
    sfRank: player.sfRank,
    budget: player.budget,
    ceiling: player.ceiling,
    floor: player.floor,
    notes: player.notes,
    sleeperId: player.sleeperId,
    baseBudget: player.budget,
    baseCeiling: player.ceiling,
    baseFloor: player.floor,
    futurePickYear: player.futurePickYear ?? null,
    futurePickRound: player.futurePickRound ?? null,
    futurePickOriginHandle: player.futurePickOriginHandle ?? null,
    futurePickAssetKind: normalizeFuturePickAssetKind(player.futurePickAssetKind ?? null),
    valueSource: 'fallback',
  };
}

function normalizeFuturePickAssetKind(value: string | null): FuturePickAssetKind | null {
  if (value === 'package' || value === 'pick') return value;
  return null;
}

function compareDraftValueRows(a: DraftPlayerValueRow, b: DraftPlayerValueRow): number {
  const aHasProjection = a.projectionSourceId !== null;
  const bHasProjection = b.projectionSourceId !== null;

  if (aHasProjection !== bHasProjection) return aHasProjection ? -1 : 1;
  return b.updatedAt.getTime() - a.updatedAt.getTime();
}

function calculateFloor(activeTarget: number): number {
  return Math.max(5, Math.round((activeTarget * 87) / 100));
}

function calculateCeiling(activeTarget: number): number {
  return Math.round((activeTarget * 115) / 100);
}
