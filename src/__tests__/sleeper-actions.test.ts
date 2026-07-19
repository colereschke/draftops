import { importFromSleeper } from '@/lib/sleeper-actions';
import {
  SleeperClientError,
  type SleeperClientFailureCode,
  type SleeperLeague,
  type SleeperUser,
  type SleeperRoster,
} from '@/lib/sleeper';

const mockFetchLeague = jest.fn();
const mockFetchUsers = jest.fn();
const mockFetchRosters = jest.fn();
const mockAuth = jest.fn();

jest.mock('@/auth', () => ({
  auth: () => mockAuth(),
}));

jest.mock('@/lib/sleeper', () => {
  const actual = jest.requireActual('@/lib/sleeper') as typeof import('@/lib/sleeper');
  return {
    ...actual,
    fetchSleeperLeague: (...args: unknown[]) => mockFetchLeague(...args),
    fetchSleeperLeagueUsers: (...args: unknown[]) => mockFetchUsers(...args),
    fetchSleeperLeagueRosters: (...args: unknown[]) => mockFetchRosters(...args),
  };
});

const MOCK_LEAGUE: SleeperLeague = {
  name: 'Dynasty Warlords',
  total_rosters: 2,
  roster_positions: ['QB', 'SUPER_FLEX', 'BN'],
  scoring_settings: { pass_yd: 0.04, pass_td: 4, pass_int: -2, rec: 1 },
};

const MOCK_USERS: SleeperUser[] = [
  { user_id: '1', display_name: 'coreschke' },
  { user_id: '2', display_name: 'rival' },
];

const MOCK_ROSTERS: SleeperRoster[] = [
  { roster_id: 1, owner_id: '1' },
  { roster_id: 2, owner_id: '2' },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockResolvedValue({ user: { id: 'user-1' } });
  mockFetchLeague.mockResolvedValue(MOCK_LEAGUE);
  mockFetchUsers.mockResolvedValue(MOCK_USERS);
  mockFetchRosters.mockResolvedValue(MOCK_ROSTERS);
});

describe('importFromSleeper', () => {
  it('returns a sign-in error without contacting Sleeper for an anonymous request', async () => {
    mockAuth.mockResolvedValue(null);

    await expect(importFromSleeper('1360707683916734464')).resolves.toEqual({
      ok: false,
      error: 'Sign in to import a Sleeper league.',
    });
    expect(mockFetchLeague).not.toHaveBeenCalled();
    expect(mockFetchUsers).not.toHaveBeenCalled();
    expect(mockFetchRosters).not.toHaveBeenCalled();
  });

  it('rejects a non-string league ID without contacting Sleeper', async () => {
    await expect(importFromSleeper(null as unknown as string)).resolves.toEqual({
      ok: false,
      error: 'Enter a valid Sleeper league ID.',
    });
    expect(mockFetchLeague).not.toHaveBeenCalled();
    expect(mockFetchUsers).not.toHaveBeenCalled();
    expect(mockFetchRosters).not.toHaveBeenCalled();
  });

  it('returns the generic error when authentication rejects', async () => {
    mockAuth.mockRejectedValue(new Error('Auth provider unavailable'));

    await expect(importFromSleeper('1360707683916734464')).resolves.toEqual({
      ok: false,
      error: "Couldn't reach Sleeper — try again.",
    });
    expect(mockFetchLeague).not.toHaveBeenCalled();
    expect(mockFetchUsers).not.toHaveBeenCalled();
    expect(mockFetchRosters).not.toHaveBeenCalled();
  });

  it('calls fetchSleeperLeague, fetchSleeperLeagueUsers, and fetchSleeperLeagueRosters with the provided leagueId', async () => {
    await importFromSleeper('1360707683916734464');
    expect(mockFetchLeague).toHaveBeenCalledWith('1360707683916734464');
    expect(mockFetchUsers).toHaveBeenCalledWith('1360707683916734464');
    expect(mockFetchRosters).toHaveBeenCalledWith('1360707683916734464');
  });

  it('returns ok:true with mapped data on success', async () => {
    const result = await importFromSleeper('1360707683916734464');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.teamCount).toBe(2);
      expect(result.data.startingLineup).toEqual(['QB', 'SUPER_FLEX']);
      expect(result.data.leagueId).toBe('1360707683916734464');
    }
  });

  it.each<[SleeperClientFailureCode, string]>([
    ['INVALID_LEAGUE_ID', 'Enter a valid Sleeper league ID.'],
    ['NOT_FOUND', 'League not found. Check your Sleeper league ID.'],
    ['TIMEOUT', 'Sleeper timed out. Try again in a moment.'],
    ['RATE_LIMITED', 'Sleeper is rate-limiting requests. Try again shortly.'],
    ['MALFORMED_RESPONSE', 'Sleeper returned unexpected league data. Try again later.'],
    ['UNAVAILABLE', 'Sleeper is unavailable — try again.'],
  ])('returns actionable copy for %s', async (code, error) => {
    mockFetchLeague.mockRejectedValue(new SleeperClientError(code));

    await expect(importFromSleeper('1360707683916734464')).resolves.toEqual({ ok: false, error });
  });

  it('returns generic error on unexpected failure', async () => {
    mockFetchLeague.mockRejectedValue(new Error('Network error'));
    const result = await importFromSleeper('1360707683916734464');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("Couldn't reach Sleeper — try again.");
    }
  });
});
