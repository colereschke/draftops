import { resolveLiveNomination } from '@/lib/liveNomination';

// Rows must be most-recent-first, matching the page's `orderBy: { createdAt: 'desc' }`.
const posByName = new Map<string, string>([
  ['Puka Nacua', 'WR'],
  ['Ja’Marr Chase', 'WR'],
  ['Josh Allen', 'QB'],
  ['Bijan Robinson', 'RB'],
  ['Matt Gay', 'PKG'],
]);

const nom = (playerName: string) => ({ playerName });

describe('resolveLiveNomination', () => {
  it('returns null when nothing is nominated', () => {
    expect(resolveLiveNomination([], posByName)).toBeNull();
  });

  it('picks the sole nominated appetite position', () => {
    expect(resolveLiveNomination([nom('Josh Allen')], posByName)).toEqual({
      position: 'QB',
      name: 'Josh Allen',
    });
  });

  it('ignores non-appetite (PKG) and unknown players', () => {
    expect(resolveLiveNomination([nom('Matt Gay'), nom('Ghost')], posByName)).toBeNull();
  });

  it('favors the most heavily nominated position over a more recent single nomination', () => {
    // Most-recent-first: QB just nominated, but two WRs are live → WR wins on count.
    const live = resolveLiveNomination(
      [nom('Josh Allen'), nom('Puka Nacua'), nom('Ja’Marr Chase')],
      posByName,
    );
    expect(live?.position).toBe('WR');
    // Winning position reports its most recent nominee (first WR in desc order).
    expect(live?.name).toBe('Puka Nacua');
  });

  it('breaks a count tie toward the most recently nominated position', () => {
    // One WR and one QB live (tie at 1). QB is most recent (first in desc order).
    const live = resolveLiveNomination([nom('Josh Allen'), nom('Puka Nacua')], posByName);
    expect(live).toEqual({ position: 'QB', name: 'Josh Allen' });
  });
});
