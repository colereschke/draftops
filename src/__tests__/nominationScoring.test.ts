import { computeNominationScores } from '@/lib/nominationScoring';
import type { Player, TeamStats, AuctionResultEntry } from '@/types';

const makePlayer = (overrides: Partial<Player> = {}): Player => ({
  id: 1000,
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
  pkgCount: 0,
  avgAge: null,
  ...overrides,
});

const makeResult = (overrides: Partial<AuctionResultEntry> = {}): AuctionResultEntry => ({
  id: 1,
  playerId: 1,
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
    const result = makeResult({ playerId: 1000, player: 'Already Won' });
    const scores = computeNominationScores(
      [player],
      [makeTeamStat()],
      [result],
      [],
      [],
      'coreschke',
      { QB: 4, RB: 9, WR: 11, TE: 3 },
    );
    expect(scores).toHaveLength(0);
  });

  it('only excludes the matching player ID when players share a display name', () => {
    const won = makePlayer({ id: 10, player: 'Shared Asset' });
    const available = makePlayer({ id: 11, player: 'Shared Asset', ceiling: 75 });
    const result = makeResult({ playerId: 10, player: 'Shared Asset' });

    const scores = computeNominationScores(
      [won, available],
      [makeTeamStat()],
      [result],
      [],
      [],
      'coreschke',
      { QB: 4, RB: 9, WR: 11, TE: 3 },
    );

    expect(scores).toHaveLength(1);
    expect(scores[0].player.id).toBe(11);
  });

  it('excludes watchlisted players', () => {
    const player = makePlayer({ player: 'Want Him' });
    const scores = computeNominationScores(
      [player],
      [makeTeamStat()],
      [],
      ['Want Him'],
      [],
      'coreschke',
      { QB: 4, RB: 9, WR: 11, TE: 3 },
    );
    expect(scores).toHaveLength(0);
  });

  it('excludes currently nominated (in-auction) players', () => {
    const player = makePlayer({ player: 'Live Right Now' });
    const scores = computeNominationScores(
      [player],
      [makeTeamStat()],
      [],
      [],
      ['Live Right Now'],
      'coreschke',
      { QB: 4, RB: 9, WR: 11, TE: 3 },
    );
    expect(scores).toHaveLength(0);
  });

  it('excludes PICK position from results (no positional need)', () => {
    const player = makePlayer({ player: 'Some Pick', pos: 'PICK', ceiling: 80 });
    const scores = computeNominationScores([player], [makeTeamStat()], [], [], [], 'coreschke', {
      QB: 4,
      RB: 9,
      WR: 11,
      TE: 3,
    });
    expect(scores).toHaveLength(0);
  });

  it('excludes PKG position from results (no positional need)', () => {
    const player = makePlayer({ player: 'Pick Package', pos: 'PKG', ceiling: 109 });
    const scores = computeNominationScores([player], [makeTeamStat()], [], [], [], 'coreschke', {
      QB: 4,
      RB: 9,
      WR: 11,
      TE: 3,
    });
    expect(scores).toHaveLength(0);
  });

  it('excludes player when only rival is myHandle (zero rival demand)', () => {
    const player = makePlayer({ player: 'Target', pos: 'WR' });
    const cole = makeTeamStat({ handle: 'coreschke', buyingPower: 900 });
    const scores = computeNominationScores([player], [cole], [], [], [], 'coreschke', {
      QB: 4,
      RB: 9,
      WR: 11,
      TE: 3,
    });
    expect(scores).toHaveLength(0);
  });

  it('excludes player when all rivals have non-positive buying power', () => {
    const player = makePlayer({ player: 'Target', pos: 'WR', ceiling: 50 });
    const broke = makeTeamStat({ handle: 'broke', buyingPower: 0 });
    const scores = computeNominationScores([player], [broke], [], [], [], 'coreschke', {
      QB: 4,
      RB: 9,
      WR: 11,
      TE: 3,
    });
    expect(scores).toHaveLength(0);
  });

  it('ranks higher ceiling player above lower ceiling player, all else equal', () => {
    const rival = makeTeamStat();
    const low = makePlayer({ player: 'Low Ceil', pos: 'WR', ceiling: 30 });
    const high = makePlayer({ player: 'High Ceil', pos: 'WR', ceiling: 80 });
    const scores = computeNominationScores([low, high], [rival], [], [], [], 'coreschke', {
      QB: 4,
      RB: 9,
      WR: 11,
      TE: 3,
    });
    expect(scores[0].player.player).toBe('High Ceil');
  });

  it('excludes player when all rivals have met position target (zero need)', () => {
    const player = makePlayer({ player: 'QB5', pos: 'QB', ceiling: 50 });
    const rival = makeTeamStat({ id: 2, handle: 'rival1' });
    const wonQBs = [1, 2, 3, 4].map((n) =>
      makeResult({ id: n, playerId: n, player: `QB${n}`, position: 'QB', teamId: 2 }),
    );
    const scores = computeNominationScores([player], [rival], wonQBs, [], [], 'coreschke', {
      QB: 4,
      RB: 9,
      WR: 11,
      TE: 3,
    });
    expect(scores).toHaveLength(0);
  });

  it('computes partial needRatio correctly when team has some players at position', () => {
    // QB target = 4; team has 2 → needRatio = (4-2)/4 = 0.5
    const player = makePlayer({ player: 'Target QB', pos: 'QB', ceiling: 100 });
    const rival = makeTeamStat({ id: 3, handle: 'rival1', buyingPower: 400 });
    const wonQBs = [1, 2].map((n) =>
      makeResult({ id: n, playerId: n, player: `QB${n}`, position: 'QB', teamId: 3 }),
    );
    const scores = computeNominationScores([player], [rival], wonQBs, [], [], 'coreschke', {
      QB: 4,
      RB: 9,
      WR: 11,
      TE: 3,
    });
    // rivalDemand = 400 × 0.5 = 200; nominationScore = 200 × 100 = 20000
    expect(scores[0].nominationScore).toBe(20000);
  });

  it('returns results sorted by nominationScore descending', () => {
    const rival = makeTeamStat({ buyingPower: 500 });
    const low = makePlayer({ player: 'Low', pos: 'WR', ceiling: 20 });
    const mid = makePlayer({ player: 'Mid', pos: 'WR', ceiling: 50 });
    const high = makePlayer({ player: 'High', pos: 'WR', ceiling: 80 });
    const scores = computeNominationScores([low, high, mid], [rival], [], [], [], 'coreschke', {
      QB: 4,
      RB: 9,
      WR: 11,
      TE: 3,
    });
    expect(scores.map((s) => s.player.player)).toEqual(['High', 'Mid', 'Low']);
  });

  it('computes rivalContributions percentages correctly', () => {
    const player = makePlayer({ player: 'Target', pos: 'WR' });
    const rival1 = makeTeamStat({ id: 1, handle: 'rival1', buyingPower: 300 });
    const rival2 = makeTeamStat({ id: 2, handle: 'rival2', buyingPower: 700 });
    const scores = computeNominationScores([player], [rival1, rival2], [], [], [], 'coreschke', {
      QB: 4,
      RB: 9,
      WR: 11,
      TE: 3,
    });
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
      makeResult({ id: n, playerId: n, player: `QB${n}`, position: 'QB', teamId: 2 }),
    );
    const scores = computeNominationScores(
      [player],
      [rival1, rival2],
      wonQBs,
      [],
      [],
      'coreschke',
      { QB: 4, RB: 9, WR: 11, TE: 3 },
    );
    const handles = scores[0].rivalContributions.map((c) => c.handle);
    expect(handles).not.toContain('rival2');
    expect(handles).toContain('rival1');
  });

  it('honors the provided targetRoster — a position with no target scores 0', () => {
    const te = makePlayer({ player: 'Star TE', pos: 'TE', sfRank: 10, ceiling: 60 });
    const wr = makePlayer({ player: 'Star WR', pos: 'WR', sfRank: 5, ceiling: 65 });
    // A rival with buying power and unmet need — TE would score if it had a target.
    const rival = makeTeamStat({ id: 2, handle: 'rival1', buyingPower: 500 });

    const scores = computeNominationScores([te, wr], [rival], [], [], [], 'me', {
      QB: 4,
      RB: 9,
      WR: 11,
    }); // no TE key → TE target is undefined → TE scores 0 and is filtered out

    expect(scores.some((s) => s.player.pos === 'WR')).toBe(true); // control: WR still scores
    expect(scores.some((s) => s.player.pos === 'TE')).toBe(false); // TE excluded
  });
});
