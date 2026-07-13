import { players } from '@/data/players';

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

  it('does not include generated future pick assets in the static base list', () => {
    expect(players.some((p) => p.pos === 'PICK' || p.pos === 'PKG')).toBe(false);
    expect(players.some((p) => p.player === 'Matt Gay')).toBe(false);
    expect(players.some((p) => p.player === '2027 1st Round Pick')).toBe(false);
  });
});
