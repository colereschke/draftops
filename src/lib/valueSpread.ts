import type { Player, Position, StrategyTag } from '@/types';
import { ageBand, type AgeBand } from './ageBands';
import { SPREAD_GATE, SPREAD_GATE_OLD } from './valueSpread.constants';

const SPREAD_POSITIONS: Position[] = ['QB', 'RB', 'WR', 'TE'];

interface SpreadAnnotation {
  spread: number;
  strategyTag: StrategyTag | null;
  dynRank: number;
  projRank: number;
  dynPct: number;
  projPct: number;
}

function dynastyValue(p: Player): number {
  return p.baseBudget ?? p.budget;
}

function projectionValue(p: Player): number {
  return p.projectionAuctionValue ?? 0;
}

// Percentile within the common set: best rank (1) → 100, worst rank (n) → 0.
function percentile(rank: number, n: number): number {
  return n > 1 ? Math.round(((n - rank) / (n - 1)) * 100) : 0;
}

// Invariant: any player admitted to the common set (vor > 0) has already been
// joined against the projection pipeline output, so `projectionAuctionValue` is
// guaranteed non-null for that player. Downstream consumers (e.g. the bid modal
// nesting the spread display inside its projection-context panel) rely on this —
// wherever `spread != null`, `projectionAuctionValue` is safe to assume non-null too.
function isInCommonSet(p: Player, pos: Position): boolean {
  return p.pos === pos && p.vor != null && p.vor > 0;
}

// The |spread| a player must clear to earn a tag, by age band. Prime (and unknown
// age) never tag. Older players get a lower gate: the dynasty market already
// discounts age, so a smaller residual edge is a stronger win-now signal.
function gateForBand(band: AgeBand | null): number | null {
  switch (band) {
    case 'young':
    case 'aging':
      return SPREAD_GATE;
    case 'old':
      return SPREAD_GATE_OLD;
    default:
      return null; // prime or unknown age → never tags
  }
}

function tagFor(spread: number, p: Player): StrategyTag | null {
  const band = ageBand(p.age, p.pos);
  const gate = gateForBand(band);
  if (gate === null || Math.abs(spread) < gate) return null;
  // band is guaranteed young/aging/old here (prime/unknown returned a null gate).
  if (band === 'young') return spread > 0 ? 'BARGAIN' : 'FUTURE';
  // aging + old both count as OLDER — the dynasty market discounts age from the
  // aging years on, so that whole range carries the win-now / fade signal.
  return spread > 0 ? 'WIN-NOW' : 'FADE';
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
      const dynPct = percentile(dynRank, n);
      const projPct = percentile(projRank, n);
      // Spread is the difference of the displayed percentiles, so the bid modal's
      // "Dyn {dynPct} · Proj {projPct} · Spread {spread}" always reconciles exactly.
      const spread = projPct - dynPct;
      annotations.set(p, {
        spread,
        strategyTag: tagFor(spread, p),
        dynRank,
        projRank,
        dynPct,
        projPct,
      });
    }
  }

  return players.map((p) => {
    const a = annotations.get(p);
    if (!a) {
      return {
        ...p,
        spread: null,
        strategyTag: null,
        spreadDynRank: null,
        spreadProjRank: null,
        spreadDynPct: null,
        spreadProjPct: null,
      };
    }
    return {
      ...p,
      spread: a.spread,
      strategyTag: a.strategyTag,
      spreadDynRank: a.dynRank,
      spreadProjRank: a.projRank,
      spreadDynPct: a.dynPct,
      spreadProjPct: a.projPct,
    };
  });
}

export function formatSpread(spread: number): string {
  return spread > 0 ? `+${spread}` : String(spread);
}

export function spreadColor(spread: number | null | undefined): string {
  if (spread == null || spread === 0) return 'var(--text-muted)';
  return spread > 0 ? 'var(--age-young)' : 'var(--age-old)';
}

// 1 → "1st", 12 → "12th", 91 → "91st". Used to render percentiles in the bid modal.
export function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

export function strategyTagReason(tag: StrategyTag): string {
  switch (tag) {
    case 'WIN-NOW':
      return 'Projection ranks him above the market; past his prime — a win-now buy the market discounts for age.';
    case 'BARGAIN':
      return 'Projection ranks him above the market; young and cheap — the market hasn’t caught up.';
    case 'FUTURE':
      return 'Market ranks him above his production; a young upside premium — a rebuild asset.';
    case 'FADE':
      return 'Market ranks him above his production; past his prime and overpriced — fade.';
  }
}
