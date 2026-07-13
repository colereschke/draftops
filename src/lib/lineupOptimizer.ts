import type { Player, StartingSlot } from '@/types';

interface OptimizedLineup {
  points: number;
  players: Player[];
}

interface PositionCounts {
  QB: number;
  RB: number;
  WR: number;
  TE: number;
}

interface LineupCandidate {
  counts: PositionCounts;
  points: number;
}

const SLOT_ORDER: Record<StartingSlot, number> = {
  QB: 0,
  RB: 1,
  WR: 2,
  TE: 3,
  SUPER_FLEX: 4,
  FLEX: 5,
};

const LINEUP_POSITIONS = ['QB', 'RB', 'WR', 'TE'] as const;
type LineupPosition = (typeof LINEUP_POSITIONS)[number];

export function optimizeProjectedLineupPoints(
  roster: Player[],
  lineup: StartingSlot[],
): OptimizedLineup {
  const sortedSlots = [...lineup].sort((a, b) => SLOT_ORDER[a] - SLOT_ORDER[b]);
  const positionPools = getPositionPools(roster);
  const fixedCounts = getFixedCounts(sortedSlots, positionPools);
  const flexSlots = sortedSlots.filter((slot) => slot === 'FLEX').length;
  const superFlexSlots = sortedSlots.filter((slot) => slot === 'SUPER_FLEX').length;
  const bestCandidate = findBestCandidate(positionPools, fixedCounts, flexSlots, superFlexSlots);

  return buildLineup(sortedSlots, positionPools, bestCandidate.counts);
}

function getPositionPools(roster: Player[]): Record<LineupPosition, Player[]> {
  return {
    QB: getSortedPlayersForPosition(roster, 'QB'),
    RB: getSortedPlayersForPosition(roster, 'RB'),
    WR: getSortedPlayersForPosition(roster, 'WR'),
    TE: getSortedPlayersForPosition(roster, 'TE'),
  };
}

function getSortedPlayersForPosition(roster: Player[], pos: LineupPosition): Player[] {
  return roster
    .filter((player) => player.pos === pos)
    .sort((a, b) => (b.projectedPoints ?? 0) - (a.projectedPoints ?? 0));
}

function getFixedCounts(
  sortedSlots: StartingSlot[],
  positionPools: Record<LineupPosition, Player[]>,
): PositionCounts {
  const counts = createEmptyCounts();

  for (const slot of sortedSlots) {
    if (slot === 'FLEX' || slot === 'SUPER_FLEX') continue;
    counts[slot] = Math.min(counts[slot] + 1, positionPools[slot].length);
  }

  return counts;
}

function findBestCandidate(
  positionPools: Record<LineupPosition, Player[]>,
  fixedCounts: PositionCounts,
  flexSlots: number,
  superFlexSlots: number,
): LineupCandidate {
  let best: LineupCandidate = {
    counts: fixedCounts,
    points: getPointsForCounts(positionPools, fixedCounts),
  };

  for (
    let qb = 0;
    qb <= Math.min(superFlexSlots, remainingCount(positionPools, fixedCounts, 'QB'));
    qb++
  ) {
    for (let rb = 0; rb <= remainingCount(positionPools, fixedCounts, 'RB'); rb++) {
      for (let wr = 0; wr <= remainingCount(positionPools, fixedCounts, 'WR'); wr++) {
        for (let te = 0; te <= remainingCount(positionPools, fixedCounts, 'TE'); te++) {
          const nonQbExtras = rb + wr + te;

          if (qb + nonQbExtras > flexSlots + superFlexSlots) continue;
          if (nonQbExtras > flexSlots + superFlexSlots - qb) continue;

          const counts = {
            QB: fixedCounts.QB + qb,
            RB: fixedCounts.RB + rb,
            WR: fixedCounts.WR + wr,
            TE: fixedCounts.TE + te,
          };
          const points = getPointsForCounts(positionPools, counts);

          if (points > best.points) {
            best = { counts, points };
          }
        }
      }
    }
  }

  return best;
}

function buildLineup(
  sortedSlots: StartingSlot[],
  positionPools: Record<LineupPosition, Player[]>,
  counts: PositionCounts,
): OptimizedLineup {
  const selectedPools = {
    QB: positionPools.QB.slice(0, counts.QB),
    RB: positionPools.RB.slice(0, counts.RB),
    WR: positionPools.WR.slice(0, counts.WR),
    TE: positionPools.TE.slice(0, counts.TE),
  };
  const players: Player[] = [];

  for (const slot of sortedSlots) {
    const player = takePlayerForSlot(selectedPools, slot);

    if (player) players.push(player);
  }

  return {
    points: players.reduce((sum, player) => sum + (player.projectedPoints ?? 0), 0),
    players,
  };
}

function takePlayerForSlot(
  selectedPools: Record<LineupPosition, Player[]>,
  slot: StartingSlot,
): Player | undefined {
  if (slot === 'SUPER_FLEX') {
    return (
      selectedPools.QB.shift() ??
      selectedPools.RB.shift() ??
      selectedPools.WR.shift() ??
      selectedPools.TE.shift()
    );
  }

  if (slot === 'FLEX') {
    return selectedPools.RB.shift() ?? selectedPools.WR.shift() ?? selectedPools.TE.shift();
  }

  return selectedPools[slot].shift();
}

function remainingCount(
  positionPools: Record<LineupPosition, Player[]>,
  fixedCounts: PositionCounts,
  pos: LineupPosition,
): number {
  return positionPools[pos].length - fixedCounts[pos];
}

function getPointsForCounts(
  positionPools: Record<LineupPosition, Player[]>,
  counts: PositionCounts,
): number {
  return LINEUP_POSITIONS.reduce(
    (sum, pos) =>
      sum +
      positionPools[pos]
        .slice(0, counts[pos])
        .reduce((positionSum, player) => positionSum + (player.projectedPoints ?? 0), 0),
    0,
  );
}

function createEmptyCounts(): PositionCounts {
  return {
    QB: 0,
    RB: 0,
    WR: 0,
    TE: 0,
  };
}
