import { mapPlayersWithDraftValues } from '@/lib/playerValueMapping';

const PLAYER = {
  id: 10,
  name: 'Josh Allen',
  nflTeam: 'BUF',
  pos: 'QB',
  age: 30.1,
  sfRank: 1,
  budget: 120,
  ceiling: 138,
  floor: 104,
  notes: 'Elite dual-threat',
  sleeperId: '4984',
};

describe('mapPlayersWithDraftValues', () => {
  it('uses projection active values and derives floor and ceiling from the active target', () => {
    const [player] = mapPlayersWithDraftValues(
      [PLAYER],
      [
        {
          playerId: 10,
          projectedPoints: 410.5,
          replacementPoints: 260.1,
          vor: 150.4,
          projectionAuctionValue: 170,
          fallbackAuctionValue: 120,
          activeAuctionValue: 170,
          valueSource: 'projection_adjusted_market',
        },
      ],
    );

    expect(player.budget).toBe(170);
    expect(player.floor).toBe(148);
    expect(player.ceiling).toBe(196);
    expect(player.baseBudget).toBe(120);
    expect(player.projectionAuctionValue).toBe(170);
    expect(player.valueSource).toBe('projection_adjusted_market');
    expect(player.projectedPoints).toBe(410.5);
    expect(player.vor).toBe(150.4);
  });

  it('falls back to the player row when no draft value exists', () => {
    const [player] = mapPlayersWithDraftValues([PLAYER], []);

    expect(player.budget).toBe(120);
    expect(player.floor).toBe(104);
    expect(player.ceiling).toBe(138);
    expect(player.valueSource).toBe('fallback');
    expect(player.baseBudget).toBe(120);
  });

  it('keeps projection metadata when fallback remains the active value', () => {
    const [player] = mapPlayersWithDraftValues(
      [PLAYER],
      [
        {
          playerId: 10,
          projectedPoints: 410.5,
          replacementPoints: 260.1,
          vor: 150.4,
          projectionAuctionValue: 113,
          fallbackAuctionValue: 120,
          activeAuctionValue: 120,
          valueSource: 'fallback',
        },
      ],
    );

    expect(player.budget).toBe(120);
    expect(player.valueSource).toBe('fallback');
    expect(player.projectionAuctionValue).toBe(113);
    expect(player.projectedPoints).toBe(410.5);
    expect(player.vor).toBe(150.4);
  });
});
