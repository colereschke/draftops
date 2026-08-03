import { getTradeablePicksForAllTeams, getTradeablePicksForTeam } from '@/lib/tradePicker';

const mockGetGeneratedPickYear = jest.fn();
const mockResolveAllPickHolders = jest.fn();
jest.mock('@/lib/pickOwnership', () => ({
  getGeneratedPickYear: (...args: unknown[]) => mockGetGeneratedPickYear(...args),
  resolveAllPickHolders: (...args: unknown[]) => mockResolveAllPickHolders(...args),
}));
const mockTeamFindMany = jest.fn();
const client = { team: { findMany: mockTeamFindMany } } as never;

beforeEach(() => jest.clearAllMocks());

describe('getTradeablePicksForTeam', () => {
  it('returns an empty list when no future-pick year has been generated', async () => {
    mockGetGeneratedPickYear.mockResolvedValue(null);
    expect(await getTradeablePicksForTeam(client, 1, 9)).toEqual([]);
  });

  it('includes untouched own picks and excludes picks held by other teams', async () => {
    mockGetGeneratedPickYear.mockResolvedValue(2027);
    mockTeamFindMany.mockResolvedValue([
      { id: 9, handle: 'origin-team' },
      { id: 6, handle: 'other-team' },
    ]);
    mockResolveAllPickHolders.mockResolvedValue([
      // team 9's round 1 was traded away to team 6; rounds 2 and 3 are untouched (default to team 9)
      {
        originTeamId: 9,
        futurePickYear: 2027,
        futurePickRound: 1,
        holderTeamId: 6,
        eventKind: 'trade',
        eventId: 1,
      },
    ]);

    const result = await getTradeablePicksForTeam(client, 1, 9);

    expect(result).toEqual([
      { originTeamId: 9, originHandle: 'origin-team', futurePickYear: 2027, futurePickRound: 2 },
      { originTeamId: 9, originHandle: 'origin-team', futurePickYear: 2027, futurePickRound: 3 },
    ]);
  });
});

describe('getTradeablePicksForAllTeams', () => {
  it('returns an empty map when no future-pick year has been generated', async () => {
    mockGetGeneratedPickYear.mockResolvedValue(null);
    const result = await getTradeablePicksForAllTeams(client, 1);
    expect(result).toEqual({ generatedPickYear: null, tradeablePicksByTeamId: {} });
  });

  it('buckets every team’s untouched and traded-for picks in a single pass', async () => {
    mockGetGeneratedPickYear.mockResolvedValue(2027);
    mockTeamFindMany.mockResolvedValue([
      { id: 9, handle: 'origin-team' },
      { id: 6, handle: 'other-team' },
    ]);
    mockResolveAllPickHolders.mockResolvedValue([
      {
        originTeamId: 9,
        futurePickYear: 2027,
        futurePickRound: 1,
        holderTeamId: 6,
        eventKind: 'trade',
        eventId: 1,
      },
    ]);

    const result = await getTradeablePicksForAllTeams(client, 1);

    expect(result.generatedPickYear).toBe(2027);
    expect(result.tradeablePicksByTeamId[9]).toEqual([
      { originTeamId: 9, originHandle: 'origin-team', futurePickYear: 2027, futurePickRound: 2 },
      { originTeamId: 9, originHandle: 'origin-team', futurePickYear: 2027, futurePickRound: 3 },
    ]);
    // Team 6's bucket includes BOTH the pick it acquired from team 9 (round 1, touched) AND its
    // own three untouched 2027 rounds (they default to their own team as holder, same as team 9's
    // rounds 2-3 above) — every team always has its own untouched picks in its own bucket unless
    // traded away, which is exactly what the per-team `getTradeablePicksForTeam` test above already
    // demonstrates for team 9. Asserting only the acquired pick here would be asserting a behavior
    // ("a team's own never-traded picks aren't tradeable") this function must NOT have.
    expect(result.tradeablePicksByTeamId[6]).toEqual([
      { originTeamId: 9, originHandle: 'origin-team', futurePickYear: 2027, futurePickRound: 1 },
      { originTeamId: 6, originHandle: 'other-team', futurePickYear: 2027, futurePickRound: 1 },
      { originTeamId: 6, originHandle: 'other-team', futurePickYear: 2027, futurePickRound: 2 },
      { originTeamId: 6, originHandle: 'other-team', futurePickYear: 2027, futurePickRound: 3 },
    ]);
    // team.findMany and resolveAllPickHolders each run exactly once, not once per team.
    expect(mockTeamFindMany).toHaveBeenCalledTimes(1);
    expect(mockResolveAllPickHolders).toHaveBeenCalledTimes(1);
  });
});
