import { ageBand } from '@/lib/ageBands';

describe('ageBand', () => {
  it('returns null for unknown age', () => {
    expect(ageBand(null)).toBeNull();
    expect(ageBand(null, 'RB')).toBeNull();
  });

  it('uses per-position cutoffs — a 28yo RB is old, a 28yo QB is prime', () => {
    expect(ageBand(28, 'RB')).toBe('old');
    expect(ageBand(28, 'QB')).toBe('prime');
  });

  it('applies QB old threshold at 33', () => {
    expect(ageBand(32, 'QB')).toBe('aging');
    expect(ageBand(33, 'QB')).toBe('old');
  });

  it('bands WR/TE identically', () => {
    expect(ageBand(24, 'WR')).toBe('young');
    expect(ageBand(30, 'TE')).toBe('old');
  });

  it('falls back to global bands with no position', () => {
    expect(ageBand(24)).toBe('young');
    expect(ageBand(27)).toBe('prime');
    expect(ageBand(30)).toBe('aging');
    expect(ageBand(31)).toBe('old');
  });

  it('falls back to global bands for positions without cutoffs (PICK/PKG)', () => {
    expect(ageBand(30, 'PICK')).toBe('aging');
  });
});
