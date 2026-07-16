import type { Position } from '@/types';
import { AGE_BANDS, GLOBAL_AGE_BANDS } from './ageBands.constants';

export type AgeBand = 'young' | 'prime' | 'aging' | 'old';

export function ageBand(age: number | null, pos?: Position): AgeBand | null {
  if (age === null) return null;
  const cutoffs = (pos && AGE_BANDS[pos]) || GLOBAL_AGE_BANDS;
  const [youngMax, primeMax, agingMax] = cutoffs;
  if (age <= youngMax) return 'young';
  if (age <= primeMax) return 'prime';
  if (age <= agingMax) return 'aging';
  return 'old';
}
