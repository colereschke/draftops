import { joinPlayersToProjectionRows } from '../../prisma/apply-projection-values';

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
