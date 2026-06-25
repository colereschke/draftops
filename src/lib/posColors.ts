import type { Position } from '@/types';

export const POS_COLORS: Record<
  Position,
  { bg: string; accent: string; badge: string; badgeText: string }
> = {
  QB: { bg: '#1a2744', accent: '#4f83e8', badge: '#e8f0fe', badgeText: '#1a2744' },
  RB: { bg: '#1a2e1a', accent: '#4caf6e', badge: '#e6f4ea', badgeText: '#1a3a22' },
  WR: { bg: '#2a1f0e', accent: '#e8a030', badge: '#fef3e2', badgeText: '#3a2008' },
  TE: { bg: '#2a1a2a', accent: '#c060d0', badge: '#f5e6f8', badgeText: '#3a0a3a' },
  PICK: { bg: '#1a2a2a', accent: '#40b0b0', badge: '#e0f5f5', badgeText: '#0a3030' },
  PKG: { bg: '#2a2010', accent: '#f0c040', badge: '#fdf5d0', badgeText: '#3a2a00' },
};
