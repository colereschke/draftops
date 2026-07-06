import type { Position, ScoringSettings } from '@/types';
import { DEFAULT_SCORING_SETTINGS } from '@/types';
import { SCORING_COEF, SCORING_BAND, PASS_YDS_COEF } from '@/lib/valueAdjustment.constants';

type AdjPos = 'QB' | 'RB' | 'WR' | 'TE';
const ADJ_POSITIONS: readonly AdjPos[] = ['QB', 'RB', 'WR', 'TE'];

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function allOnes(): Record<Position, number> {
  return { QB: 1, RB: 1, WR: 1, TE: 1, PICK: 1, PKG: 1 };
}

export function computeScoringMultipliers(scoring: ScoringSettings): Record<Position, number> {
  const base = DEFAULT_SCORING_SETTINGS;
  const result = allOnes();

  for (const pos of ADJ_POSITIONS) {
    let mult = 1;
    const coefs = SCORING_COEF[pos];
    for (const field of Object.keys(coefs) as (keyof ScoringSettings)[]) {
      mult += (coefs[field] as number) * (scoring[field] - base[field]);
    }
    if (pos === 'QB') {
      mult += PASS_YDS_COEF * (1 / scoring.passYdsPerPoint - 1 / base.passYdsPerPoint);
    }
    const [lo, hi] = SCORING_BAND[pos];
    result[pos] = clamp(mult, lo, hi);
  }

  return result;
}
