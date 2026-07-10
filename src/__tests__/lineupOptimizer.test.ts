import { optimizeProjectedLineupPoints } from '@/lib/lineupOptimizer';
import { DEFAULT_STARTING_LINEUP, type Player, type StartingSlot } from '@/types';

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

  it('optimizes across FLEX and SUPER_FLEX instead of greedily filling SUPER_FLEX first', () => {
    const lineup: StartingSlot[] = ['QB', 'SUPER_FLEX', 'FLEX'];
    const roster = [player('QB1', 'QB', 20), player('QB2', 'QB', 18), player('RB1', 'RB', 19)];

    expect(optimizeProjectedLineupPoints(roster, lineup).points).toBe(57);
    expect(optimizeProjectedLineupPoints(roster, lineup).players.map((p) => p.player)).toEqual([
      'QB1',
      'QB2',
      'RB1',
    ]);
  });

  it('optimizes a realistic roster with the default lineup promptly', () => {
    const roster = [
      player('QB1', 'QB', 25),
      player('QB2', 'QB', 21),
      player('QB3', 'QB', 16),
      player('QB4', 'QB', 10),
      player('RB1', 'RB', 20),
      player('RB2', 'RB', 19),
      player('RB3', 'RB', 18),
      player('RB4', 'RB', 15),
      player('RB5', 'RB', 12),
      player('RB6', 'RB', 9),
      player('RB7', 'RB', 7),
      player('RB8', 'RB', 5),
      player('WR1', 'WR', 22),
      player('WR2', 'WR', 18),
      player('WR3', 'WR', 17),
      player('WR4', 'WR', 16),
      player('WR5', 'WR', 13),
      player('WR6', 'WR', 11),
      player('WR7', 'WR', 8),
      player('WR8', 'WR', 6),
      player('WR9', 'WR', 4),
      player('WR10', 'WR', 3),
      player('TE1', 'TE', 14),
      player('TE2', 'TE', 12),
      player('TE3', 'TE', 9),
      player('TE4', 'TE', 7),
      player('TE5', 'TE', 5),
      player('TE6', 'TE', 3),
      player('PKG1', 'PKG', 100),
      player('PICK1', 'PICK', 90),
    ];

    const start = performance.now();
    const result = optimizeProjectedLineupPoints(roster, DEFAULT_STARTING_LINEUP);
    const durationMs = performance.now() - start;

    expect(result.players).toHaveLength(DEFAULT_STARTING_LINEUP.length);
    expect(result.points).toBeGreaterThan(0);
    expect(durationMs).toBeLessThan(100);
  });
});
