import type { Player } from '@/types';
import {
  APPETITE_POSITIONS,
  MIN_BUYS_FOR_READ,
  OVERPAY_PCT,
  THRIFTY_PCT,
  LEAN_SHARE_THRESHOLD,
  MIN_SPEND_FOR_LEAN,
  AGG_PCT,
  MIN_BUYS_FOR_AGGRESSION,
  type AppetitePos,
} from './tendencies.constants';

export type Appetite = 'overpays' | 'neutral' | 'thrifty' | 'no-read';

// Re-export so consumers can pull the position type from one module (@/lib/tendencies)
// alongside the tendency types, rather than reaching into the constants file.
export type { AppetitePos } from './tendencies.constants';

export interface PositionTendency {
  position: AppetitePos;
  buys: number;
  spend: number;
  valueSum: number;
  deltaSum: number;
  avgDelta: number | null;
  overPct: number | null;
  spendShare: number;
  appetite: Appetite;
}

export interface ManagerTendency {
  teamId: number;
  handle: string;
  displayName: string | null;
  buys: number;
  totalSpend: number;
  totalValue: number;
  overallOverPct: number | null;
  topBuy: number;
  lean: AppetitePos | 'balanced';
  aggression: 'aggressive' | 'neutral' | 'disciplined';
  positions: Record<AppetitePos, PositionTendency>;
}

export interface TendencyTeamInput {
  id: number;
  handle: string;
  displayName: string | null;
  results: { player: string; position: string; price: number }[];
}

function isAppetitePos(pos: string): pos is AppetitePos {
  return (APPETITE_POSITIONS as readonly string[]).includes(pos);
}

function classifyAppetite(buys: number, overPct: number | null): Appetite {
  if (buys < MIN_BUYS_FOR_READ) return 'no-read';
  if (overPct === null) return 'neutral';
  if (overPct > OVERPAY_PCT) return 'overpays';
  if (overPct < THRIFTY_PCT) return 'thrifty';
  return 'neutral';
}

export function computeTendencies(
  teams: TendencyTeamInput[],
  players: Pick<Player, 'player' | 'budget'>[],
): ManagerTendency[] {
  const valueByName = new Map(players.map((p) => [p.player, p.budget]));

  return teams.map((team) => {
    const acc: Record<
      AppetitePos,
      { buys: number; spend: number; valueSum: number; deltaSum: number; matchedBuys: number }
    > = {
      QB: { buys: 0, spend: 0, valueSum: 0, deltaSum: 0, matchedBuys: 0 },
      RB: { buys: 0, spend: 0, valueSum: 0, deltaSum: 0, matchedBuys: 0 },
      WR: { buys: 0, spend: 0, valueSum: 0, deltaSum: 0, matchedBuys: 0 },
      TE: { buys: 0, spend: 0, valueSum: 0, deltaSum: 0, matchedBuys: 0 },
    };

    let totalSpend = 0;
    let totalValue = 0;
    let totalDelta = 0;
    let totalBuys = 0;
    let topBuy = 0;

    for (const r of team.results) {
      totalSpend += r.price;
      totalBuys += 1;
      if (r.price > topBuy) topBuy = r.price;
      if (!isAppetitePos(r.position)) continue;
      const a = acc[r.position];
      a.buys += 1;
      a.spend += r.price;
      const val = valueByName.get(r.player);
      if (val != null) {
        a.matchedBuys += 1;
        a.valueSum += val;
        a.deltaSum += r.price - val;
        totalValue += val;
        totalDelta += r.price - val;
      }
    }

    const positions = {} as Record<AppetitePos, PositionTendency>;
    for (const pos of APPETITE_POSITIONS) {
      const a = acc[pos];
      const overPct = a.valueSum > 0 ? a.deltaSum / a.valueSum : null;
      positions[pos] = {
        position: pos,
        buys: a.buys,
        spend: a.spend,
        valueSum: a.valueSum,
        deltaSum: a.deltaSum,
        avgDelta: a.matchedBuys > 0 ? a.deltaSum / a.matchedBuys : null,
        overPct,
        spendShare: totalSpend > 0 ? a.spend / totalSpend : 0,
        appetite: classifyAppetite(a.buys, overPct),
      };
    }

    const overallOverPct = totalValue > 0 ? totalDelta / totalValue : null;

    let lean: AppetitePos | 'balanced' = 'balanced';
    if (totalSpend >= MIN_SPEND_FOR_LEAN) {
      let best: AppetitePos | null = null;
      let bestShare = 0;
      for (const pos of APPETITE_POSITIONS) {
        if (positions[pos].spendShare > bestShare) {
          bestShare = positions[pos].spendShare;
          best = pos;
        }
      }
      if (best && bestShare > LEAN_SHARE_THRESHOLD) lean = best;
    }

    let aggression: ManagerTendency['aggression'] = 'neutral';
    if (totalBuys >= MIN_BUYS_FOR_AGGRESSION && overallOverPct !== null) {
      if (overallOverPct > AGG_PCT) aggression = 'aggressive';
      else if (overallOverPct < -AGG_PCT) aggression = 'disciplined';
    }

    return {
      teamId: team.id,
      handle: team.handle,
      displayName: team.displayName,
      buys: totalBuys,
      totalSpend,
      totalValue,
      overallOverPct,
      topBuy,
      lean,
      aggression,
      positions,
    };
  });
}
