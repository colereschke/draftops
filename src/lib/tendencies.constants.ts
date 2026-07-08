// src/lib/tendencies.constants.ts
// Every value here is TUNABLE — calibrate after the first real draft.
// This is the only place tendency calibration lives. Never user-facing.

export type AppetitePos = 'QB' | 'RB' | 'WR' | 'TE';

export const APPETITE_POSITIONS: readonly AppetitePos[] = ['QB', 'RB', 'WR', 'TE'];

// Sample-size gate: below this many buys at a position, appetite is 'no-read'.
export const MIN_BUYS_FOR_READ = 2;

// Over/under value thresholds (fraction of value paid over) for per-position appetite.
export const OVERPAY_PCT = 0.08;
export const THRIFTY_PCT = -0.08;

// Lean: a position must exceed this share of total spend to be the team's lean.
export const LEAN_SHARE_THRESHOLD = 0.35;
// ...and the team must have spent at least this much, or lean is 'balanced'.
export const MIN_SPEND_FOR_LEAN = 100;

// Aggression: overall over% thresholds, gated by a minimum total buy count.
export const AGG_PCT = 0.05;
export const MIN_BUYS_FOR_AGGRESSION = 3;

// Threat multipliers applied to max-bid on the Budget Pressure board.
// neutral and no-read both map to 1.0 in appetiteMultiplier().
export const APPETITE_OVERPAY_MULT = 1.3;
export const APPETITE_THRIFTY_MULT = 0.7;
