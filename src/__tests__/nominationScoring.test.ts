import { computeNominationScores } from '@/lib/nominationScoring';
import type { Player, TeamStats, AuctionResultEntry } from '@/types';

const makePlayer = (overrides: Partial<Player> = {}): Player => ({
  player: 'Test Player',
  team: 'TST',
  pos: 'WR',
  age: 25,
  sfRank: 50,
  budget: 50,
  ceiling: 58,
  floor: 44,
  notes: '',
  ...overrides,
});

const makeTeamStat = (overrides: Partial<TeamStats> = {}): TeamStats => ({
  id: 1,
  handle: 'rival1',
  displayName: null,
  budget: 1000,
  spent: 0,
  remaining: 1000,
  rosterCount: 0,
  rosterRemaining: 30,
  buyingPower: 970,
  ...overrides,
});

const makeResult = (overrides: Partial<AuctionResultEntry> = {}): AuctionResultEntry => ({
  id: 1,
  player: 'Won Player',
  position: 'WR',
  nflTeam: 'TST',
  price: 50,
  sfRank: null,
  teamId: 1,
  teamHandle: 'rival1',
  createdAt: new Date(),
  ...overrides,
});

describe('computeNominationScores', () => {
  it('excludes players already won at auction', () => {
    const player = makePlayer({ player: 'Already Won' });
    const result = makeResult({ player: 'Already Won' });
    const scores = computeNominationScores([player], [makeTeamStat()], [result], [], 'coreschke');
    expect(scores).toHaveLength(0);
  });

  it('excludes watchlisted players', () => {
    const player = makePlayer({ player: 'Want Him' });
    const scores = computeNominationScores(
      [player],
      [makeTeamStat()],
      [],
      ['Want Him'],
      'coreschke',
    );
    expect(scores).toHaveLength(0);
  });

  it('scores PICK position as 0', () => {
    const player = makePlayer({ player: 'Some Pick', pos: 'PICK', ceiling: 80 });
    const scores = computeNominationScores([player], [makeTeamStat()], [], [], 'coreschke');
    expect(scores[0].nominationScore).toBe(0);
  });

  it('scores PKG position as 0', () => {
    const player = makePlayer({ player: 'Pick Package', pos: 'PKG', ceiling: 109 });
    const scores = computeNominationScores([player], [makeTeamStat()], [], [], 'coreschke');
    expect(scores[0].nominationScore).toBe(0);
  });

  it('excludes myHandle team from rival demand', () => {
    const player = makePlayer({ player: 'Target', pos: 'WR' });
    const cole = makeTeamStat({ handle: 'coreschke', buyingPower: 900 });
    const scores = computeNominationScores([player], [cole], [], [], 'coreschke');
    expect(scores[0].nominationScore).toBe(0);
  });

  it('excludes teams with non-positive buying power', () => {
    const player = makePlayer({ player: 'Target', pos: 'WR', ceiling: 50 });
    const broke = makeTeamStat({ handle: 'broke', buyingPower: 0 });
    const scores = computeNominationScores([player], [broke], [], [], 'coreschke');
    expect(scores[0].nominationScore).toBe(0);
  });

  it('ranks higher ceiling player above lower ceiling player, all else equal', () => {
    const rival = makeTeamStat();
    const low = makePlayer({ player: 'Low Ceil', pos: 'WR', ceiling: 30 });
    const high = makePlayer({ player: 'High Ceil', pos: 'WR', ceiling: 80 });
    const scores = computeNominationScores([low, high], [rival], [], [], 'coreschke');
    expect(scores[0].player.player).toBe('High Ceil');
  });

  it('gives zero needRatio when team has met QB position target (4)', () => {
    const player = makePlayer({ player: 'QB5', pos: 'QB', ceiling: 50 });
    const rival = makeTeamStat({ id: 2, handle: 'rival1' });
    const wonQBs = [1, 2, 3, 4].map((n) =>
      makeResult({ id: n, player: `QB${n}`, position: 'QB', teamId: 2 }),
    );
    const scores = computeNominationScores([player], [rival], wonQBs, [], 'coreschke');
    expect(scores[0].nominationScore).toBe(0);
  });

  it('computes partial needRatio correctly when team has some players at position', () => {
    // QB target = 4; team has 2 → needRatio = (4-2)/4 = 0.5
    const player = makePlayer({ player: 'Target QB', pos: 'QB', ceiling: 100 });
    const rival = makeTeamStat({ id: 3, handle: 'rival1', buyingPower: 400 });
    const wonQBs = [1, 2].map((n) =>
      makeResult({ id: n, player: `QB${n}`, position: 'QB', teamId: 3 }),
    );
    const scores = computeNominationScores([player], [rival], wonQBs, [], 'coreschke');
    // rivalDemand = 400 × 0.5 = 200; nominationScore = 200 × 100 = 20000
    expect(scores[0].nominationScore).toBe(20000);
  });

  it('returns results sorted by nominationScore descending', () => {
    const rival = makeTeamStat({ buyingPower: 500 });
    const low = makePlayer({ player: 'Low', pos: 'WR', ceiling: 20 });
    const mid = makePlayer({ player: 'Mid', pos: 'WR', ceiling: 50 });
    const high = makePlayer({ player: 'High', pos: 'WR', ceiling: 80 });
    const scores = computeNominationScores([low, high, mid], [rival], [], [], 'coreschke');
    expect(scores.map((s) => s.player.player)).toEqual(['High', 'Mid', 'Low']);
  });

  it('computes rivalContributions percentages correctly', () => {
    const player = makePlayer({ player: 'Target', pos: 'WR' });
    const rival1 = makeTeamStat({ id: 1, handle: 'rival1', buyingPower: 300 });
    const rival2 = makeTeamStat({ id: 2, handle: 'rival2', buyingPower: 700 });
    const scores = computeNominationScores([player], [rival1, rival2], [], [], 'coreschke');
    const contribs = scores[0].rivalContributions;
    const r2 = contribs.find((c) => c.handle === 'rival2');
    expect(r2?.pct).toBeCloseTo(70, 0);
  });

  it('filters rivalContributions to only teams that contribute > 0', () => {
    const player = makePlayer({ player: 'Target', pos: 'QB', ceiling: 50 });
    const rival1 = makeTeamStat({ id: 1, handle: 'rival1', buyingPower: 400 });
    // rival2 has met QB target — contributes 0
    const rival2 = makeTeamStat({ id: 2, handle: 'rival2', buyingPower: 500 });
    const wonQBs = [1, 2, 3, 4].map((n) =>
      makeResult({ id: n, player: `QB${n}`, position: 'QB', teamId: 2 }),
    );
    const scores = computeNominationScores([player], [rival1, rival2], wonQBs, [], 'coreschke');
    const handles = scores[0].rivalContributions.map((c) => c.handle);
    expect(handles).not.toContain('rival2');
    expect(handles).toContain('rival1');
  });
});
