import type { Player, Position, StrategyTag } from '@/types';
import { ageBand } from './ageBands';
import { SPREAD_GATE } from './valueSpread.constants';

const SPREAD_POSITIONS: Position[] = ['QB', 'RB', 'WR', 'TE'];

interface SpreadAnnotation {
  spread: number;
  strategyTag: StrategyTag | null;
  dynRank: number;
  projRank: number;
}

function dynastyValue(p: Player): number {
  return p.baseBudget ?? p.budget;
}

function projectionValue(p: Player): number {
  return p.projectionAuctionValue ?? 0;
}

function isInCommonSet(p: Player, pos: Position): boolean {
  return p.pos === pos && p.vor != null && p.vor > 0;
}

function tagFor(spread: number, p: Player): StrategyTag | null {
  if (Math.abs(spread) < SPREAD_GATE) return null;
  const band = ageBand(p.age, p.pos);
  if (band === 'young') return spread > 0 ? 'BARGAIN' : 'FUTURE';
  if (band === 'old') return spread > 0 ? 'WIN-NOW' : 'FADE';
  return null;
}

export function computeSpreads(players: Player[]): Player[] {
  const annotations = new Map<Player, SpreadAnnotation>();

  for (const pos of SPREAD_POSITIONS) {
    const common = players.filter((p) => isInCommonSet(p, pos));
    const n = common.length;

    const dynRankOf = new Map<Player, number>();
    [...common]
      .sort((a, b) => dynastyValue(b) - dynastyValue(a))
      .forEach((p, i) => dynRankOf.set(p, i + 1));

    const projRankOf = new Map<Player, number>();
    [...common]
      .sort((a, b) => projectionValue(b) - projectionValue(a))
      .forEach((p, i) => projRankOf.set(p, i + 1));

    for (const p of common) {
      const dynRank = dynRankOf.get(p)!;
      const projRank = projRankOf.get(p)!;
      const spread = n > 1 ? Math.round(((dynRank - projRank) / (n - 1)) * 100) : 0;
      annotations.set(p, { spread, strategyTag: tagFor(spread, p), dynRank, projRank });
    }
  }

  return players.map((p) => {
    const a = annotations.get(p);
    if (!a) {
      return { ...p, spread: null, strategyTag: null, spreadDynRank: null, spreadProjRank: null };
    }
    return {
      ...p,
      spread: a.spread,
      strategyTag: a.strategyTag,
      spreadDynRank: a.dynRank,
      spreadProjRank: a.projRank,
    };
  });
}

export function strategyTagReason(tag: StrategyTag): string {
  switch (tag) {
    case 'WIN-NOW':
      return 'Projection ranks him well above the market; older — a win-now buy the market discounts.';
    case 'BARGAIN':
      return 'Projection ranks him above the market; young and cheap — the market hasn’t caught up.';
    case 'FUTURE':
      return 'Market ranks him above his production; a young upside premium — a rebuild asset.';
    case 'FADE':
      return 'Market ranks him above his production; older and overpriced — fade.';
  }
}
