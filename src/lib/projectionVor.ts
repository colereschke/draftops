import type { Position, ScoringSettings, StartingSlot } from '@/types';

type VorPosition = 'QB' | 'RB' | 'WR' | 'TE';

export interface ProjectionValueInput {
  sleeperId: string;
  name: string;
  position: VorPosition;
  projectedPoints: number | null;
  fallbackAuctionValue: number;
  isRookie?: boolean;
}

export interface ProjectionValueOutput extends ProjectionValueInput {
  replacementPoints: number | null;
  vor: number | null;
  projectionAuctionValue: number | null;
  activeAuctionValue: number;
}

export interface ProjectionValueSettings {
  players: ProjectionValueInput[];
  teamCount: number;
  rosterSize: number;
  budget: number;
  startingLineup: StartingSlot[];
  targetRoster: Partial<Record<Position, number>>;
  scoringSettings: ScoringSettings;
  activateProjectionValues?: boolean;
}

export function calculateProjectionValues(
  settings: ProjectionValueSettings,
): ProjectionValueOutput[] {
  const projected = settings.players.filter((player) => player.projectedPoints !== null);
  const replacementByPosition = computeReplacementPoints(projected, settings);
  const withVor: ProjectionValueOutput[] = settings.players.map((player) => {
    if (player.projectedPoints === null) {
      return {
        ...player,
        replacementPoints: null,
        vor: null,
        projectionAuctionValue: null,
        activeAuctionValue: player.fallbackAuctionValue,
      };
    }

    const replacement = replacementByPosition[player.position] ?? 0;
    const vor = Math.max(0, player.projectedPoints - replacement);
    return {
      ...player,
      replacementPoints: replacement,
      vor,
      projectionAuctionValue: null,
      activeAuctionValue: player.fallbackAuctionValue,
    };
  });

  const positiveVor = withVor.reduce((sum, player) => sum + (player.vor ?? 0), 0);
  const totalBudget = settings.teamCount * settings.budget;
  const reservedMinimum = settings.teamCount * settings.rosterSize;
  const allocatable = Math.max(0, totalBudget - reservedMinimum);

  return withVor.map((player) => {
    if (player.vor === null) return player;
    const projectionAuctionValue =
      player.vor > 0 && positiveVor > 0
        ? Math.max(1, Math.round((player.vor / positiveVor) * allocatable))
        : 1;
    const activeAuctionValue = computeActiveAuctionValue({
      fallbackAuctionValue: player.fallbackAuctionValue,
      projectionAuctionValue,
      isRookie: player.isRookie ?? false,
      activateProjectionValues: settings.activateProjectionValues ?? false,
    });
    return { ...player, projectionAuctionValue, activeAuctionValue };
  });
}

function computeReplacementPoints(
  players: ProjectionValueInput[],
  settings: ProjectionValueSettings,
): Partial<Record<VorPosition, number>> {
  const result: Partial<Record<VorPosition, number>> = {};
  for (const position of ['QB', 'RB', 'WR', 'TE'] as const) {
    const target = Math.max(1, settings.targetRoster[position] ?? 1);
    const replacementIndex = Math.max(0, Math.ceil(settings.teamCount * target) - 1);
    const sorted = players
      .filter((player) => player.position === position && player.projectedPoints !== null)
      .sort((a, b) => (b.projectedPoints ?? 0) - (a.projectedPoints ?? 0));
    result[position] = sorted[Math.min(replacementIndex, sorted.length - 1)]?.projectedPoints ?? 0;
  }
  return result;
}

interface ActiveValueInput {
  fallbackAuctionValue: number;
  projectionAuctionValue: number;
  isRookie: boolean;
  activateProjectionValues: boolean;
}

function computeActiveAuctionValue(input: ActiveValueInput): number {
  if (!input.activateProjectionValues) return input.fallbackAuctionValue;
  if (input.isRookie) {
    return Math.max(input.fallbackAuctionValue, input.projectionAuctionValue);
  }
  return input.projectionAuctionValue;
}
