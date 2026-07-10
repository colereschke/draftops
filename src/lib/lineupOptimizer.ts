import type { Player, StartingSlot } from '@/types';

interface OptimizedLineup {
  points: number;
  players: Player[];
}

interface LineupAssignment {
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
  const sortedSlots = [...lineup].sort((a, b) => SLOT_ORDER[a] - SLOT_ORDER[b]);

  return assignBestLineup(roster, sortedSlots, 0, new Set(), []);
}

function assignBestLineup(
  roster: Player[],
  sortedSlots: StartingSlot[],
  slotIndex: number,
  selected: Set<string>,
  assignedPlayers: Player[],
): LineupAssignment {
  if (slotIndex >= sortedSlots.length) {
    return {
      points: assignedPlayers.reduce((sum, player) => sum + (player.projectedPoints ?? 0), 0),
      players: assignedPlayers,
    };
  }

  const slot = sortedSlots[slotIndex];
  const candidates = roster
    .filter((player) => !selected.has(player.player))
    .filter((player) => isEligibleForSlot(player.pos, slot))
    .sort((a, b) => (b.projectedPoints ?? 0) - (a.projectedPoints ?? 0));

  if (candidates.length === 0) {
    return assignBestLineup(roster, sortedSlots, slotIndex + 1, selected, assignedPlayers);
  }

  let best: LineupAssignment = { points: Number.NEGATIVE_INFINITY, players: [] };

  for (const candidate of candidates) {
    const nextSelected = new Set(selected);
    nextSelected.add(candidate.player);

    const assignment = assignBestLineup(roster, sortedSlots, slotIndex + 1, nextSelected, [
      ...assignedPlayers,
      candidate,
    ]);

    if (assignment.points > best.points) {
      best = assignment;
    }
  }

  return best;
}

function isEligibleForSlot(pos: Player['pos'], slot: StartingSlot): boolean {
  if (slot === 'FLEX') return pos === 'RB' || pos === 'WR' || pos === 'TE';
  if (slot === 'SUPER_FLEX') return pos === 'QB' || pos === 'RB' || pos === 'WR' || pos === 'TE';
  return pos === slot;
}
