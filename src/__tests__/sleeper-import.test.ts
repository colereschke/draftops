import { mapSleeperLeague } from '@/lib/sleeper';
import type { SleeperLeague, SleeperUser, SleeperRoster, SleeperImportResult } from '@/lib/sleeper';

// Verified against real payload: league 1360707683916734464
const FULL_LEAGUE: SleeperLeague = {
  name: 'Dynasty Warlords',
  total_rosters: 12,
  roster_positions: [
    'QB',
    'RB',
    'WR',
    'WR',
    'TE',
    'FLEX',
    'SUPER_FLEX',
    'BN',
    'BN',
    'BN',
    'IR',
    'K',
  ],
  scoring_settings: {
    pass_yd: 0.04,
    pass_td: 4,
    pass_int: -2,
    rec: 1,
    // bonus_rec_rb absent (= 0) — Sleeper omits 0-value fields
    bonus_rec_wr: 0,
    bonus_rec_te: 0.5,
    rec_fd: 0,
    // bonus_fd_rb, bonus_fd_wr absent (= 0)
    bonus_fd_te: 0.25,
    rush_att: 0,
    rush_fd: 0,
  },
};

const MINIMAL_LEAGUE: SleeperLeague = {
  name: 'Minimal League',
  total_rosters: 2,
  roster_positions: ['QB', 'SUPER_FLEX', 'BN'],
  scoring_settings: { pass_yd: 0.04, pass_td: 4, pass_int: -2, rec: 1 },
};

// display_name IS the Sleeper username — no separate user_name field in /users response
const MOCK_USERS: SleeperUser[] = [
  { user_id: '1', display_name: 'coreschke', metadata: { team_name: "Cole's Team" } },
  { user_id: '2', display_name: 'rival' },
];

// One roster per team; rosters own users via owner_id. For FULL_LEAGUE only users 1 & 2 exist,
// so rosters 3–12 resolve to placeholder team rows.
const FULL_ROSTERS: SleeperRoster[] = Array.from({ length: 12 }, (_, i) => ({
  roster_id: i + 1,
  owner_id: `${i + 1}`,
}));

describe('mapSleeperLeague — leagueName', () => {
  it('maps the league name for the draft name field', () => {
    const result = mapSleeperLeague(
      FULL_LEAGUE,
      MOCK_USERS,
      FULL_ROSTERS,
      undefined,
      '1360707683916734464',
    );
    expect(result.leagueName).toBe('Dynasty Warlords');
    expect(result.leagueId).toBe('1360707683916734464');
  });
});

describe('mapSleeperLeague — teamCount and rosterSize', () => {
  it('sets teamCount to the number of rosters (one team per roster)', () => {
    const result = mapSleeperLeague(FULL_LEAGUE, MOCK_USERS, FULL_ROSTERS);
    expect(result.teamCount).toBe(12);
    expect(result.teams).toHaveLength(12);
  });

  it('counts ALL roster_positions including BN/IR/K for rosterSize', () => {
    const result = mapSleeperLeague(FULL_LEAGUE, MOCK_USERS, FULL_ROSTERS);
    expect(result.rosterSize).toBe(12); // 7 starters + BN×3 + IR + K
  });
});

describe('mapSleeperLeague — startingLineup', () => {
  it('excludes BN, IR, and K from startingLineup', () => {
    const result = mapSleeperLeague(FULL_LEAGUE, MOCK_USERS, FULL_ROSTERS);
    expect(result.startingLineup).not.toContain('BN');
    expect(result.startingLineup).not.toContain('IR');
    expect(result.startingLineup).not.toContain('K');
  });

  it('includes QB, RB, WR, TE, FLEX, SUPER_FLEX in startingLineup', () => {
    const result = mapSleeperLeague(FULL_LEAGUE, MOCK_USERS, FULL_ROSTERS);
    expect(result.startingLineup).toEqual(['QB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'SUPER_FLEX']);
  });

  it('skips unrecognized slot types (IDP, etc.) silently', () => {
    const league = {
      ...MINIMAL_LEAGUE,
      roster_positions: ['QB', 'DL', 'LB', 'SUPER_FLEX', 'BN'],
    };
    const result = mapSleeperLeague(league, [], []);
    expect(result.startingLineup).toEqual(['QB', 'SUPER_FLEX']);
  });
});

describe('mapSleeperLeague — scoring settings', () => {
  it('inverts pass_yd (pts/yd) to passYdsPerPoint (yds/pt)', () => {
    const result = mapSleeperLeague(FULL_LEAGUE, MOCK_USERS, FULL_ROSTERS);
    expect(result.scoringSettings.passYdsPerPoint).toBe(25); // 1 / 0.04 = 25
  });

  it('defaults passYdsPerPoint to 25 when pass_yd is 0', () => {
    const league = {
      ...MINIMAL_LEAGUE,
      scoring_settings: { ...MINIMAL_LEAGUE.scoring_settings, pass_yd: 0 },
    };
    const result = mapSleeperLeague(league, [], []);
    expect(result.scoringSettings.passYdsPerPoint).toBe(25);
  });

  it('maps pass_td directly to passTD', () => {
    const result = mapSleeperLeague(FULL_LEAGUE, MOCK_USERS, FULL_ROSTERS);
    expect(result.scoringSettings.passTD).toBe(4);
  });

  it('maps pass_int directly to passInt (already negative)', () => {
    const result = mapSleeperLeague(FULL_LEAGUE, MOCK_USERS, FULL_ROSTERS);
    expect(result.scoringSettings.passInt).toBe(-2);
  });

  it('computes pprTE as rec + bonus_rec_te', () => {
    const result = mapSleeperLeague(FULL_LEAGUE, MOCK_USERS, FULL_ROSTERS);
    expect(result.scoringSettings.pprTE).toBeCloseTo(1.5); // rec=1 + bonus_rec_te=0.5
  });

  it('computes pprRB as rec + bonus_rec_rb (0 bonus = just rec)', () => {
    const result = mapSleeperLeague(FULL_LEAGUE, MOCK_USERS, FULL_ROSTERS);
    expect(result.scoringSettings.pprRB).toBe(1); // rec=1 + bonus_rec_rb=0
  });

  it('maps bonus_fd_te to teFDBonus', () => {
    const result = mapSleeperLeague(FULL_LEAGUE, MOCK_USERS, FULL_ROSTERS);
    expect(result.scoringSettings.teFDBonus).toBe(0.25);
  });

  it('defaults missing scoring_settings fields to 0', () => {
    // MINIMAL_LEAGUE has no rush_att, rush_fd, bonus_* fields
    const result = mapSleeperLeague(MINIMAL_LEAGUE, [], []);
    expect(result.scoringSettings.rushAtt).toBe(0);
    expect(result.scoringSettings.rushFD).toBe(0);
    expect(result.scoringSettings.recFD).toBe(0);
    expect(result.scoringSettings.rbFDBonus).toBe(0);
    expect(result.scoringSettings.teFDBonus).toBe(0);
  });
});

describe('mapSleeperLeague — teams', () => {
  it('maps each roster owner display_name to handle', () => {
    const result = mapSleeperLeague(FULL_LEAGUE, MOCK_USERS, FULL_ROSTERS);
    expect(result.teams[0].handle).toBe('coreschke');
    expect(result.teams[1].handle).toBe('rival');
    expect(result.teams[0]).toMatchObject({ sleeperRosterId: 1 });
  });

  it('prefers metadata.team_name over display_name for displayName', () => {
    const result = mapSleeperLeague(FULL_LEAGUE, MOCK_USERS, FULL_ROSTERS);
    expect(result.teams[0].displayName).toBe("Cole's Team");
  });

  it('falls back to display_name when metadata.team_name is absent', () => {
    const result = mapSleeperLeague(FULL_LEAGUE, MOCK_USERS, FULL_ROSTERS);
    expect(result.teams[1].displayName).toBe('rival');
  });

  it('orders teams by roster_id regardless of input order', () => {
    const unordered: SleeperRoster[] = [
      { roster_id: 2, owner_id: '2' },
      { roster_id: 1, owner_id: '1' },
    ];
    const result = mapSleeperLeague(MINIMAL_LEAGUE, MOCK_USERS, unordered);
    expect(result.teams.map((t) => t.handle)).toEqual(['coreschke', 'rival']);
  });

  it('uses a placeholder for an orphan roster (owner_id null)', () => {
    const rosters: SleeperRoster[] = [
      { roster_id: 1, owner_id: '1' },
      { roster_id: 2, owner_id: null },
    ];
    const result = mapSleeperLeague(MINIMAL_LEAGUE, MOCK_USERS, rosters);
    expect(result.teams[1].handle).toBe('roster-2');
    expect(result.teams[1].displayName).toBe('Roster 2');
  });
});

describe('mapSleeperLeague — co-owners', () => {
  // Real league 1360707683916734464 has 13 users for 12 rosters (one pair of co-owners).
  // Building teams from rosters (not slicing users) yields exactly one team per roster and
  // never drops a manager or duplicates a co-owned roster.
  const CO_OWNER_USERS: SleeperUser[] = [
    { user_id: '1', display_name: 'coreschke' },
    { user_id: '2', display_name: 'rival' },
    { user_id: '3', display_name: 'cooperson' },
  ];
  const CO_OWNER_ROSTERS: SleeperRoster[] = [
    { roster_id: 1, owner_id: '1', co_owners: ['3'] },
    { roster_id: 2, owner_id: '2' },
  ];

  it('produces one team per roster even when users outnumber rosters', () => {
    const result = mapSleeperLeague(MINIMAL_LEAGUE, CO_OWNER_USERS, CO_OWNER_ROSTERS);
    expect(result.teams).toHaveLength(2);
    expect(result.teamCount).toBe(2);
    expect(result.teams.map((t) => t.handle)).toEqual(['coreschke', 'rival']);
  });

  it('matches ownerIndex to a co-owner’s roster', () => {
    const result = mapSleeperLeague(MINIMAL_LEAGUE, CO_OWNER_USERS, CO_OWNER_ROSTERS, 'cooperson');
    expect(result.ownerIndex).toBe(0);
  });
});

describe('mapSleeperLeague — ownerIndex', () => {
  it('returns correct ownerIndex when display_name matches (case-insensitive)', () => {
    // 'CoreSchke' should match display_name 'coreschke' case-insensitively
    const result = mapSleeperLeague(FULL_LEAGUE, MOCK_USERS, FULL_ROSTERS, 'CoreSchke');
    expect(result.ownerIndex).toBe(0);
  });

  it('returns ownerIndex null when username does not match any team', () => {
    const result = mapSleeperLeague(FULL_LEAGUE, MOCK_USERS, FULL_ROSTERS, 'unknown-user');
    expect(result.ownerIndex).toBeNull();
  });

  it('returns ownerIndex null when ownerUsername is not provided', () => {
    const result = mapSleeperLeague(FULL_LEAGUE, MOCK_USERS, FULL_ROSTERS);
    expect(result.ownerIndex).toBeNull();
  });
});

// Suppress unused import warning — SleeperImportResult is used as a type reference here
// to ensure the export contract is correct
const _typeCheck: SleeperImportResult | undefined = undefined;
void _typeCheck;
