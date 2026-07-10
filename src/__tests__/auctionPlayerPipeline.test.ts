import { applyDynamicPickValues } from '@/lib/dynamicPickValues';
import { filterFuturePickAssetsForMode } from '@/lib/futurePickAssets';
import type { Player, StartingSlot } from '@/types';

const lineup: StartingSlot[] = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'SUPER_FLEX'];

const p = (overrides: Partial<Player>): Player => ({
  player: 'Player',
  team: 'NFL',
  pos: 'WR',
  age: 25,
  sfRank: 1,
  budget: 100,
  ceiling: 115,
  floor: 87,
  notes: '',
  projectedPoints: 100,
  vor: 20,
  ...overrides,
});

describe('auction player pipeline', () => {
  it('applies dynamic values before filtering hidden future pick assets', () => {
    const players = [
      p({ player: 'Origin QB', team: 'origin', pos: 'QB', projectedPoints: 250, vor: 70 }),
      p({
        player: "origin's 2027 package",
        pos: 'PKG',
        team: 'origin',
        futurePickOriginHandle: 'origin',
        futurePickAssetKind: 'package',
        budget: 109,
      }),
      p({
        player: 'origin 2027 1st',
        pos: 'PICK',
        team: 'origin',
        futurePickOriginHandle: 'origin',
        futurePickAssetKind: 'pick',
        futurePickRound: 1,
        budget: 75,
      }),
    ];

    const adjusted = applyDynamicPickValues({
      players,
      bids: [{ player: 'Origin QB', teamHandle: 'origin', price: 80 }],
      startingLineup: lineup,
    });

    const visible = filterFuturePickAssetsForMode(adjusted, 'packages');

    expect(visible.map((player) => player.player)).toEqual(['Origin QB', "origin's 2027 package"]);
    expect(visible.find((player) => player.player === "origin's 2027 package")).toMatchObject({
      dynamicPickValue: expect.objectContaining({ direction: 'down' }),
    });
  });
});
