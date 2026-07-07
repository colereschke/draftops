import {
  type CsvProjectionRow,
  groupProjectionRowsBySource,
  joinPlayersToProjectionRows,
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
    [{ sleeperId: '10', position: 'QB', projectedPoints: 300, isRookie: false }],
  );

  expect(joined).toEqual([
    {
      playerId: 1,
      sleeperId: '10',
      position: 'QB',
      projectedPoints: 300,
      fallbackAuctionValue: 20,
      isRookie: false,
    },
  ]);
});

it('groups projection rows by source metadata', () => {
  const projectionDate = new Date('2026-06-01T00:00:00.000Z');
  const grouped = groupProjectionRowsBySource([
    projectionRow({
      sleeperId: '10',
      position: 'QB',
      projectedPoints: 300,
      isRookie: false,
      projectionSource: 'mike_clay',
      projectionDate,
      projectionSeason: 2026,
    }),
    projectionRow({
      sleeperId: '11',
      position: 'RB',
      projectedPoints: 200,
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
          isRookie: false,
          projectionSource: 'mike_clay',
          projectionDate,
          projectionSeason: 2026,
        }),
        projectionRow({
          sleeperId: '11',
          position: 'RB',
          projectedPoints: 200,
          isRookie: true,
          projectionSource: 'mike_clay',
          projectionDate,
          projectionSeason: 2026,
        }),
      ],
    },
  ]);
});
