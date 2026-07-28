import {
  parseRosterTrackerSearchParams,
  buildRosterTrackerQueryString,
} from '@/components/RosterTracker/urlState';

describe('parseRosterTrackerSearchParams', () => {
  it('returns defaults for an empty query string', () => {
    expect(parseRosterTrackerSearchParams(new URLSearchParams())).toEqual({
      sortBy: 'spend',
      sortDir: 'desc',
      selectedTeamId: null,
    });
  });

  it('reads a valid position sort key, direction, and team id', () => {
    const params = new URLSearchParams('sort=WR&dir=asc&team=7');
    expect(parseRosterTrackerSearchParams(params)).toEqual({
      sortBy: 'WR',
      sortDir: 'asc',
      selectedTeamId: 7,
    });
  });

  it('falls back to defaults for unrecognized sort keys and non-integer team ids', () => {
    const params = new URLSearchParams('sort=nope&dir=sideways&team=abc');
    expect(parseRosterTrackerSearchParams(params)).toEqual({
      sortBy: 'spend',
      sortDir: 'desc',
      selectedTeamId: null,
    });
  });
});

describe('buildRosterTrackerQueryString', () => {
  it('omits fields at their default value', () => {
    expect(
      buildRosterTrackerQueryString({ sortBy: 'spend', sortDir: 'desc', selectedTeamId: null }),
    ).toBe('');
  });

  it('round-trips through parseRosterTrackerSearchParams', () => {
    const state = { sortBy: 'age' as const, sortDir: 'asc' as const, selectedTeamId: 3 };
    const query = buildRosterTrackerQueryString(state);
    expect(parseRosterTrackerSearchParams(new URLSearchParams(query))).toEqual(state);
  });
});
