import type { Position } from '@/types';

export const POS_COLORS: Record<
  Position,
  { bg: string; accent: string; badge: string; badgeText: string }
> = {
  QB: { bg: '#16223a', accent: '#4f83e8', badge: '#1d3154', badgeText: '#cddcff' },
  RB: { bg: '#172719', accent: '#4caf6e', badge: '#213b25', badgeText: '#d1f0d8' },
  WR: { bg: '#2b2111', accent: '#e8a030', badge: '#3e2c14', badgeText: '#f8dca9' },
  TE: { bg: '#281b2d', accent: '#b86ac8', badge: '#3c2745', badgeText: '#efd7f4' },
  PICK: { bg: '#252827', accent: '#aeb4ad', badge: '#343837', badgeText: '#e0e3df' },
  PKG: { bg: '#252827', accent: '#aeb4ad', badge: '#343837', badgeText: '#e0e3df' },
};
