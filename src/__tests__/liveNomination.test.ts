import { resolveLiveNomination } from '@/lib/liveNomination';

// Rows must be most-recent-first, matching the page's `orderBy: { createdAt: 'desc' }`.
const posByPlayerId = new Map<number, string>([
  [1, 'WR'],
  [2, 'WR'],
  [3, 'QB'],
  [4, 'RB'],
  [5, 'PKG'],
]);

const nom = (playerId: number, playerName: string) => ({ playerId, playerName });

describe('resolveLiveNomination', () => {
  it('resolves a nomination through its stable player ID', () => {
    expect(
      resolveLiveNomination([{ playerId: 3, playerName: 'Josh Allen' }], posByPlayerId),
    ).toEqual({
      position: 'QB',
      name: 'Josh Allen',
    });
  });

  it('returns null when nothing is nominated', () => {
    expect(resolveLiveNomination([], posByPlayerId)).toBeNull();
  });

  it('picks the sole nominated appetite position', () => {
    expect(resolveLiveNomination([nom(3, 'Josh Allen')], posByPlayerId)).toEqual({
      position: 'QB',
      name: 'Josh Allen',
    });
  });

  it('ignores non-appetite (PKG) and unknown players', () => {
    expect(
      resolveLiveNomination([nom(5, 'Matt Gay'), nom(999, 'Josh Allen')], posByPlayerId),
    ).toBeNull();
  });

  it('favors the most heavily nominated position over a more recent single nomination', () => {
    // Most-recent-first: QB just nominated, but two WRs are live → WR wins on count.
    const live = resolveLiveNomination(
      [nom(3, 'Josh Allen'), nom(1, 'Puka Nacua'), nom(2, 'Ja’Marr Chase')],
      posByPlayerId,
    );
    expect(live?.position).toBe('WR');
    // Winning position reports its most recent nominee (first WR in desc order).
    expect(live?.name).toBe('Puka Nacua');
  });

  it('breaks a count tie toward the most recently nominated position', () => {
    // One WR and one QB live (tie at 1). QB is most recent (first in desc order).
    const live = resolveLiveNomination([nom(3, 'Josh Allen'), nom(1, 'Puka Nacua')], posByPlayerId);
    expect(live).toEqual({ position: 'QB', name: 'Josh Allen' });
  });
});
