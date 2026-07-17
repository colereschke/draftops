import { countsTowardRoster } from '@/lib/rosterPolicy';

describe('countsTowardRoster', () => {
  it.each(['QB', 'RB', 'WR', 'TE'])('counts %s', (position) => {
    expect(countsTowardRoster(position)).toBe(true);
  });

  it.each(['PICK', 'PKG', 'K', ''])('does not count %s', (position) => {
    expect(countsTowardRoster(position)).toBe(false);
  });
});
