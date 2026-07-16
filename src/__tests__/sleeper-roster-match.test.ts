import { matchSleeperRostersToTeams } from '@/lib/sleeper';
import type { SleeperRoster, SleeperUser } from '@/lib/sleeper';

interface MatchTeamFixture {
  id: number;
  handle: string;
  sleeperRosterId: number | null;
}

const USERS: SleeperUser[] = [
  { user_id: '1', display_name: 'coreschke', metadata: { team_name: "Cole's Team" } },
  { user_id: '2', display_name: 'rival' },
];

describe('matchSleeperRostersToTeams — handle matching', () => {
  it('auto-matches a team whose handle exactly equals the roster owner display_name', () => {
    const rosters: SleeperRoster[] = [{ roster_id: 9, owner_id: '1' }];
    const teams: MatchTeamFixture[] = [{ id: 7, handle: 'coreschke', sleeperRosterId: null }];
    const result = matchSleeperRostersToTeams(rosters, USERS, teams);
    expect(result).toEqual([
      {
        sleeperRosterId: 9,
        ownerDisplayName: 'coreschke',
        ownerTeamName: "Cole's Team",
        suggestedTeamId: 7,
        matchSource: 'handle',
      },
    ]);
  });

  it('matches case-insensitively', () => {
    const rosters: SleeperRoster[] = [{ roster_id: 9, owner_id: '1' }];
    const teams: MatchTeamFixture[] = [{ id: 7, handle: 'CoreSchke', sleeperRosterId: null }];
    const result = matchSleeperRostersToTeams(rosters, USERS, teams);
    expect(result[0]).toMatchObject({ suggestedTeamId: 7, matchSource: 'handle' });
  });

  it('leaves a roster unmatched when no team handle equals the owner display_name', () => {
    const rosters: SleeperRoster[] = [{ roster_id: 9, owner_id: '2' }];
    const teams: MatchTeamFixture[] = [{ id: 7, handle: 'coreschke', sleeperRosterId: null }];
    const result = matchSleeperRostersToTeams(rosters, USERS, teams);
    expect(result[0]).toEqual({
      sleeperRosterId: 9,
      ownerDisplayName: 'rival',
      ownerTeamName: null,
      suggestedTeamId: null,
      matchSource: 'none',
    });
  });

  it('leaves an orphan roster (no owner_id) unmatched with a null owner name', () => {
    const rosters: SleeperRoster[] = [{ roster_id: 9, owner_id: null }];
    const teams: MatchTeamFixture[] = [{ id: 7, handle: 'coreschke', sleeperRosterId: null }];
    const result = matchSleeperRostersToTeams(rosters, USERS, teams);
    expect(result[0]).toEqual({
      sleeperRosterId: 9,
      ownerDisplayName: null,
      ownerTeamName: null,
      suggestedTeamId: null,
      matchSource: 'none',
    });
  });
});

describe('matchSleeperRostersToTeams — existing mapping precedence', () => {
  it('keeps a working saved mapping instead of moving it to a coincidental handle match', () => {
    // Team 7 is already mapped to roster 2. Roster 1's owner also happens to be named
    // 'coreschke' (e.g. a different manager renamed their Sleeper username later). Team 7 must
    // stay on roster 2; roster 1 must NOT steal it via the handle pass.
    const rosters: SleeperRoster[] = [
      { roster_id: 1, owner_id: '1' },
      { roster_id: 2, owner_id: '2' },
    ];
    const teams: MatchTeamFixture[] = [{ id: 7, handle: 'coreschke', sleeperRosterId: 2 }];
    const result = matchSleeperRostersToTeams(rosters, USERS, teams);
    expect(result).toEqual([
      {
        sleeperRosterId: 1,
        ownerDisplayName: 'coreschke',
        ownerTeamName: "Cole's Team",
        suggestedTeamId: null,
        matchSource: 'none',
      },
      {
        sleeperRosterId: 2,
        ownerDisplayName: 'rival',
        ownerTeamName: null,
        suggestedTeamId: 7,
        matchSource: 'existing',
      },
    ]);
  });

  it('ignores a saved sleeperRosterId that no longer exists in the current Sleeper response', () => {
    const rosters: SleeperRoster[] = [{ roster_id: 9, owner_id: '2' }];
    const teams: MatchTeamFixture[] = [{ id: 7, handle: 'coreschke', sleeperRosterId: 99 }];
    const result = matchSleeperRostersToTeams(rosters, USERS, teams);
    expect(result[0]).toMatchObject({ suggestedTeamId: null, matchSource: 'none' });
  });
});

describe('matchSleeperRostersToTeams — no double-claiming', () => {
  it('claims a team for at most one roster even if its owner manages two rosters', () => {
    const rosters: SleeperRoster[] = [
      { roster_id: 1, owner_id: '1' },
      { roster_id: 3, owner_id: '1' },
    ];
    const teams: MatchTeamFixture[] = [{ id: 7, handle: 'coreschke', sleeperRosterId: null }];
    const result = matchSleeperRostersToTeams(rosters, USERS, teams);
    const matchedRows = result.filter((row) => row.suggestedTeamId !== null);
    expect(matchedRows).toHaveLength(1);
    expect(matchedRows[0].sleeperRosterId).toBe(1); // lower roster_id wins, stable ordering
    expect(result.find((row) => row.sleeperRosterId === 3)).toMatchObject({
      suggestedTeamId: null,
      matchSource: 'none',
    });
  });

  it('orders results by roster_id ascending regardless of input order', () => {
    const rosters: SleeperRoster[] = [
      { roster_id: 2, owner_id: '2' },
      { roster_id: 1, owner_id: '1' },
    ];
    const result = matchSleeperRostersToTeams(rosters, USERS, []);
    expect(result.map((row) => row.sleeperRosterId)).toEqual([1, 2]);
  });
});
