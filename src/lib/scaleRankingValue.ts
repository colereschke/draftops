import type { Position } from '@/types';

export interface ScaledRankingValue {
  budget: number;
  ceiling: number;
  floor: number;
}

const SCALE = 5;
const TE_PREMIUM = 1.18;

export function scaleRankingValue(pos: Position, rawValue: number): ScaledRankingValue {
  let budget = Math.max(5, Math.round(rawValue * SCALE));
  if (pos === 'TE') budget = Math.round(budget * TE_PREMIUM);
  const ceiling = Math.round(budget * 1.15);
  const floor = Math.max(5, Math.round(budget * 0.87));
  return { budget, ceiling, floor };
}
