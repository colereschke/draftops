import { optimizeProjectedLineupPoints } from '@/lib/lineupOptimizer';
import type { Player, StartingSlot } from '@/types';

const player = (name: string, pos: Player['pos'], projectedPoints: number): Player => ({
  player: name,
  team: 'NFL',
  pos,
  age: 25,
  sfRank: projectedPoints,
  budget: projectedPoints,
  ceiling: projectedPoints,
  floor: projectedPoints,
  notes: '',
  projectedPoints,
});

describe('optimizeProjectedLineupPoints', () => {
  it('uses exact 2TE lineup slots instead of a fixed default lineup', () => {
    const lineup: StartingSlot[] = ['QB', 'RB', 'WR', 'TE', 'TE', 'FLEX'];
    const roster = [
      player('QB1', 'QB', 20),
      player('RB1', 'RB', 15),
      player('WR1', 'WR', 14),
      player('TE1', 'TE', 12),
      player('TE2', 'TE', 10),
      player('WR2', 'WR', 9),
    ];

    expect(optimizeProjectedLineupPoints(roster, lineup).points).toBe(80);
    expect(optimizeProjectedLineupPoints(roster, lineup).players.map((p) => p.player)).toEqual([
      'QB1',
      'RB1',
      'WR1',
      'TE1',
      'TE2',
      'WR2',
    ]);
  });

  it('fills SUPER_FLEX with the best remaining eligible player', () => {
    const lineup: StartingSlot[] = ['QB', 'SUPER_FLEX'];
    const roster = [player('QB1', 'QB', 20), player('QB2', 'QB', 18), player('RB1', 'RB', 17)];

    expect(optimizeProjectedLineupPoints(roster, lineup).players.map((p) => p.player)).toEqual([
      'QB1',
      'QB2',
    ]);
  });
});
