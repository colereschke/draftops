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

export function applyDynamicPickValues({
  players,
  bids,
  startingLineup,
}: ApplyDynamicPickValuesInput): Player[] {
  const signalsByOrigin = computeOriginSignals(players, bids, startingLineup);

  return players.map((player) => {
    if (!player.futurePickOriginHandle) return player;

    const baseline = player.baseBudget ?? player.budget;
    const signals = signalsByOrigin.get(player.futurePickOriginHandle);

    if (!signals || signals.playerCount < MIN_BIDS || signals.spend <= 0) {
      return withDynamicValue(player, baseline, baseline);
    }

    const adjustment = clamp(
      -signals.surplusRate * 0.25 -
        normalizeStrength(signals.lineupPoints, 120, 750) * 0.05 -
        normalizeStrength(signals.vor, 0, 180) * 0.05 +
        rebuildSignal(signals) * 0.08,
      -MAX_TOTAL_ADJUSTMENT,
      MAX_TOTAL_ADJUSTMENT,
    );
    const adjusted = Math.max(1, Math.round(baseline * (1 + adjustment)));

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
    const value = roster.playerRoster.reduce(
      (sum, player) => sum + (player.baseBudget ?? player.budget),
      0,
    );
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
  const adjustment = baseline > 0 ? adjusted / baseline - 1 : 0;

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

function normalizeStrength(value: number, min: number, max: number): number {
  if (max <= min) return 0;
  return clamp((value - min) / (max - min), 0, 1);
}

function rebuildSignal(signals: OriginSignals): number {
  const weakLineup = 1 - normalizeStrength(signals.lineupPoints, 120, 750);
  const weakVor = 1 - normalizeStrength(signals.vor, 0, 180);
  const ageRisk = signals.avgAge === null ? 0 : normalizeStrength(signals.avgAge, 26, 31);
  const limitedFutureCapital = 1 - normalizeStrength(signals.futureCapital, 0, 120);

  return clamp(weakLineup * 0.4 + weakVor * 0.3 + ageRisk * 0.2 + limitedFutureCapital * 0.1, 0, 1);
}

function getDirection(adjustment: number): 'up' | 'down' | 'flat' {
  if (adjustment > 0) return 'up';
  if (adjustment < 0) return 'down';
  return 'flat';
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
