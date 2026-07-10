import type { Player, StartingSlot } from '@/types';

interface OptimizedLineup {
  points: number;
  players: Player[];
}

const SLOT_ORDER: Record<StartingSlot, number> = {
  QB: 0,
  RB: 1,
  WR: 2,
  TE: 3,
  SUPER_FLEX: 4,
  FLEX: 5,
};

export function optimizeProjectedLineupPoints(
  roster: Player[],
  lineup: StartingSlot[],
): OptimizedLineup {
  const selected = new Set<string>();
  const players: Player[] = [];
  const sortedSlots = [...lineup].sort((a, b) => SLOT_ORDER[a] - SLOT_ORDER[b]);

  for (const slot of sortedSlots) {
    const candidate = roster
      .filter((player) => !selected.has(player.player))
      .filter((player) => isEligibleForSlot(player.pos, slot))
      .sort((a, b) => (b.projectedPoints ?? 0) - (a.projectedPoints ?? 0))[0];

    if (!candidate) continue;

    selected.add(candidate.player);
    players.push(candidate);
  }

  return {
    points: players.reduce((sum, player) => sum + (player.projectedPoints ?? 0), 0),
    players,
  };
}

function isEligibleForSlot(pos: Player['pos'], slot: StartingSlot): boolean {
  if (slot === 'FLEX') return pos === 'RB' || pos === 'WR' || pos === 'TE';
  if (slot === 'SUPER_FLEX') return pos === 'QB' || pos === 'RB' || pos === 'WR' || pos === 'TE';
  return pos === slot;
}
