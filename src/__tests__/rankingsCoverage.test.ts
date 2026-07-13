import { computeMissingFromEtr, ETR_SKILL_PLAYERS } from '@/lib/rankingsCoverage';

describe('ETR_SKILL_PLAYERS', () => {
  it('excludes PICK and PKG entries', () => {
    expect(ETR_SKILL_PLAYERS.every((p) => ['QB', 'RB', 'WR', 'TE'].includes(p.pos))).toBe(true);
  });
});

describe('computeMissingFromEtr', () => {
  it('returns every ETR skill player when nothing is uploaded', () => {
    const missing = computeMissingFromEtr([]);
    expect(missing.length).toBe(ETR_SKILL_PLAYERS.length);
  });

  it('excludes players present in the uploaded set', () => {
    const someName = ETR_SKILL_PLAYERS[0].player;
    const missing = computeMissingFromEtr([someName]);
    expect(missing.find((p) => p.player === someName)).toBeUndefined();
    expect(missing.length).toBe(ETR_SKILL_PLAYERS.length - 1);
  });

  it('matches names via normalizeName (case, punctuation insensitive)', () => {
    const missing = computeMissingFromEtr(['JAMARR CHASE']);
    expect(missing.find((p) => p.player === "Ja'Marr Chase")).toBeUndefined();
  });

  it('returns an empty array when every ETR skill player is uploaded', () => {
    const allNames = ETR_SKILL_PLAYERS.map((p) => p.player);
    expect(computeMissingFromEtr(allNames)).toEqual([]);
  });
});
