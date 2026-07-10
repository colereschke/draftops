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

    const weakPackage = adjusted.find((player) => player.player === 'weak 2027 Pick Package')!;
    expect(weakPackage.budget).toBeGreaterThan(109);
    expect(weakPackage.dynamicPickValue?.adjustment).toBe(weakPackage.budget - 109);
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

  it('keeps rounded adjustments inside the final cap', () => {
    const players = [
      p({ player: 'Overpay WR', budget: 1, projectedPoints: 0, vor: 0, age: 31 }),
      p({
        player: 'overpay 2028 Pick Package',
        pos: 'PKG',
        team: 'overpay',
        budget: 72,
        ceiling: 86,
        floor: 50,
        futurePickOriginHandle: 'overpay',
        futurePickAssetKind: 'package',
        futurePickYear: 2028,
      }),
      p({
        player: 'Discount QB',
        pos: 'QB',
        budget: 1000,
        projectedPoints: 800,
        vor: 200,
        age: 24,
      }),
      p({
        player: 'discount 2028 Pick Package',
        pos: 'PKG',
        team: 'discount',
        budget: 72,
        ceiling: 86,
        floor: 50,
        futurePickOriginHandle: 'discount',
        futurePickAssetKind: 'package',
        futurePickYear: 2028,
      }),
    ];

    const adjusted = applyDynamicPickValues({
      players,
      bids: [bid('Overpay WR', 'overpay', 1000), bid('Discount QB', 'discount', 1)],
      startingLineup: lineup,
    });

    expect(adjusted.find((player) => player.player === 'overpay 2028 Pick Package')!.budget).toBe(
      Math.floor(72 * 1.15),
    );
    expect(adjusted.find((player) => player.player === 'discount 2028 Pick Package')!.budget).toBe(
      Math.ceil(72 * 0.85),
    );
  });

  it('treats future capital as a rebuild amplifier only when the roster is weak', () => {
    const players = [
      p({ player: 'Weak WR', budget: 100, projectedPoints: 40, vor: 2, age: 23 }),
      p({
        player: 'extra pick',
        pos: 'PICK',
        budget: 75,
        ceiling: 90,
        floor: 52,
      }),
      p({
        player: 'weak 2028 Pick Package',
        pos: 'PKG',
        team: 'weak',
        budget: 109,
        ceiling: 131,
        floor: 75,
        futurePickOriginHandle: 'weak',
        futurePickAssetKind: 'package',
        futurePickYear: 2028,
      }),
      p({ player: 'Other Weak WR', budget: 100, projectedPoints: 40, vor: 2, age: 23 }),
      p({
        player: 'other weak 2028 Pick Package',
        pos: 'PKG',
        team: 'other-weak',
        budget: 109,
        ceiling: 131,
        floor: 75,
        futurePickOriginHandle: 'other-weak',
        futurePickAssetKind: 'package',
        futurePickYear: 2028,
      }),
    ];

    const adjusted = applyDynamicPickValues({
      players,
      bids: [
        bid('Weak WR', 'weak', 100),
        bid('extra pick', 'weak', 1),
        bid('Other Weak WR', 'other-weak', 100),
      ],
      startingLineup: lineup,
    });

    expect(adjusted.find((player) => player.player === 'weak 2028 Pick Package')!.budget).toBe(
      adjusted.find((player) => player.player === 'other weak 2028 Pick Package')!.budget + 1,
    );
  });
});
