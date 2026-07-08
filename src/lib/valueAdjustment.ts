import type { Player, Position, ScoringSettings, StartingSlot } from '@/types';
import { DEFAULT_SCORING_SETTINGS, DEFAULT_STARTING_LINEUP } from '@/types';
import {
  SCORING_COEF,
  SCORING_BAND,
  PASS_YDS_COEF,
  POSITION_STARTABILITY,
  POSITION_ELASTICITY,
  SCARCITY_BAND,
  BASELINE_STARTERS,
  CONCENTRATION_C,
  CONCENTRATION_BAND,
} from '@/lib/valueAdjustment.constants';

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

const FLEX_ELIGIBLE: readonly AdjPos[] = ['RB', 'WR', 'TE'];
const SF_ELIGIBLE: readonly AdjPos[] = ['QB', 'RB', 'WR', 'TE'];

function allocate(
  demand: Record<AdjPos, number>,
  eligible: readonly AdjPos[],
  scoringMults: Record<Position, number>,
): void {
  const weights = eligible.map((p) => POSITION_STARTABILITY[p] * scoringMults[p]);
  const total = weights.reduce((a, b) => a + b, 0);
  eligible.forEach((p, i) => {
    demand[p] += weights[i] / total;
  });
}

function computeDemand(
  lineup: StartingSlot[],
  scoringMults: Record<Position, number>,
): Record<AdjPos, number> {
  const demand: Record<AdjPos, number> = { QB: 0, RB: 0, WR: 0, TE: 0 };
  for (const slot of lineup) {
    if (slot === 'FLEX') allocate(demand, FLEX_ELIGIBLE, scoringMults);
    else if (slot === 'SUPER_FLEX') allocate(demand, SF_ELIGIBLE, scoringMults);
    else demand[slot] += 1; // dedicated QB/RB/WR/TE
  }
  return demand;
}

export function computeScarcityMultipliers(
  lineup: StartingSlot[],
  scoringMults: Record<Position, number>,
): Record<Position, number> {
  const demand = computeDemand(lineup, scoringMults);
  const baselineDemand = computeDemand([...DEFAULT_STARTING_LINEUP], allOnes());
  const result = allOnes();

  const [lo, hi] = SCARCITY_BAND;
  for (const pos of ADJ_POSITIONS) {
    const ratio = demand[pos] / baselineDemand[pos];
    const raised = Math.pow(ratio, POSITION_ELASTICITY[pos]);
    result[pos] = clamp(raised, lo, hi);
  }

  return result;
}

export function computeConcentrationFactor(rankPercentile: number, totalStarters: number): number {
  const k = (BASELINE_STARTERS - totalStarters) / BASELINE_STARTERS;
  const factor = 1 + k * CONCENTRATION_C * (0.5 - rankPercentile);
  const [lo, hi] = CONCENTRATION_BAND;
  return clamp(factor, lo, hi);
}

export interface DraftValueSettings {
  startingLineup: StartingSlot[];
  scoringSettings: ScoringSettings;
  teamCount: number;
}

export interface ValuedPlayer extends Player {
  baseBudget: number;
  baseCeiling: number;
  baseFloor: number;
}

function isAdjustable(pos: Position): pos is AdjPos {
  return pos === 'QB' || pos === 'RB' || pos === 'WR' || pos === 'TE';
}

export function adjustPlayerValues(
  basePlayers: Player[],
  settings: DraftValueSettings,
): ValuedPlayer[] {
  const lineup = settings.startingLineup ?? [...DEFAULT_STARTING_LINEUP];
  const scoring = settings.scoringSettings ?? { ...DEFAULT_SCORING_SETTINGS };

  const scoringMults = computeScoringMultipliers(scoring);
  const scarcityMults = computeScarcityMultipliers(lineup, scoringMults);
  const totalStarters = settings.teamCount * lineup.length;

  // Rank percentile is computed over adjustable players only, ordered by sfRank.
  const adjustable = basePlayers
    .filter((p) => isAdjustable(p.pos))
    .slice()
    .sort((a, b) => a.sfRank - b.sfRank);
  const rankIndex = new Map<string, number>();
  adjustable.forEach((p, i) => rankIndex.set(p.player, i));
  const n = adjustable.length;

  return basePlayers.map((p) => {
    if (!isAdjustable(p.pos)) {
      // PICK/PKG pass through verbatim — no re-derivation.
      return { ...p, baseBudget: p.budget, baseCeiling: p.ceiling, baseFloor: p.floor };
    }
    const idx = rankIndex.get(p.player) ?? 0;
    const percentile = n > 1 ? idx / (n - 1) : 0;
    const conc = computeConcentrationFactor(percentile, totalStarters);
    const mult = scarcityMults[p.pos] * scoringMults[p.pos] * conc;

    const budget = Math.max(1, Math.round(p.budget * mult));
    const ceiling = Math.round(budget * 1.15);
    const floor = Math.max(5, Math.round(budget * 0.87));

    return {
      ...p,
      budget,
      ceiling,
      floor,
      baseBudget: p.budget,
      baseCeiling: p.ceiling,
      baseFloor: p.floor,
    };
  });
}
