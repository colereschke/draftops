import { computeTeamStats } from '@/lib/computeTeamStats';
import type { Player } from '@/types';

const makeResult = (
  overrides: Partial<{
    id: number;
    player: string;
    position: string;
    nflTeam: string;
    price: number;
    sfRank: number | null;
    teamId: number;
  }> = {},
) => ({
  id: 1,
  player: 'Patrick Mahomes',
  position: 'QB',
  nflTeam: 'KC',
  price: 200,
  sfRank: 1,
  teamId: 1,
  ...overrides,
});

const makeTeam = (
  overrides: Partial<{
    id: number;
    handle: string;
    displayName: string | null;
    budget: number;
    results: ReturnType<typeof makeResult>[];
  }> = {},
) => ({
  id: 1,
  handle: 'test',
  displayName: null,
  budget: 1000,
  results: [] as ReturnType<typeof makeResult>[],
  ...overrides,
});

describe('computeTeamStats', () => {
  it('computes zero stats for a team with no results', () => {
    const [stats] = computeTeamStats([makeTeam()], [], 30);
    expect(stats.spent).toBe(0);
    expect(stats.remaining).toBe(1000);
    expect(stats.rosterCount).toBe(0);
    expect(stats.rosterRemaining).toBe(30);
    expect(stats.buyingPower).toBe(970);
    expect(stats.pkgCount).toBe(0);
  });

  it('uses the draft rosterSize for buying power', () => {
    const [stats] = computeTeamStats([makeTeam()], [], 25);
    // 0 spent, budget 1000, rosterRemaining = 25 → buyingPower = 1000 - 25
    expect(stats.rosterRemaining).toBe(25);
    expect(stats.buyingPower).toBe(975);
  });

  it('computes spent from the sum of result prices', () => {
    const team = makeTeam({
      results: [makeResult({ price: 150 }), makeResult({ id: 2, price: 100 })],
    });
    const [stats] = computeTeamStats([team], [], 30);
    expect(stats.spent).toBe(250);
    expect(stats.remaining).toBe(750);
  });

  it('computes rosterCount and rosterRemaining', () => {
    const team = makeTeam({
      results: [makeResult(), makeResult({ id: 2 }), makeResult({ id: 3 })],
    });
    const [stats] = computeTeamStats([team], [], 30);
    expect(stats.rosterCount).toBe(3);
    expect(stats.rosterRemaining).toBe(27);
  });

  it('computes buyingPower as remaining minus rosterRemaining', () => {
    const team = makeTeam({ results: [makeResult({ price: 100 })] });
    const [stats] = computeTeamStats([team], [], 30);
    // remaining=900, rosterRemaining=29, buyingPower=871
    expect(stats.buyingPower).toBe(871);
  });

  it('counts only PKG position results for pkgCount', () => {
    const team = makeTeam({
      results: [
        makeResult({ position: 'PKG', price: 109 }),
        makeResult({ id: 2, position: 'QB', price: 200 }),
        makeResult({ id: 3, position: 'PKG', price: 72 }),
      ],
    });
    const [stats] = computeTeamStats([team], [], 30);
    expect(stats.pkgCount).toBe(2);
  });

  it('maps results to RosterEntry shape and injects teamHandle', () => {
    const team = makeTeam({ handle: 'coreschke', results: [makeResult()] });
    const [stats] = computeTeamStats([team], [], 30);
    expect(stats.results[0]).toMatchObject({
      id: 1,
      player: 'Patrick Mahomes',
      position: 'QB',
      nflTeam: 'KC',
      price: 200,
      sfRank: 1,
      teamId: 1,
      teamHandle: 'coreschke',
    });
  });

  it('handles multiple teams independently', () => {
    const teams = [
      makeTeam({ id: 1, handle: 'a', results: [makeResult({ price: 300, teamId: 1 })] }),
      makeTeam({ id: 2, handle: 'b', results: [] }),
    ];
    const stats = computeTeamStats(teams, [], 30);
    expect(stats[0].spent).toBe(300);
    expect(stats[1].spent).toBe(0);
  });

  it('computes delta as price minus player budget when player is found', () => {
    const mockPlayers: Player[] = [
      {
        player: 'Patrick Mahomes',
        team: 'KC',
        pos: 'QB',
        age: 30,
        sfRank: 1,
        budget: 150,
        ceiling: 172,
        floor: 130,
        notes: '',
      },
    ];
    const team = makeTeam({ results: [makeResult({ price: 200 })] });
    const [stats] = computeTeamStats([team], mockPlayers, 30);
    expect(stats.results[0].delta).toBe(50); // 200 paid - 150 target
  });

  it('sets delta to null when player is not in the players list', () => {
    const team = makeTeam({ results: [makeResult({ player: 'Unknown Player' })] });
    const [stats] = computeTeamStats([team], [], 30);
    expect(stats.results[0].delta).toBeNull();
  });

  it('computes avgAge as the mean age of roster entries with known ages', () => {
    const mockPlayers: Player[] = [
      {
        player: 'Patrick Mahomes',
        team: 'KC',
        pos: 'QB',
        age: 30,
        sfRank: 1,
        budget: 150,
        ceiling: 172,
        floor: 130,
        notes: '',
      },
      {
        player: 'Puka Nacua',
        team: 'LAR',
        pos: 'WR',
        age: 24,
        sfRank: 2,
        budget: 100,
        ceiling: 120,
        floor: 80,
        notes: '',
      },
    ];
    const team = makeTeam({
      results: [
        makeResult({ player: 'Patrick Mahomes' }),
        makeResult({ id: 2, player: 'Puka Nacua', position: 'WR' }),
      ],
    });
    const [stats] = computeTeamStats([team], mockPlayers, 30);
    expect(stats.avgAge).toBe(27); // (30 + 24) / 2
  });

  it('excludes results with no matching player (e.g. picks/packages) from avgAge', () => {
    const mockPlayers: Player[] = [
      {
        player: 'Patrick Mahomes',
        team: 'KC',
        pos: 'QB',
        age: 30,
        sfRank: 1,
        budget: 150,
        ceiling: 172,
        floor: 130,
        notes: '',
      },
    ];
    const team = makeTeam({
      results: [
        makeResult({ player: 'Patrick Mahomes' }),
        makeResult({ id: 2, player: '2027 1st (via Team B)', position: 'PKG', price: 80 }),
      ],
    });
    const [stats] = computeTeamStats([team], mockPlayers, 30);
    expect(stats.avgAge).toBe(30);
  });

  it('sets avgAge to null when no roster entries resolve to a known age', () => {
    const team = makeTeam({ results: [makeResult({ player: 'Unknown Player' })] });
    const [stats] = computeTeamStats([team], [], 30);
    expect(stats.avgAge).toBeNull();
  });

  it('sets avgAge to null for a team with no results', () => {
    const [stats] = computeTeamStats([makeTeam()], [], 30);
    expect(stats.avgAge).toBeNull();
  });
});
