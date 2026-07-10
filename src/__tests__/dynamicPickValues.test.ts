import { applyDynamicPickValues } from '@/lib/dynamicPickValues';
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

const bid = (player: string, teamHandle: string, price: number) => ({ player, teamHandle, price });

describe('applyDynamicPickValues', () => {
  it('raises a weak origin team package and lowers a strong origin team package', () => {
    const players = [
      p({ player: 'Weak WR', budget: 100, projectedPoints: 40, vor: 2, age: 31 }),
      p({
        player: 'weak 2027 Pick Package',
        pos: 'PKG',
        team: 'weak',
        budget: 109,
        ceiling: 131,
        floor: 75,
        futurePickOriginHandle: 'weak',
        futurePickAssetKind: 'package',
        futurePickYear: 2027,
      }),
      p({ player: 'Strong QB', pos: 'QB', budget: 100, projectedPoints: 300, vor: 80, age: 24 }),
      p({ player: 'Strong WR', budget: 100, projectedPoints: 260, vor: 70, age: 25 }),
      p({
        player: 'strong 2027 Pick Package',
        pos: 'PKG',
        team: 'strong',
        budget: 109,
        ceiling: 131,
        floor: 75,
        futurePickOriginHandle: 'strong',
        futurePickAssetKind: 'package',
        futurePickYear: 2027,
      }),
    ];

    const adjusted = applyDynamicPickValues({
      players,
      bids: [
        bid('Weak WR', 'weak', 150),
        bid('Strong QB', 'strong', 60),
        bid('Strong WR', 'strong', 70),
      ],
      startingLineup: lineup,
    });

    expect(
      adjusted.find((player) => player.player === 'weak 2027 Pick Package')!.budget,
    ).toBeGreaterThan(109);
    expect(
      adjusted.find((player) => player.player === 'strong 2027 Pick Package')!.budget,
    ).toBeLessThan(109);
  });

  it('does not adjust future pick rows without enough origin-team data', () => {
    const players = [
      p({
        player: 'thin 2027 Pick Package',
        pos: 'PKG',
        team: 'thin',
        budget: 109,
        ceiling: 131,
        floor: 75,
        futurePickOriginHandle: 'thin',
        futurePickAssetKind: 'package',
        futurePickYear: 2027,
      }),
    ];

    const [pkg] = applyDynamicPickValues({ players, bids: [], startingLineup: lineup });

    expect(pkg.budget).toBe(109);
    expect(pkg.dynamicPickValue?.direction).toBe('flat');
  });
});
