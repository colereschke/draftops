import type { Position } from '@/types';

export const LEAGUE_TEAMS = [
  { handle: 'coreschke', displayName: 'Cole' },
  { handle: 'chappy72', displayName: null },
  { handle: 'DrFunk', displayName: null },
  { handle: 'Henrizzler87', displayName: null },
  { handle: 'CharlesChillFFB', displayName: null },
  { handle: 'moneymarkel2626', displayName: null },
  { handle: 'sam4bama', displayName: null },
  { handle: 'mattveksler', displayName: null },
  { handle: 'gaf2323', displayName: null },
  { handle: 'dark44', displayName: null },
  { handle: 'SlamminSam58', displayName: null },
  { handle: 'JHenny74', displayName: null },
] as const;

export const ROSTER_SIZE = 30;

// Per-position roster targets for a 30-man Superflex startup.
// PICK and PKG are intentionally absent — they don't have a positional need ratio.
// Tune these values without touching the scoring function.
export const TARGET_ROSTER: Partial<Record<Position, number>> = {
  QB: 4,
  RB: 9,
  WR: 11,
  TE: 3,
};
