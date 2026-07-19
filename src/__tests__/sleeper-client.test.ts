import {
  fetchSleeperLeague,
  fetchSleeperLeagueRosters,
  fetchSleeperLeagueUsers,
  SleeperClientError,
} from '@/lib/sleeper';

const VALID_LEAGUE = {
  name: 'Dynasty Warlords',
  total_rosters: 12,
  roster_positions: ['QB', 'RB', 'WR', 'TE', 'FLEX', 'SUPER_FLEX'],
  scoring_settings: { rec: 1, pass_yd: 0.04 },
};

const VALID_USERS = [{ user_id: 'user-1', display_name: 'coreschke' }];
const VALID_ROSTERS = [{ roster_id: 1, owner_id: 'user-1', players: ['player-1'] }];

function response(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(body),
  } as unknown as Response;
}

describe('Sleeper client', () => {
  const originalFetch = global.fetch;
  const mockFetch = jest.fn();

  beforeEach(() => {
    mockFetch.mockReset();
    global.fetch = mockFetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('rejects an invalid league ID without calling fetch', async () => {
    await expect(fetchSleeperLeague(' not-a-league ')).rejects.toMatchObject({
      code: 'INVALID_LEAGUE_ID',
    } satisfies Partial<SleeperClientError>);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it.each([
    ['404', [response(404, {})], 'NOT_FOUND'],
    ['final 429', [response(429, {}), response(429, {})], 'RATE_LIMITED'],
    ['final 503', [response(503, {}), response(503, {})], 'UNAVAILABLE'],
    [
      'rejected fetch',
      [Promise.reject(new Error('offline')), Promise.reject(new Error('offline'))],
      'UNAVAILABLE',
    ],
    [
      'timeout',
      [Promise.reject(Object.assign(new Error('timed out'), { name: 'TimeoutError' }))],
      'TIMEOUT',
    ],
  ])('returns %s as the client failure code', async (_, results, code) => {
    mockFetch.mockImplementation(() => results.shift());

    await expect(fetchSleeperLeague('1360707683916734464')).rejects.toMatchObject({ code });
  });

  it('returns malformed response codes for invalid JSON and schema-invalid bodies', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: jest.fn().mockRejectedValue(new SyntaxError('Unexpected token')),
    } as unknown as Response);
    await expect(fetchSleeperLeague('1360707683916734464')).rejects.toMatchObject({
      code: 'MALFORMED_RESPONSE',
    });

    mockFetch.mockResolvedValueOnce(response(200, { name: 'Incomplete league' }));
    await expect(fetchSleeperLeague('1360707683916734464')).rejects.toMatchObject({
      code: 'MALFORMED_RESPONSE',
    });
  });

  it('retries a 503 once and returns validated data', async () => {
    mockFetch
      .mockResolvedValueOnce(response(503, {}))
      .mockResolvedValueOnce(response(200, VALID_LEAGUE));

    await expect(fetchSleeperLeague('1360707683916734464')).resolves.toEqual(VALID_LEAGUE);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('includes an abort signal in each fetch request', async () => {
    mockFetch.mockResolvedValue(response(200, VALID_LEAGUE));

    await fetchSleeperLeague('1360707683916734464');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.sleeper.app/v1/league/1360707683916734464',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('validates user and roster endpoint payloads', async () => {
    mockFetch.mockResolvedValueOnce(response(200, VALID_USERS));
    await expect(fetchSleeperLeagueUsers('1360707683916734464')).resolves.toEqual(VALID_USERS);

    mockFetch.mockResolvedValueOnce(response(200, VALID_ROSTERS));
    await expect(fetchSleeperLeagueRosters('1360707683916734464')).resolves.toEqual(VALID_ROSTERS);
  });
});
