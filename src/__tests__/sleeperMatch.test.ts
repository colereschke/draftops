import { matchToSleeper, type SleeperPlayerRecord } from '@/lib/sleeperMatch';

const POOL: SleeperPlayerRecord[] = [
  { id: '1', name: 'Josh Allen', normalizedName: 'josh allen', team: 'BUF', pos: 'QB' },
  { id: '2', name: 'Josh Allen', normalizedName: 'josh allen', team: 'MIN', pos: 'LB' },
  { id: '3', name: "Ja'Marr Chase", normalizedName: 'jamarr chase', team: 'CIN', pos: 'WR' },
  { id: '4', name: 'Joshua Palmer', normalizedName: 'joshua palmer', team: 'LAC', pos: 'WR' },
  { id: '5', name: 'Free Agent Guy', normalizedName: 'free agent guy', team: '', pos: 'RB' },
];

describe('matchToSleeper', () => {
  it('matches on exact normalized name + team + position', () => {
    const result = matchToSleeper({ name: 'Josh Allen', team: 'BUF', pos: 'QB' }, POOL);
    expect(result).toEqual({ status: 'matched', sleeperId: '1' });
  });

  it('falls back to name + position when team is blank', () => {
    const result = matchToSleeper({ name: 'Free Agent Guy', team: '', pos: 'RB' }, POOL);
    expect(result).toEqual({ status: 'matched', sleeperId: '5' });
  });

  it('resolves a known alias', () => {
    const result = matchToSleeper({ name: 'Josh Palmer', team: 'LAC', pos: 'WR' }, POOL);
    expect(result).toEqual({ status: 'matched', sleeperId: '4' });
  });

  it('returns unmatched when no candidate exists', () => {
    const result = matchToSleeper({ name: 'Nobody Real', team: 'BUF', pos: 'QB' }, POOL);
    expect(result).toEqual({ status: 'unmatched' });
  });

  it('returns unmatched when name+position alone is ambiguous and team does not disambiguate', () => {
    const ambiguous: SleeperPlayerRecord[] = [
      { id: '10', name: 'Sam Test', normalizedName: 'sam test', team: 'BUF', pos: 'WR' },
      { id: '11', name: 'Sam Test', normalizedName: 'sam test', team: 'MIA', pos: 'WR' },
    ];
    const result = matchToSleeper({ name: 'Sam Test', team: '', pos: 'WR' }, ambiguous);
    expect(result).toEqual({ status: 'unmatched' });
  });
});
