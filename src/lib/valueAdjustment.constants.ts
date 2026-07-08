import type { ScoringSettings } from '@/types';

// Every value here is TUNABLE — calibrate after the first real draft.
// This is the only place calibration lives. Never user-facing.

type AdjPos = 'QB' | 'RB' | 'WR' | 'TE';

// 12 teams × 10 starters — the reference for the concentration tilt.
export const BASELINE_STARTERS = 120;

// Baseline flex "startability" per position — how deep the flex-worthy pool is.
// Skews FLEX toward RB/WR (TE thin); QB high so SUPER_FLEX lands on a QB.
export const POSITION_STARTABILITY: Record<AdjPos, number> = {
  QB: 8.0,
  RB: 1.0,
  WR: 1.0,
  TE: 0.35,
};

// Scarcity exponent — TE > 1 amplifies for its thin real-world supply.
export const POSITION_ELASTICITY: Record<AdjPos, number> = {
  QB: 1.0,
  RB: 1.0,
  WR: 1.0,
  TE: 1.3,
};

// Concentration sensitivity: a 10-team start-9 league (k = 0.25) lifts the top
// player by ~0.25 × C × 0.5 = 15%.
export const CONCENTRATION_C = 1.2;

export const SCARCITY_BAND: readonly [number, number] = [0.7, 1.6];
export const CONCENTRATION_BAND: readonly [number, number] = [0.8, 1.25];

// TE band is deliberately wider — 1.75×–2× TE premiums are common.
export const SCORING_BAND: Record<AdjPos, readonly [number, number]> = {
  QB: [0.7, 1.5],
  RB: [0.7, 1.5],
  WR: [0.7, 1.5],
  TE: [0.7, 1.9],
};

// Per-position scoring sensitivity. scoringMult = 1 + Σ coef × (setting − baseline).
// pprTE is the single highest-stakes coefficient.
export const SCORING_COEF: Record<AdjPos, Partial<Record<keyof ScoringSettings, number>>> = {
  QB: { passTD: 0.06, passInt: 0.03, rushAtt: 0.3, rushFD: 0.2 },
  RB: { pprRB: 0.3, rushAtt: 1.0, rushFD: 0.5, recFD: 0.2, rbFDBonus: 0.2 },
  WR: { pprWR: 0.3, recFD: 0.2, wrFDBonus: 0.2 },
  TE: { pprTE: 0.8, recFD: 0.2, teFDBonus: 0.3 },
};

// passYdsPerPoint is inverse (fewer yds/pt ⇒ more QB points), handled separately:
// contribution = PASS_YDS_COEF × ((1/setting) − (1/baseline)).
export const PASS_YDS_COEF = 4.0;
