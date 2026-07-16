import type { Position } from '@/types';
import { ageBand, type AgeBand } from './ageBands';

const AGE_BAND_COLOR: Record<AgeBand, string> = {
  young: 'var(--age-young)',
  prime: 'var(--age-prime)',
  aging: 'var(--age-aging)',
  old: 'var(--age-old)',
};

export function ageColor(age: number | null, pos?: Position): string {
  const band = ageBand(age, pos);
  if (band === null) return 'var(--text-muted)';
  return AGE_BAND_COLOR[band];
}
