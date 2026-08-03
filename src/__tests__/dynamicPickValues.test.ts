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
      futureCapitalByHandle: new Map(),
    });

    const weakPackage = adjusted.find((player) => player.player === 'weak 2027 Pick Package')!;
    expect(weakPackage.budget).toBeGreaterThan(109);
    expect(weakPackage.dynamicPickValue?.adjustment).toBe(weakPackage.budget - 109);
    expect(
      adjusted.find((player) => player.player === 'strong 2027 Pick Package')!.budget,
    ).toBeLessThan(109);
  });

  it('produces the same result with an explicit futureCapitalByHandle as the old internal accumulation did', () => {
    // Identical fixture to 'raises a weak origin team package...' above — both PKG rows are
    // budget: 109 with no trades, so the old internally-accumulated capital and the new explicit
    // map agree on the same number. Reusing that test's own (relative, not hardcoded) assertions
    // is the actual regression check: adding the required `futureCapitalByHandle` parameter must
    // not change this fixture's output at all when the map matches what accumulation would have
    // derived organically.
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
      futureCapitalByHandle: new Map([
        ['weak', 109],
        ['strong', 109],
      ]),
    });

    const weakPackage = adjusted.find((player) => player.player === 'weak 2027 Pick Package')!;
    expect(weakPackage.budget).toBeGreaterThan(109);
    expect(weakPackage.dynamicPickValue?.adjustment).toBe(weakPackage.budget - 109);
    expect(
      adjusted.find((player) => player.player === 'strong 2027 Pick Package')!.budget,
    ).toBeLessThan(109);
  });

  it('lowers a package holder’s valuation as its future capital shrinks toward zero', () => {
    // A maximal swing (full package capital down to none divested) rather than a partial one
    // (e.g. down to a two-round remainder) — the rebuild-signal weighting is small enough that a
    // partial swing can round to an identical dollar value depending on roster strength, which
    // would make this test pass or fail for the wrong reason. Going to zero avoids that ambiguity:
    // whatever the exact formula, more capital must never score lower than none.
    const players = [
      p({ player: 'Weak WR', budget: 100, projectedPoints: 40, vor: 2, age: 23 }),
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
    ];
    const bids = [bid('Weak WR', 'weak', 100)];

    const withFullCapital = applyDynamicPickValues({
      players,
      bids,
      startingLineup: lineup,
      futureCapitalByHandle: new Map([['weak', 109]]),
    });
    const withNoCapital = applyDynamicPickValues({
      players,
      bids,
      startingLineup: lineup,
      futureCapitalByHandle: new Map(), // fully divested — no entry for 'weak' at all
    });

    const withFullCapitalBudget = withFullCapital.find(
      (player) => player.player === 'weak 2028 Pick Package',
    )!.budget;
    const withNoCapitalBudget = withNoCapital.find(
      (player) => player.player === 'weak 2028 Pick Package',
    )!.budget;
    expect(withNoCapitalBudget).toBeLessThan(withFullCapitalBudget);
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

    const [pkg] = applyDynamicPickValues({
      players,
      bids: [],
      startingLineup: lineup,
      futureCapitalByHandle: new Map(),
    });

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
      futureCapitalByHandle: new Map(),
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
      // Not `new Map()` like the other pre-trading call sites: this test's `'extra pick'` bid
      // exists specifically so the old accumulation path gave `'weak'` exactly 75 of capital
      // (a PICK row with budget 75 and no baseBudget), which is what makes its +1 assertion
      // hold. Passing the equivalent value explicitly preserves the test's meaning under the
      // snapshot model instead of silently zeroing the signal it claims to exercise.
      futureCapitalByHandle: new Map([['weak', 75]]),
    });

    expect(adjusted.find((player) => player.player === 'weak 2028 Pick Package')!.budget).toBe(
      adjusted.find((player) => player.player === 'other weak 2028 Pick Package')!.budget + 1,
    );
  });

  it('uses active auction value for the value-over-expectation signal', () => {
    const players = [
      p({
        player: 'Adjusted QB',
        pos: 'QB',
        budget: 200,
        baseBudget: 100,
        projectedPoints: 120,
        vor: 20,
        age: 25,
      }),
      p({
        player: "origin's 2027 package",
        pos: 'PKG',
        team: 'origin',
        budget: 109,
        ceiling: 131,
        floor: 75,
        futurePickOriginHandle: 'origin',
        futurePickAssetKind: 'package',
        futurePickYear: 2027,
      }),
    ];

    const adjusted = applyDynamicPickValues({
      players,
      bids: [bid('Adjusted QB', 'origin', 120)],
      startingLineup: lineup,
      futureCapitalByHandle: new Map(),
    });

    expect(
      adjusted.find((player) => player.player === "origin's 2027 package")!.budget,
    ).toBeLessThan(109);
  });

  it('meaningfully raises an origin package when the team exhausts budget at a large overpay', () => {
    const players = [
      p({
        player: 'Patrick Mahomes',
        pos: 'QB',
        budget: 100,
        projectedPoints: 330,
        vor: 90,
        age: 30,
      }),
      p({ player: 'Spencer Rattler', pos: 'QB', budget: 5, projectedPoints: 0, vor: 0, age: 25 }),
      p({ player: 'Marcus Mariota', pos: 'QB', budget: 5, projectedPoints: 0, vor: 0, age: 32 }),
      p({
        player: 'Jonathan Taylor',
        pos: 'RB',
        budget: 120,
        projectedPoints: 230,
        vor: 55,
        age: 27,
      }),
      p({ player: 'Malik Davis', pos: 'RB', budget: 5, projectedPoints: 0, vor: 0, age: 27 }),
      p({ player: 'Brashard Smith', pos: 'RB', budget: 5, projectedPoints: 0, vor: 0, age: 23 }),
      p({
        player: 'George Pickens',
        budget: 125,
        projectedPoints: 220,
        vor: 50,
        age: 25,
      }),
      p({ player: 'Stefon Diggs', budget: 20, projectedPoints: 90, vor: 5, age: 32 }),
      p({
        player: 'Trey McBride',
        pos: 'TE',
        budget: 195,
        projectedPoints: 240,
        vor: 70,
        age: 26,
      }),
      p({ player: 'Dalton Schultz', pos: 'TE', budget: 6, projectedPoints: 0, vor: 0, age: 30 }),
      p({ player: 'Michael Mayer', pos: 'TE', budget: 6, projectedPoints: 0, vor: 0, age: 25 }),
      p({ player: 'Ben Sinnott', pos: 'TE', budget: 6, projectedPoints: 0, vor: 0, age: 24 }),
      p({
        player: "overpay-team's 2027 package",
        pos: 'PKG',
        team: 'overpay-team',
        budget: 109,
        ceiling: 131,
        floor: 75,
        futurePickOriginHandle: 'overpay-team',
        futurePickAssetKind: 'package',
        futurePickYear: 2027,
      }),
    ];

    const adjusted = applyDynamicPickValues({
      players,
      bids: [
        bid('Patrick Mahomes', 'overpay-team', 200),
        bid('Spencer Rattler', 'overpay-team', 1),
        bid('Marcus Mariota', 'overpay-team', 1),
        bid('Jonathan Taylor', 'overpay-team', 200),
        bid('Malik Davis', 'overpay-team', 1),
        bid('Brashard Smith', 'overpay-team', 1),
        bid('George Pickens', 'overpay-team', 250),
        bid('Stefon Diggs', 'overpay-team', 18),
        bid('Trey McBride', 'overpay-team', 325),
        bid('Dalton Schultz', 'overpay-team', 1),
        bid('Michael Mayer', 'overpay-team', 1),
        bid('Ben Sinnott', 'overpay-team', 1),
      ],
      startingLineup: lineup,
      futureCapitalByHandle: new Map(),
    });

    expect(adjusted.find((player) => player.player === "overpay-team's 2027 package")!.budget).toBe(
      119,
    );
  });

  it('centers common overpay once enough origin teams have market data', () => {
    const origins = ['alpha', 'bravo', 'charlie', 'delta'];
    const players = origins.flatMap((origin, index) => [
      p({
        player: `${origin} QB`,
        pos: 'QB',
        budget: 600,
        projectedPoints: 800 - index,
        vor: 200 - index,
        age: 25,
      }),
      p({
        player: `${origin} 2027 package`,
        pos: 'PKG',
        team: origin,
        budget: 109,
        ceiling: 131,
        floor: 75,
        futurePickOriginHandle: origin,
        futurePickAssetKind: 'package' as const,
        futurePickYear: 2027,
      }),
    ]);

    const adjusted = applyDynamicPickValues({
      players,
      bids: origins.map((origin) => bid(`${origin} QB`, origin, 1000)),
      startingLineup: lineup,
      futureCapitalByHandle: new Map(),
    });

    for (const origin of origins) {
      expect(adjusted.find((player) => player.player === `${origin} 2027 package`)!.budget).toBe(
        98,
      );
    }
  });
});
