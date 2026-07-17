import { draftInputSchema, MAX_TEAMS, MIN_TEAMS } from '@/lib/draftInputSchema';
import type { StartingSlot } from '@/types';

const VALID_INPUT = {
  name: "Cole's Draft 2025",
  budgetPerTeam: 1000,
  rosterSize: 30,
  futurePickAuctionMode: 'packages' as const,
  targetRoster: { QB: 4, RB: 9, WR: 11, TE: 3 },
  startingLineup: [
    'QB',
    'RB',
    'RB',
    'WR',
    'WR',
    'TE',
    'FLEX',
    'FLEX',
    'FLEX',
    'SUPER_FLEX',
  ] as StartingSlot[],
  scoringSettings: {
    passYdsPerPoint: 25,
    passTD: 4,
    passInt: -2,
    rushAtt: 0,
    rushFD: 0,
    pprRB: 1,
    pprWR: 1,
    pprTE: 1,
    recFD: 0,
    rbFDBonus: 0,
    wrFDBonus: 0,
    teFDBonus: 0,
  },
  teams: [
    { handle: 'coreschke', displayName: 'Cole', isMine: true },
    { handle: 'team2', displayName: 'Team Two', isMine: false },
  ],
};

function issueMessages(result: ReturnType<typeof draftInputSchema.safeParse>): string[] {
  if (result.success) return [];
  return result.error.issues.map((issue) => issue.message);
}

describe('draftInputSchema', () => {
  it('accepts a valid draft input', () => {
    expect(draftInputSchema.safeParse(VALID_INPUT).success).toBe(true);
  });

  it('rejects an empty draft name', () => {
    const result = draftInputSchema.safeParse({ ...VALID_INPUT, name: '   ' });
    expect(result.success).toBe(false);
  });

  it('rejects a draft name over 100 characters', () => {
    const result = draftInputSchema.safeParse({ ...VALID_INPUT, name: 'x'.repeat(101) });
    expect(result.success).toBe(false);
  });

  it('rejects a non-integer budgetPerTeam', () => {
    const result = draftInputSchema.safeParse({ ...VALID_INPUT, budgetPerTeam: 999.5 });
    expect(result.success).toBe(false);
  });

  it('rejects a zero or negative budgetPerTeam', () => {
    expect(draftInputSchema.safeParse({ ...VALID_INPUT, budgetPerTeam: 0 }).success).toBe(false);
    expect(draftInputSchema.safeParse({ ...VALID_INPUT, budgetPerTeam: -50 }).success).toBe(false);
  });

  it('rejects a budgetPerTeam over the maximum', () => {
    const result = draftInputSchema.safeParse({ ...VALID_INPUT, budgetPerTeam: 1_000_001 });
    expect(result.success).toBe(false);
  });

  it('rejects a non-finite budgetPerTeam', () => {
    expect(draftInputSchema.safeParse({ ...VALID_INPUT, budgetPerTeam: NaN }).success).toBe(false);
    expect(draftInputSchema.safeParse({ ...VALID_INPUT, budgetPerTeam: Infinity }).success).toBe(
      false,
    );
  });

  it('rejects a rosterSize of zero or over the maximum', () => {
    expect(draftInputSchema.safeParse({ ...VALID_INPUT, rosterSize: 0 }).success).toBe(false);
    expect(draftInputSchema.safeParse({ ...VALID_INPUT, rosterSize: 101 }).success).toBe(false);
  });

  it('rejects a targetRoster value over the roster-size bound', () => {
    const result = draftInputSchema.safeParse({
      ...VALID_INPUT,
      targetRoster: { ...VALID_INPUT.targetRoster, QB: 101 },
    });
    expect(result.success).toBe(false);
  });

  it('rejects a targetRoster key outside QB/RB/WR/TE', () => {
    const result = draftInputSchema.safeParse({
      ...VALID_INPUT,
      targetRoster: { ...VALID_INPUT.targetRoster, PICK: 5 },
    });
    expect(result.success).toBe(false);
  });

  it('rejects a starting lineup with no QB or SUPER_FLEX slot', () => {
    const result = draftInputSchema.safeParse({
      ...VALID_INPUT,
      startingLineup: ['RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'FLEX', 'FLEX', 'FLEX', 'FLEX'],
    });
    expect(result.success).toBe(false);
    expect(issueMessages(result)).toEqual(
      expect.arrayContaining(['Starting lineup must include at least one QB or SUPER_FLEX slot.']),
    );
  });

  it('rejects a starting lineup longer than the roster size', () => {
    const result = draftInputSchema.safeParse({
      ...VALID_INPUT,
      rosterSize: 5,
      startingLineup: Array(6).fill('FLEX') as StartingSlot[],
    });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid starting-lineup slot value', () => {
    const result = draftInputSchema.safeParse({
      ...VALID_INPUT,
      startingLineup: ['QB', 'KICKER' as StartingSlot],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a scoring setting outside its documented range', () => {
    const result = draftInputSchema.safeParse({
      ...VALID_INPUT,
      scoringSettings: { ...VALID_INPUT.scoringSettings, pprRB: 10 },
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-finite scoring setting', () => {
    const result = draftInputSchema.safeParse({
      ...VALID_INPUT,
      scoringSettings: { ...VALID_INPUT.scoringSettings, passTD: NaN },
    });
    expect(result.success).toBe(false);
  });

  it('rejects a zero or negative passYdsPerPoint', () => {
    const result = draftInputSchema.safeParse({
      ...VALID_INPUT,
      scoringSettings: { ...VALID_INPUT.scoringSettings, passYdsPerPoint: 0 },
    });
    expect(result.success).toBe(false);
  });

  it(`rejects fewer than ${MIN_TEAMS} teams`, () => {
    const result = draftInputSchema.safeParse({
      ...VALID_INPUT,
      teams: [{ handle: 'solo', displayName: '', isMine: true }],
    });
    expect(result.success).toBe(false);
  });

  it(`rejects more than ${MAX_TEAMS} teams`, () => {
    const teams = Array.from({ length: MAX_TEAMS + 1 }, (_, i) => ({
      handle: `team${i}`,
      displayName: '',
      isMine: i === 0,
    }));
    expect(draftInputSchema.safeParse({ ...VALID_INPUT, teams }).success).toBe(false);
  });

  it('rejects team handles that collide case-insensitively', () => {
    const result = draftInputSchema.safeParse({
      ...VALID_INPUT,
      teams: [
        { handle: 'Cole', displayName: '', isMine: true },
        { handle: 'cole', displayName: '', isMine: false },
      ],
    });
    expect(result.success).toBe(false);
    expect(issueMessages(result)).toEqual(expect.arrayContaining(['Team handles must be unique.']));
  });

  it('rejects zero teams marked as mine', () => {
    const result = draftInputSchema.safeParse({
      ...VALID_INPUT,
      teams: VALID_INPUT.teams.map((t) => ({ ...t, isMine: false })),
    });
    expect(result.success).toBe(false);
  });

  it('rejects multiple teams marked as mine', () => {
    const result = draftInputSchema.safeParse({
      ...VALID_INPUT,
      teams: VALID_INPUT.teams.map((t) => ({ ...t, isMine: true })),
    });
    expect(result.success).toBe(false);
  });

  it('rejects an empty or over-length team handle', () => {
    expect(
      draftInputSchema.safeParse({
        ...VALID_INPUT,
        teams: [{ handle: '  ', displayName: '', isMine: true }, VALID_INPUT.teams[1]],
      }).success,
    ).toBe(false);
    expect(
      draftInputSchema.safeParse({
        ...VALID_INPUT,
        teams: [{ handle: 'x'.repeat(41), displayName: '', isMine: true }, VALID_INPUT.teams[1]],
      }).success,
    ).toBe(false);
  });

  it('rejects a non-positive or over-limit sleeperRosterId', () => {
    expect(
      draftInputSchema.safeParse({
        ...VALID_INPUT,
        teams: [{ ...VALID_INPUT.teams[0], sleeperRosterId: 0 }, VALID_INPUT.teams[1]],
      }).success,
    ).toBe(false);
    expect(
      draftInputSchema.safeParse({
        ...VALID_INPUT,
        teams: [{ ...VALID_INPUT.teams[0], sleeperRosterId: 1_000_001 }, VALID_INPUT.teams[1]],
      }).success,
    ).toBe(false);
  });

  it('rejects duplicate sleeperRosterId values among submitted teams', () => {
    const result = draftInputSchema.safeParse({
      ...VALID_INPUT,
      teams: [
        { ...VALID_INPUT.teams[0], sleeperRosterId: 1 },
        { ...VALID_INPUT.teams[1], sleeperRosterId: 1 },
      ],
    });
    expect(result.success).toBe(false);
  });

  it('accepts distinct sleeperRosterId values', () => {
    const result = draftInputSchema.safeParse({
      ...VALID_INPUT,
      teams: [
        { ...VALID_INPUT.teams[0], sleeperRosterId: 1 },
        { ...VALID_INPUT.teams[1], sleeperRosterId: 2 },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects a non-numeric sleeperLeagueId', () => {
    const result = draftInputSchema.safeParse({
      ...VALID_INPUT,
      sleeperLeagueId: 'not-a-league-id',
    });
    expect(result.success).toBe(false);
  });

  it('accepts a numeric sleeperLeagueId in range', () => {
    const result = draftInputSchema.safeParse({
      ...VALID_INPUT,
      sleeperLeagueId: '1360707683916734464',
    });
    expect(result.success).toBe(true);
  });

  it('trims name, handle, and displayName', () => {
    const result = draftInputSchema.safeParse({
      ...VALID_INPUT,
      name: "  Cole's Draft  ",
      teams: [
        { handle: '  coreschke  ', displayName: '  Cole  ', isMine: true },
        VALID_INPUT.teams[1],
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Cole's Draft");
      expect(result.data.teams[0].handle).toBe('coreschke');
      expect(result.data.teams[0].displayName).toBe('Cole');
    }
  });

  it('allows a blank displayName (falls back to handle downstream)', () => {
    const result = draftInputSchema.safeParse({
      ...VALID_INPUT,
      teams: [{ handle: 'coreschke', displayName: '', isMine: true }, VALID_INPUT.teams[1]],
    });
    expect(result.success).toBe(true);
  });

  it('accepts an omitted optional playerSource and sleeperLeagueId', () => {
    const {
      name,
      budgetPerTeam,
      rosterSize,
      futurePickAuctionMode,
      targetRoster,
      startingLineup,
      scoringSettings,
      teams,
    } = VALID_INPUT;
    expect(
      draftInputSchema.safeParse({
        name,
        budgetPerTeam,
        rosterSize,
        futurePickAuctionMode,
        targetRoster,
        startingLineup,
        scoringSettings,
        teams,
      }).success,
    ).toBe(true);
  });

  it('rejects an invalid playerSource value', () => {
    const result = draftInputSchema.safeParse({ ...VALID_INPUT, playerSource: 'bogus' });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid futurePickAuctionMode value', () => {
    const result = draftInputSchema.safeParse({
      ...VALID_INPUT,
      futurePickAuctionMode: 'bogus',
    });
    expect(result.success).toBe(false);
  });
});
