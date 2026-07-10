import {
  buildDraftPlayerValueData,
  getSleeperIdUpdates,
  resolvePlayerSleeperIds,
  type CsvProjectionRow,
  groupProjectionRowsBySource,
  joinPlayersToProjectionRows,
  parseProjectionRows,
} from '../../prisma/apply-projection-values';

function projectionRow(overrides: Partial<CsvProjectionRow>): CsvProjectionRow {
  return {
    sleeperId: '10',
    position: 'QB',
    games: 17,
    passAtt: 0,
    passCmp: 0,
    passYds: 0,
    passTd: 0,
    passInt: 0,
    passSacks: 0,
    rushAtt: 0,
    rushYds: 0,
    rushTd: 0,
    targets: 0,
    receptions: 0,
    recYds: 0,
    recTd: 0,
    baseFantasyPoints: 0,
    projectionRank: null,
    projectedPoints: 0,
    baselineProjectedPoints: 0,
    isRookie: false,
    projectionSource: 'mike_clay',
    projectionDate: new Date('2026-06-01T00:00:00.000Z'),
    projectionSeason: 2026,
    ...overrides,
  };
}

it('joins players to projection rows by sleeperId', () => {
  const joined = joinPlayersToProjectionRows(
    [{ id: 1, name: 'A', pos: 'QB', sleeperId: '10', budget: 20 }],
    [
      {
        sleeperId: '10',
        position: 'QB',
        projectedPoints: 300,
        baselineProjectedPoints: 280,
        isRookie: false,
      },
    ],
  );

  expect(joined).toEqual([
    {
      playerId: 1,
      sleeperId: '10',
      position: 'QB',
      projectedPoints: 300,
      baselineProjectedPoints: 280,
      fallbackAuctionValue: 20,
      isRookie: false,
    },
  ]);
});

it('only updates player sleeper IDs when the resolved ID changed', () => {
  const players = resolvePlayerSleeperIds(
    [
      { id: 1, name: 'Already Set', pos: 'QB', sleeperId: '10', budget: 20 },
      { id: 2, name: 'Needs ID', pos: 'RB', sleeperId: null, budget: 15 },
      { id: 3, name: 'Still Missing', pos: 'WR', sleeperId: null, budget: 10 },
    ],
    new Map([['Needs ID', '20']]),
  );

  expect(players).toEqual([
    {
      id: 1,
      name: 'Already Set',
      pos: 'QB',
      sleeperId: '10',
      budget: 20,
      shouldUpdateSleeperId: false,
    },
    {
      id: 2,
      name: 'Needs ID',
      pos: 'RB',
      sleeperId: '20',
      budget: 15,
      shouldUpdateSleeperId: true,
    },
    {
      id: 3,
      name: 'Still Missing',
      pos: 'WR',
      sleeperId: null,
      budget: 10,
      shouldUpdateSleeperId: false,
    },
  ]);

  expect(getSleeperIdUpdates(players)).toEqual([{ id: 2, sleeperId: '20' }]);
});

it('groups projection rows by source metadata', () => {
  const projectionDate = new Date('2026-06-01T00:00:00.000Z');
  const grouped = groupProjectionRowsBySource([
    projectionRow({
      sleeperId: '10',
      position: 'QB',
      projectedPoints: 300,
      baselineProjectedPoints: 300,
      isRookie: false,
      projectionSource: 'mike_clay',
      projectionDate,
      projectionSeason: 2026,
    }),
    projectionRow({
      sleeperId: '11',
      position: 'RB',
      projectedPoints: 200,
      baselineProjectedPoints: 200,
      isRookie: true,
      projectionSource: 'mike_clay',
      projectionDate,
      projectionSeason: 2026,
    }),
  ]);

  expect(grouped).toEqual([
    {
      source: {
        name: 'mike_clay',
        season: 2026,
        projectionDate,
      },
      rows: [
        projectionRow({
          sleeperId: '10',
          position: 'QB',
          projectedPoints: 300,
          baselineProjectedPoints: 300,
          isRookie: false,
          projectionSource: 'mike_clay',
          projectionDate,
          projectionSeason: 2026,
        }),
        projectionRow({
          sleeperId: '11',
          position: 'RB',
          projectedPoints: 200,
          baselineProjectedPoints: 200,
          isRookie: true,
          projectionSource: 'mike_clay',
          projectionDate,
          projectionSeason: 2026,
        }),
      ],
    },
  ]);
});

it('parses projection rows with both draft and baseline scoring points', () => {
  const rows = parseProjectionRows(
    [
      'sleeper_id,position,games,pass_att,pass_cmp,pass_yds,pass_td,pass_int,pass_sacks,rush_att,rush_yds,rush_td,targets,receptions,rec_yds,rec_td,base_fantasy_points,projection_rank,years_exp,projection_source,projection_date,season',
      '10,TE,17,0,0,0,0,0,0,0,0,0,120,90,1000,8,0,1,8,mike_clay,2026-06-01,2026',
    ].join('\n'),
    {
      passYdsPerPoint: 25,
      passTD: 4,
      passInt: -2,
      rushAtt: 0,
      rushFD: 0,
      pprRB: 1,
      pprWR: 1,
      pprTE: 2,
      recFD: 0,
      rbFDBonus: 0,
      wrFDBonus: 0,
      teFDBonus: 0,
    },
  );

  expect(rows[0].projectedPoints).toBeGreaterThan(rows[0].baselineProjectedPoints);
  expect(rows[0].baselineProjectedPoints).toBeGreaterThan(0);
});

it('builds draft value data with projection-adjusted market values active', () => {
  const data = buildDraftPlayerValueData(
    {
      playerId: 1,
      sleeperId: 'high-volume-te',
      position: 'TE',
      projectedPoints: 250,
      baselineProjectedPoints: 200,
      fallbackAuctionValue: 100,
      isRookie: false,
    },
    {
      replacementPoints: 180,
      vor: 70,
      projectionAuctionValue: 160,
    },
    {
      sleeperId: 'high-volume-te',
      name: '1',
      position: 'TE',
      projectedPoints: 250,
      baselineProjectedPoints: 200,
      fallbackAuctionValue: 100,
      isRookie: false,
      activeAuctionValue: 118,
      rawScoringLift: 1.25,
      relativeScoringLift: 1.23,
      projectionMarketMultiplier: 1.18,
      marketBucket: 'elite',
      valueSource: 'projection_adjusted_market',
    },
  );

  expect(data).toEqual({
    projectedPoints: 250,
    replacementPoints: 180,
    vor: 70,
    projectionAuctionValue: 160,
    fallbackAuctionValue: 100,
    activeAuctionValue: 118,
    valueSource: 'projection_adjusted_market',
  });
});
