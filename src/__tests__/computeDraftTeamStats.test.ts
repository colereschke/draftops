import { computeDraftTeamStats } from '@/lib/computeDraftTeamStats';
import {
  CANONICAL_STATS_PLAYERS,
  CANONICAL_STATS_TEAMS,
} from '@/__tests__/fixtures/draftTeamStats';

describe('computeDraftTeamStats', () => {
  it('uses one policy for spending, roster slots, packages, age, and active deltas', () => {
    const [stats] = computeDraftTeamStats({
      teams: CANONICAL_STATS_TEAMS,
      players: CANONICAL_STATS_PLAYERS,
      rosterSize: 30,
    });

    expect(stats).toMatchObject({
      spent: 480,
      remaining: 520,
      rosterCount: 2,
      rosterRemaining: 28,
      buyingPower: 492,
      pkgCount: 1,
      avgAge: 25,
    });
    expect(stats.results.map((result) => result.delta)).toEqual([20, -20, -5, 1]);
  });

  it('applies a net budget delta without treating it as spend or a roster result', () => {
    const [stats] = computeDraftTeamStats({
      teams: CANONICAL_STATS_TEAMS,
      players: CANONICAL_STATS_PLAYERS,
      rosterSize: 30,
      budgetDeltaByTeamId: new Map([[1, 80]]),
    });

    expect(stats.spent).toBe(480);
    expect(stats.remaining).toBe(600);
    expect(stats.rosterCount).toBe(2);
    expect(stats.buyingPower).toBe(572);
  });

  it('does not name-fallback when a present player ID is unknown', () => {
    const teams = CANONICAL_STATS_TEAMS.map((team) => ({
      ...team,
      results: team.results.map((result) =>
        result.id === 101 ? { ...result, playerId: 999 } : result,
      ),
    }));

    const [stats] = computeDraftTeamStats({
      teams,
      players: CANONICAL_STATS_PLAYERS,
      rosterSize: 30,
    });

    expect(stats.results[0].delta).toBeNull();
    expect(stats.avgAge).toBe(23);
  });
});
