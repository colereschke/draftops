import type { Player } from '@/types';

export type StrategyLens = 'rebuild' | 'balanced' | 'contend';

const STRATEGY_WEIGHTS: Record<StrategyLens, number> = {
  rebuild: 0,
  balanced: 0.25,
  contend: 0.55,
};

interface AgeSensitivity {
  negativeMultiplier: number;
  positiveMultiplier: number;
  maxNegativePct: number;
  maxPositivePct: number;
}

export function applyStrategyLens(players: Player[], strategy: StrategyLens): Player[] {
  return players.map((player) => applyStrategyToPlayer(player, strategy));
}

function applyStrategyToPlayer(player: Player, strategy: StrategyLens): Player {
  const dynastyValue = player.baseBudget ?? player.budget;
  const projectionValue = player.projectionAuctionValue;

  if (projectionValue === null || projectionValue === undefined) {
    return {
      ...player,
      strategyLens: strategy,
      strategyAdjustment: 0,
    };
  }

  const weight = STRATEGY_WEIGHTS[strategy];
  const delta = projectionValue - dynastyValue;
  const sensitivity = getAgeSensitivity(player);
  const multiplier = delta < 0 ? sensitivity.negativeMultiplier : sensitivity.positiveMultiplier;
  const rawAdjustment = delta * weight * multiplier;
  const cappedAdjustment = clampAdjustment(rawAdjustment, dynastyValue, sensitivity);
  const strategyAdjustment = Math.round(cappedAdjustment);
  const budget = Math.max(1, dynastyValue + strategyAdjustment);

  return {
    ...player,
    budget,
    floor: calculateFloor(budget),
    ceiling: calculateCeiling(budget),
    strategyLens: strategy,
    strategyAdjustment,
  };
}

function getAgeSensitivity(player: Player): AgeSensitivity {
  const isRookie = player.notes.toLowerCase().includes('rookie');
  if (isRookie || (player.age !== null && player.age <= 24)) {
    return {
      negativeMultiplier: 0.2,
      positiveMultiplier: 0.6,
      maxNegativePct: 0.15,
      maxPositivePct: 0.3,
    };
  }

  if (player.age !== null && player.age >= 29) {
    return {
      negativeMultiplier: 1.25,
      positiveMultiplier: 1.25,
      maxNegativePct: 0.3,
      maxPositivePct: 0.35,
    };
  }

  return {
    negativeMultiplier: 1,
    positiveMultiplier: 1,
    maxNegativePct: 0.25,
    maxPositivePct: 0.3,
  };
}

function clampAdjustment(
  adjustment: number,
  dynastyValue: number,
  sensitivity: AgeSensitivity,
): number {
  const minAdjustment = -dynastyValue * sensitivity.maxNegativePct;
  const maxAdjustment = dynastyValue * sensitivity.maxPositivePct;
  return Math.max(minAdjustment, Math.min(maxAdjustment, adjustment));
}

function calculateFloor(activeTarget: number): number {
  return Math.max(5, Math.round((activeTarget * 87) / 100));
}

function calculateCeiling(activeTarget: number): number {
  return Math.round((activeTarget * 115) / 100);
}
