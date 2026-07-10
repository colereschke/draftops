import { normalizeName, normalizeTeam, normalizePosition } from '@/lib/sleeperNormalize';

describe('normalizeName', () => {
  it('lowercases and trims', () => {
    expect(normalizeName(' Josh Allen ')).toBe('josh allen');
  });

  it('strips periods, apostrophes, hyphens, and commas', () => {
    expect(normalizeName("Ja'Marr Chase")).toBe('jamarr chase');
    expect(normalizeName('D.J. Moore')).toBe('dj moore');
    expect(normalizeName('Amon-Ra St. Brown')).toBe('amonra st brown');
  });

  it('strips generational suffixes', () => {
    expect(normalizeName('Michael Pittman Jr.')).toBe('michael pittman');
    expect(normalizeName('Kenneth Walker III')).toBe('kenneth walker');
  });

  it('strips single-letter middle initials', () => {
    expect(normalizeName('Marvin Harrison Jr.')).toBe('marvin harrison');
  });

  it('strips accents', () => {
    expect(normalizeName('José Ramírez')).toBe('jose ramirez');
  });
});

describe('normalizeTeam', () => {
  it('uppercases and maps legacy abbreviations to current ones', () => {
    expect(normalizeTeam('jax')).toBe('JAX');
    expect(normalizeTeam('WFT')).toBe('WAS');
    expect(normalizeTeam('LA')).toBe('LAR');
    expect(normalizeTeam('OAK')).toBe('LV');
  });

  it('treats free-agent markers as blank', () => {
    expect(normalizeTeam('FA')).toBe('');
    expect(normalizeTeam('—')).toBe('');
    expect(normalizeTeam(null)).toBe('');
    expect(normalizeTeam(undefined)).toBe('');
  });

  it('passes through an already-current abbreviation unchanged', () => {
    expect(normalizeTeam('BUF')).toBe('BUF');
  });
});

describe('normalizePosition', () => {
  it('accepts QB/RB/WR/TE case-insensitively', () => {
    expect(normalizePosition('qb')).toBe('QB');
    expect(normalizePosition('WR')).toBe('WR');
  });

  it('returns null for unsupported positions', () => {
    expect(normalizePosition('K')).toBeNull();
    expect(normalizePosition('Pick')).toBeNull();
    expect(normalizePosition(null)).toBeNull();
  });
});
