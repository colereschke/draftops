import type { Position } from '@/types';

// Three ascending boundaries per position: [youngMax, primeMax, agingMax].
// old = agingMax + 1 and up. TUNABLE (backend-only).
export const AGE_BANDS: Partial<Record<Position, readonly [number, number, number]>> = {
  QB: [25, 29, 32],
  RB: [23, 25, 27],
  WR: [24, 27, 29],
  TE: [24, 27, 29],
};

// Fallback when no position is supplied (e.g. a roster's average age).
// Matches the historical global bands: young ≤24 / prime 25-27 / aging 28-30 / old 31+.
export const GLOBAL_AGE_BANDS: readonly [number, number, number] = [24, 27, 30];
