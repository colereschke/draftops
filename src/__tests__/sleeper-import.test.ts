import { mapSleeperLeague } from '@/lib/sleeper';
import type { SleeperLeague, SleeperUser, SleeperImportResult } from '@/lib/sleeper';

// Verified against real payload: league 1360707683916734464
const FULL_LEAGUE: SleeperLeague = {
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
  total_rosters: 2,
  roster_positions: ['QB', 'SUPER_FLEX', 'BN'],
  scoring_settings: { pass_yd: 0.04, pass_td: 4, pass_int: -2, rec: 1 },
};

// display_name IS the Sleeper username — no separate user_name field in /users response
const MOCK_USERS: SleeperUser[] = [
  { user_id: '1', display_name: 'coreschke', metadata: { team_name: "Cole's Team" } },
  { user_id: '2', display_name: 'rival' },
];

describe('mapSleeperLeague — teamCount and rosterSize', () => {
  it('maps total_rosters to teamCount', () => {
    const result = mapSleeperLeague(FULL_LEAGUE, MOCK_USERS);
    expect(result.teamCount).toBe(12);
  });

  it('counts ALL roster_positions including BN/IR/K for rosterSize', () => {
    const result = mapSleeperLeague(FULL_LEAGUE, MOCK_USERS);
    expect(result.rosterSize).toBe(12); // 7 starters + BN×3 + IR + K
  });
});

describe('mapSleeperLeague — startingLineup', () => {
  it('excludes BN, IR, and K from startingLineup', () => {
    const result = mapSleeperLeague(FULL_LEAGUE, MOCK_USERS);
    expect(result.startingLineup).not.toContain('BN');
    expect(result.startingLineup).not.toContain('IR');
    expect(result.startingLineup).not.toContain('K');
  });

  it('includes QB, RB, WR, TE, FLEX, SUPER_FLEX in startingLineup', () => {
    const result = mapSleeperLeague(FULL_LEAGUE, MOCK_USERS);
    expect(result.startingLineup).toEqual(['QB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'SUPER_FLEX']);
  });

  it('skips unrecognized slot types (IDP, etc.) silently', () => {
    const league = {
      ...MINIMAL_LEAGUE,
      roster_positions: ['QB', 'DL', 'LB', 'SUPER_FLEX', 'BN'],
    };
    const result = mapSleeperLeague(league, []);
    expect(result.startingLineup).toEqual(['QB', 'SUPER_FLEX']);
  });
});

describe('mapSleeperLeague — scoring settings', () => {
  it('inverts pass_yd (pts/yd) to passYdsPerPoint (yds/pt)', () => {
    const result = mapSleeperLeague(FULL_LEAGUE, MOCK_USERS);
    expect(result.scoringSettings.passYdsPerPoint).toBe(25); // 1 / 0.04 = 25
  });

  it('defaults passYdsPerPoint to 25 when pass_yd is 0', () => {
    const league = {
      ...MINIMAL_LEAGUE,
      scoring_settings: { ...MINIMAL_LEAGUE.scoring_settings, pass_yd: 0 },
    };
    const result = mapSleeperLeague(league, []);
    expect(result.scoringSettings.passYdsPerPoint).toBe(25);
  });

  it('maps pass_td directly to passTD', () => {
    const result = mapSleeperLeague(FULL_LEAGUE, MOCK_USERS);
    expect(result.scoringSettings.passTD).toBe(4);
  });

  it('maps pass_int directly to passInt (already negative)', () => {
    const result = mapSleeperLeague(FULL_LEAGUE, MOCK_USERS);
    expect(result.scoringSettings.passInt).toBe(-2);
  });

  it('computes pprTE as rec + bonus_rec_te', () => {
    const result = mapSleeperLeague(FULL_LEAGUE, MOCK_USERS);
    expect(result.scoringSettings.pprTE).toBeCloseTo(1.5); // rec=1 + bonus_rec_te=0.5
  });

  it('computes pprRB as rec + bonus_rec_rb (0 bonus = just rec)', () => {
    const result = mapSleeperLeague(FULL_LEAGUE, MOCK_USERS);
    expect(result.scoringSettings.pprRB).toBe(1); // rec=1 + bonus_rec_rb=0
  });

  it('maps bonus_fd_te to teFDBonus', () => {
    const result = mapSleeperLeague(FULL_LEAGUE, MOCK_USERS);
    expect(result.scoringSettings.teFDBonus).toBe(0.25);
  });

  it('defaults missing scoring_settings fields to 0', () => {
    // MINIMAL_LEAGUE has no rush_att, rush_fd, bonus_* fields
    const result = mapSleeperLeague(MINIMAL_LEAGUE, []);
    expect(result.scoringSettings.rushAtt).toBe(0);
    expect(result.scoringSettings.rushFD).toBe(0);
    expect(result.scoringSettings.recFD).toBe(0);
    expect(result.scoringSettings.rbFDBonus).toBe(0);
    expect(result.scoringSettings.teFDBonus).toBe(0);
  });
});

describe('mapSleeperLeague — teams', () => {
  it('maps display_name to handle', () => {
    const result = mapSleeperLeague(FULL_LEAGUE, MOCK_USERS);
    expect(result.teams[0].handle).toBe('coreschke');
    expect(result.teams[1].handle).toBe('rival');
  });

  it('prefers metadata.team_name over display_name for displayName', () => {
    const result = mapSleeperLeague(FULL_LEAGUE, MOCK_USERS);
    expect(result.teams[0].displayName).toBe("Cole's Team");
  });

  it('falls back to display_name when metadata.team_name is absent', () => {
    const result = mapSleeperLeague(FULL_LEAGUE, MOCK_USERS);
    expect(result.teams[1].displayName).toBe('rival');
  });
});

describe('mapSleeperLeague — teams truncated to teamCount', () => {
  it('truncates teams to total_rosters when users outnumber rosters (co-owner scenario)', () => {
    // Real league 1360707683916734464 has 13 users for 12 rosters (one pair of co-owners)
    const thirteenUsers: SleeperUser[] = [
      ...MOCK_USERS,
      ...Array.from({ length: 11 }, (_, i) => ({ user_id: `${i + 3}`, display_name: `extra${i}` })),
    ];
    const result = mapSleeperLeague(FULL_LEAGUE, thirteenUsers);
    expect(result.teams).toHaveLength(12);
    expect(result.teamCount).toBe(12);
  });
});

describe('mapSleeperLeague — ownerIndex', () => {
  it('returns correct ownerIndex when display_name matches (case-insensitive)', () => {
    // 'CoreSchke' should match display_name 'coreschke' case-insensitively
    const result = mapSleeperLeague(FULL_LEAGUE, MOCK_USERS, 'CoreSchke');
    expect(result.ownerIndex).toBe(0);
  });

  it('returns ownerIndex null when username does not match any team', () => {
    const result = mapSleeperLeague(FULL_LEAGUE, MOCK_USERS, 'unknown-user');
    expect(result.ownerIndex).toBeNull();
  });

  it('returns ownerIndex null when ownerUsername is not provided', () => {
    const result = mapSleeperLeague(FULL_LEAGUE, MOCK_USERS);
    expect(result.ownerIndex).toBeNull();
  });
});

// Suppress unused import warning — SleeperImportResult is used as a type reference here
// to ensure the export contract is correct
const _typeCheck: SleeperImportResult | undefined = undefined;
void _typeCheck;
