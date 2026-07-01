import { importFromSleeper } from '@/lib/sleeper-actions';
import type { SleeperLeague, SleeperUser } from '@/lib/sleeper';

const mockFetchLeague = jest.fn();
const mockFetchUsers = jest.fn();

jest.mock('@/lib/sleeper', () => {
  const actual = jest.requireActual('@/lib/sleeper') as typeof import('@/lib/sleeper');
  return {
    ...actual,
    fetchSleeperLeague: (...args: unknown[]) => mockFetchLeague(...args),
    fetchSleeperLeagueUsers: (...args: unknown[]) => mockFetchUsers(...args),
  };
});

const MOCK_LEAGUE: SleeperLeague = {
  total_rosters: 2,
  roster_positions: ['QB', 'SUPER_FLEX', 'BN'],
  scoring_settings: { pass_yd: 0.04, pass_td: 4, pass_int: -2, rec: 1 },
};

const MOCK_USERS: SleeperUser[] = [
  { user_id: '1', display_name: 'coreschke' },
  { user_id: '2', display_name: 'rival' },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockFetchLeague.mockResolvedValue(MOCK_LEAGUE);
  mockFetchUsers.mockResolvedValue(MOCK_USERS);
});

describe('importFromSleeper', () => {
  it('calls fetchSleeperLeague and fetchSleeperLeagueUsers with the provided leagueId', async () => {
    await importFromSleeper('1360707683916734464');
    expect(mockFetchLeague).toHaveBeenCalledWith('1360707683916734464');
    expect(mockFetchUsers).toHaveBeenCalledWith('1360707683916734464');
  });

  it('returns ok:true with mapped data on success', async () => {
    const result = await importFromSleeper('1360707683916734464');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.teamCount).toBe(2);
      expect(result.data.startingLineup).toEqual(['QB', 'SUPER_FLEX']);
    }
  });

  it('returns league-not-found error when fetchSleeperLeague throws NOT_FOUND', async () => {
    mockFetchLeague.mockRejectedValue(new Error('NOT_FOUND'));
    const result = await importFromSleeper('bad-id');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/league not found/i);
    }
  });

  it('returns generic error on unexpected failure', async () => {
    mockFetchLeague.mockRejectedValue(new Error('Network error'));
    const result = await importFromSleeper('valid-id');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/couldn't reach sleeper/i);
    }
  });
});
