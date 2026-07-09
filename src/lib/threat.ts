import { APPETITE_OVERPAY_MULT, APPETITE_THRIFTY_MULT } from './tendencies.constants';
import type { Appetite } from './tendencies';

export function maxBid(team: { buyingPower: number; rosterRemaining: number }): number {
  if (team.rosterRemaining <= 0) return 0;
  return Math.max(0, team.buyingPower + 1);
}

export function appetiteMultiplier(appetite: Appetite): number {
  if (appetite === 'overpays') return APPETITE_OVERPAY_MULT;
  if (appetite === 'thrifty') return APPETITE_THRIFTY_MULT;
  return 1;
}

export function threatScore(
  team: { buyingPower: number; rosterRemaining: number },
  appetite: Appetite,
): number {
  return maxBid(team) * appetiteMultiplier(appetite);
}
