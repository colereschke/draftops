import type { Player, StartingSlot } from '@/types';
import { optimizeProjectedLineupPoints } from './lineupOptimizer';

interface BidInput {
  player: string;
  teamHandle: string;
  price: number;
}

interface ApplyDynamicPickValuesInput {
  players: Player[];
  bids: BidInput[];
  startingLineup: StartingSlot[];
}

interface OriginSignals {
  playerCount: number;
  spend: number;
  value: number;
  surplusRate: number;
  lineupPoints: number;
  vor: number;
  avgAge: number | null;
  futureCapital: number;
}

interface OriginRoster {
  playerRoster: Player[];
  futureCapital: number;
  spend: number;
}

const MIN_BIDS = 1;
const MAX_TOTAL_ADJUSTMENT = 0.15;
const MARKET_CENTER_MIN_ORIGINS = 4;
const SURPLUS_ADJUSTMENT_WEIGHT = 0.46;
const LINEUP_STRENGTH_WEIGHT = 0.05;
const VOR_STRENGTH_WEIGHT = 0.05;
const REBUILD_SIGNAL_WEIGHT = 0.08;

export function applyDynamicPickValues({
  players,
  bids,
  startingLineup,
}: ApplyDynamicPickValuesInput): Player[] {
  const signalsByOrigin = computeOriginSignals(players, bids, startingLineup);
  const marketSurplusBaseline = computeMarketSurplusBaseline(signalsByOrigin);

  return players.map((player) => {
    if (!player.futurePickOriginHandle) return player;

    const baseline = player.baseBudget ?? player.budget;
    const signals = signalsByOrigin.get(player.futurePickOriginHandle);

    if (!signals || signals.playerCount < MIN_BIDS || signals.spend <= 0) {
      return withDynamicValue(player, baseline, baseline);
    }

    const relativeSurplusRate = signals.surplusRate - marketSurplusBaseline;
    const adjustment = clamp(
      -relativeSurplusRate * SURPLUS_ADJUSTMENT_WEIGHT -
        normalizeStrength(signals.lineupPoints, 120, 750) * LINEUP_STRENGTH_WEIGHT -
        normalizeStrength(signals.vor, 0, 180) * VOR_STRENGTH_WEIGHT +
        rebuildSignal(signals) * REBUILD_SIGNAL_WEIGHT,
      -MAX_TOTAL_ADJUSTMENT,
      MAX_TOTAL_ADJUSTMENT,
    );
    const rawAdjusted = Math.max(1, Math.round(baseline * (1 + adjustment)));
    const adjusted = applyAdjustmentCap(baseline, rawAdjusted);

    return withDynamicValue(player, baseline, adjusted);
  });
}

function computeOriginSignals(
  players: Player[],
  bids: BidInput[],
  startingLineup: StartingSlot[],
): Map<string, OriginSignals> {
  const playerByName = new Map(players.map((player) => [player.player, player]));
  const rosterByOrigin = new Map<string, OriginRoster>();

  for (const bid of bids) {
    const player = playerByName.get(bid.player);
    if (!player) continue;

    const roster = getOrCreateRoster(rosterByOrigin, bid.teamHandle);
    roster.spend += bid.price;

    if (isFuturePickAsset(player)) {
      roster.futureCapital += player.baseBudget ?? player.budget;
      continue;
    }

    roster.playerRoster.push(player);
  }

  const signalsByOrigin = new Map<string, OriginSignals>();

  for (const [origin, roster] of rosterByOrigin) {
    const value = roster.playerRoster.reduce((sum, player) => sum + player.budget, 0);
    const vor = roster.playerRoster.reduce((sum, player) => sum + (player.vor ?? 0), 0);
    const ages = roster.playerRoster
      .map((player) => player.age)
      .filter((age): age is number => typeof age === 'number');
    const avgAge = ages.length > 0 ? ages.reduce((sum, age) => sum + age, 0) / ages.length : null;
    const lineupPoints = optimizeProjectedLineupPoints(roster.playerRoster, startingLineup).points;
    const surplusRate = roster.spend > 0 ? (value - roster.spend) / roster.spend : 0;

    signalsByOrigin.set(origin, {
      playerCount: roster.playerRoster.length,
      spend: roster.spend,
      value,
      surplusRate,
      lineupPoints,
      vor,
      avgAge,
      futureCapital: roster.futureCapital,
    });
  }

  return signalsByOrigin;
}

function computeMarketSurplusBaseline(signalsByOrigin: Map<string, OriginSignals>): number {
  const eligibleSurplusRates = [...signalsByOrigin.values()]
    .filter((signals) => signals.playerCount >= MIN_BIDS && signals.spend > 0)
    .map((signals) => signals.surplusRate)
    .sort((a, b) => a - b);

  if (eligibleSurplusRates.length < MARKET_CENTER_MIN_ORIGINS) return 0;

  return median(eligibleSurplusRates);
}

function median(sortedValues: number[]): number {
  const midpoint = Math.floor(sortedValues.length / 2);

  if (sortedValues.length % 2 === 1) return sortedValues[midpoint] ?? 0;

  return ((sortedValues[midpoint - 1] ?? 0) + (sortedValues[midpoint] ?? 0)) / 2;
}

function getOrCreateRoster(
  rosterByOrigin: Map<string, OriginRoster>,
  origin: string,
): OriginRoster {
  const existing = rosterByOrigin.get(origin);
  if (existing) return existing;

  const roster: OriginRoster = {
    playerRoster: [],
    futureCapital: 0,
    spend: 0,
  };
  rosterByOrigin.set(origin, roster);
  return roster;
}

function withDynamicValue(player: Player, baseline: number, adjusted: number): Player {
  const adjustment = adjusted - baseline;

  return {
    ...player,
    budget: adjusted,
    ceiling: Math.round(adjusted * 1.15),
    floor: Math.max(5, Math.round(adjusted * 0.87)),
    dynamicPickValue: {
      baseline,
      adjusted,
      adjustment,
      direction: getDirection(adjustment),
    },
  };
}

function isFuturePickAsset(player: Player): boolean {
  return player.pos === 'PICK' || player.pos === 'PKG';
}

function applyAdjustmentCap(baseline: number, adjusted: number): number {
  const min = Math.ceil(baseline * (1 - MAX_TOTAL_ADJUSTMENT));
  const max = Math.floor(baseline * (1 + MAX_TOTAL_ADJUSTMENT));

  return clamp(adjusted, Math.max(1, min), Math.max(1, max));
}

function normalizeStrength(value: number, min: number, max: number): number {
  if (max <= min) return 0;
  return clamp((value - min) / (max - min), 0, 1);
}

function rebuildSignal(signals: OriginSignals): number {
  const weakLineup = 1 - normalizeStrength(signals.lineupPoints, 120, 750);
  const weakVor = 1 - normalizeStrength(signals.vor, 0, 180);
  const ageRisk = signals.avgAge === null ? 0 : normalizeStrength(signals.avgAge, 26, 31);
  const weakRoster = weakLineup * 0.45 + weakVor * 0.35 + ageRisk * 0.2;
  const futureCapitalTankSignal = normalizeStrength(signals.futureCapital, 0, 120) * weakRoster;

  return clamp(weakRoster * 0.85 + futureCapitalTankSignal * 0.15, 0, 1);
}

function getDirection(adjustment: number): 'up' | 'down' | 'flat' {
  if (adjustment > 0) return 'up';
  if (adjustment < 0) return 'down';
  return 'flat';
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
