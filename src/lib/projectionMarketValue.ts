import type { Position } from '@/types';

type MarketValuePosition = 'QB' | 'RB' | 'WR' | 'TE';
type ValueSource = 'fallback' | 'projection_adjusted_market';
type MarketBucket = 'elite' | 'starter' | 'depth';

export interface ProjectionMarketValueInput {
  sleeperId: string;
  name: string;
  position: MarketValuePosition;
  fallbackAuctionValue: number;
  baselineProjectedPoints: number | null;
  projectedPoints: number | null;
  isRookie?: boolean;
}

export interface ProjectionMarketValueOutput extends ProjectionMarketValueInput {
  activeAuctionValue: number;
  rawScoringLift: number | null;
  relativeScoringLift: number | null;
  projectionMarketMultiplier: number;
  valueSource: ValueSource;
}

interface ProjectionMarketValueSettings {
  players: ProjectionMarketValueInput[];
}

interface CalibrationBand {
  floor: number;
  ceiling: number;
}

const SENSITIVITY = 0.75;

const DEFAULT_BAND: CalibrationBand = { floor: 0.85, ceiling: 1.25 };

const POSITION_BANDS: Record<MarketValuePosition, CalibrationBand> = {
  QB: { floor: 0.9, ceiling: 1.2 },
  RB: DEFAULT_BAND,
  WR: DEFAULT_BAND,
  TE: { floor: 0.8, ceiling: 1.35 },
};

export function calculateProjectionMarketValues(
  settings: ProjectionMarketValueSettings,
): ProjectionMarketValueOutput[] {
  const rawValues = settings.players.map((player) => ({
    ...player,
    rawScoringLift: calculateRawLift(player),
  }));
  const peerAverageByKey = calculatePeerAverages(rawValues);

  return rawValues.map((player) => {
    if (player.rawScoringLift === null) {
      return fallbackOutput(player);
    }

    const peerAverage = peerAverageByKey.get(peerKey(player));
    if (!peerAverage || peerAverage <= 0) {
      return fallbackOutput(player);
    }

    const relativeScoringLift = player.rawScoringLift / peerAverage;
    const projectionMarketMultiplier = calculateMultiplier(player.position, relativeScoringLift);
    const adjustedValue = Math.max(
      1,
      Math.round(player.fallbackAuctionValue * projectionMarketMultiplier),
    );
    const activeAuctionValue =
      player.isRookie === true
        ? Math.max(player.fallbackAuctionValue, adjustedValue)
        : adjustedValue;

    return {
      ...player,
      activeAuctionValue,
      relativeScoringLift,
      projectionMarketMultiplier,
      valueSource: 'projection_adjusted_market',
    };
  });
}

function calculateRawLift(player: ProjectionMarketValueInput): number | null {
  if (
    player.baselineProjectedPoints === null ||
    player.projectedPoints === null ||
    player.baselineProjectedPoints <= 0 ||
    !Number.isFinite(player.baselineProjectedPoints) ||
    !Number.isFinite(player.projectedPoints)
  ) {
    return null;
  }
  return player.projectedPoints / player.baselineProjectedPoints;
}

function calculatePeerAverages(
  players: Array<ProjectionMarketValueInput & { rawScoringLift: number | null }>,
): Map<string, number> {
  const buckets = new Map<string, number[]>();
  const positionBuckets = new Map<MarketValuePosition, number[]>();

  for (const player of players) {
    if (player.rawScoringLift === null) continue;
    const key = peerKey(player);
    const existing = buckets.get(key) ?? [];
    existing.push(player.rawScoringLift);
    buckets.set(key, existing);

    const positionExisting = positionBuckets.get(player.position) ?? [];
    positionExisting.push(player.rawScoringLift);
    positionBuckets.set(player.position, positionExisting);
  }

  return new Map(
    Array.from(buckets.entries()).map(([key, values]) => {
      const [position] = key.split(':');
      const averageValues =
        values.length > 1 && isMarketValuePosition(position)
          ? values
          : (positionBuckets.get(position as MarketValuePosition) ?? values);

      return [key, averageValues.reduce((sum, value) => sum + value, 0) / averageValues.length];
    }),
  );
}

function peerKey(player: Pick<ProjectionMarketValueInput, 'position' | 'fallbackAuctionValue'>) {
  return `${player.position}:${marketBucket(player)}`;
}

function marketBucket(
  player: Pick<ProjectionMarketValueInput, 'fallbackAuctionValue'>,
): MarketBucket {
  if (player.fallbackAuctionValue >= 75) return 'elite';
  if (player.fallbackAuctionValue >= 25) return 'starter';
  return 'depth';
}

function calculateMultiplier(position: Position, relativeScoringLift: number): number {
  const band = isMarketValuePosition(position) ? POSITION_BANDS[position] : DEFAULT_BAND;
  return clamp(1 + (relativeScoringLift - 1) * SENSITIVITY, band.floor, band.ceiling);
}

function fallbackOutput(
  player: ProjectionMarketValueInput & { rawScoringLift: number | null },
): ProjectionMarketValueOutput {
  return {
    ...player,
    activeAuctionValue: player.fallbackAuctionValue,
    relativeScoringLift: null,
    projectionMarketMultiplier: 1,
    valueSource: 'fallback',
  };
}

function isMarketValuePosition(position: string): position is MarketValuePosition {
  return position === 'QB' || position === 'RB' || position === 'WR' || position === 'TE';
}

function clamp(value: number, floor: number, ceiling: number): number {
  return Math.min(ceiling, Math.max(floor, value));
}
