import { players, PKG_PLAYERS } from '@/data/players';

describe('players data', () => {
  it('should have players', () => {
    expect(players.length).toBeGreaterThan(0);
  });

  it('should have valid budget values', () => {
    players.forEach((p) => {
      expect(p.budget).toBeGreaterThan(0);
      expect(p.ceiling).toBeGreaterThanOrEqual(p.budget);
      expect(p.floor).toBeGreaterThan(0);
      expect(p.floor).toBeLessThanOrEqual(p.budget);
    });
  });

  it('should have valid positions', () => {
    const validPositions = ['QB', 'RB', 'WR', 'TE', 'PICK', 'PKG'];
    players.forEach((p) => {
      expect(validPositions).toContain(p.pos);
    });
  });

  it('exports PKG_PLAYERS as a subset of players', () => {
    expect(PKG_PLAYERS.length).toBeGreaterThan(0);
    PKG_PLAYERS.forEach((p) => {
      expect(p.pos).toBe('PKG');
      expect(players).toContainEqual(p);
    });
  });
});
