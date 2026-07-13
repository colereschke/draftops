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
  marketBucket: MarketBucket;
  valueSource: ValueSource;
}

export interface ProjectionMarketValueSettings {
  players: ProjectionMarketValueInput[];
}

interface PlayerWithBucket extends ProjectionMarketValueInput {
  marketBucket: MarketBucket;
  rawScoringLift: number | null;
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
  const bucketBySleeperId = calculateBuckets(settings.players);
  const rawValues: PlayerWithBucket[] = settings.players.map((player) => ({
    ...player,
    marketBucket: bucketBySleeperId.get(player.sleeperId) ?? 'depth',
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
    player.projectedPoints <= 0 ||
    !Number.isFinite(player.baselineProjectedPoints) ||
    !Number.isFinite(player.projectedPoints)
  ) {
    return null;
  }
  return player.projectedPoints / player.baselineProjectedPoints;
}

function calculatePeerAverages(players: PlayerWithBucket[]): Map<string, number> {
  const buckets = new Map<string, number[]>();

  for (const player of players) {
    if (player.rawScoringLift === null) continue;
    const key = peerKey(player);
    const existing = buckets.get(key) ?? [];
    existing.push(player.rawScoringLift);
    buckets.set(key, existing);
  }

  return new Map(
    Array.from(buckets.entries()).map(([key, values]) => [
      key,
      values.reduce((sum, value) => sum + value, 0) / values.length,
    ]),
  );
}

function calculateBuckets(players: ProjectionMarketValueInput[]): Map<string, MarketBucket> {
  const result = new Map<string, MarketBucket>();

  for (const position of ['QB', 'RB', 'WR', 'TE'] as const) {
    const positionalPlayers = players
      .filter((player) => player.position === position)
      .slice()
      .sort((a, b) => b.fallbackAuctionValue - a.fallbackAuctionValue);

    positionalPlayers.forEach((player, index) => {
      const percentile = positionalPlayers.length <= 1 ? 0 : index / positionalPlayers.length;
      result.set(player.sleeperId, bucketForPercentile(percentile));
    });
  }

  return result;
}

function bucketForPercentile(percentile: number): MarketBucket {
  if (percentile < 0.2) return 'elite';
  if (percentile < 0.5) return 'starter';
  return 'depth';
}

function peerKey(player: Pick<PlayerWithBucket, 'position' | 'marketBucket'>): string {
  return `${player.position}:${player.marketBucket}`;
}

function calculateMultiplier(position: MarketValuePosition, relativeScoringLift: number): number {
  const band = POSITION_BANDS[position];
  return clamp(1 + (relativeScoringLift - 1) * SENSITIVITY, band.floor, band.ceiling);
}

function fallbackOutput(player: PlayerWithBucket): ProjectionMarketValueOutput {
  return {
    ...player,
    activeAuctionValue: player.fallbackAuctionValue,
    relativeScoringLift: null,
    projectionMarketMultiplier: 1,
    valueSource: 'fallback',
  };
}

function clamp(value: number, floor: number, ceiling: number): number {
  return Math.min(ceiling, Math.max(floor, value));
}
