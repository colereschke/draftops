import {
  FUTURE_PICK_AUCTION_MODES,
  filterFuturePickAssetsForMode,
  generateFuturePickAssets,
  isFuturePickAuctionMode,
} from '@/lib/futurePickAssets';
import type { FuturePickAuctionMode, Player } from '@/types';

const teams = [
  { handle: 'coreschke', displayName: 'Cole' },
  { handle: 'chappy72', displayName: 'Chappy' },
];

describe('future pick auction mode helpers', () => {
  it('accepts only supported future pick auction modes', () => {
    expect(FUTURE_PICK_AUCTION_MODES).toEqual(['packages', 'individual', 'none']);
    expect(isFuturePickAuctionMode('packages')).toBe(true);
    expect(isFuturePickAuctionMode('individual')).toBe(true);
    expect(isFuturePickAuctionMode('none')).toBe(true);
    expect(isFuturePickAuctionMode('package')).toBe(false);
    expect(isFuturePickAuctionMode(null)).toBe(false);
  });
});

describe('future pick asset generation', () => {
  it('creates one package and three component picks per origin team', () => {
    const assets = generateFuturePickAssets({ teams, year: 2027, startingRank: 900 });

    expect(assets).toHaveLength(8);
    expect(assets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          player: 'coreschke 2027 Pick Package',
          pos: 'PKG',
          team: 'coreschke',
          futurePickOriginHandle: 'coreschke',
          futurePickAssetKind: 'package',
          futurePickRound: null,
        }),
        expect.objectContaining({
          player: 'chappy72 2027 1st',
          pos: 'PICK',
          team: 'chappy72',
          futurePickOriginHandle: 'chappy72',
          futurePickAssetKind: 'pick',
          futurePickRound: 1,
        }),
      ]),
    );
  });

  it.each([
    ['packages', ['coreschke 2027 Pick Package', 'chappy72 2027 Pick Package']],
    [
      'individual',
      [
        'coreschke 2027 1st',
        'coreschke 2027 2nd',
        'coreschke 2027 3rd',
        'chappy72 2027 1st',
        'chappy72 2027 2nd',
        'chappy72 2027 3rd',
      ],
    ],
    ['none', []],
  ] satisfies Array<[FuturePickAuctionMode, string[]]>)(
    'filters visible future pick assets in %s mode',
    (mode, expectedNames) => {
      const basePlayer: Player = {
        player: 'JaMarr Chase',
        team: 'CIN',
        pos: 'WR',
        age: 26,
        sfRank: 1,
        budget: 250,
        ceiling: 288,
        floor: 218,
        notes: '',
      };
      const assets = generateFuturePickAssets({ teams, year: 2027, startingRank: 900 });

      const visible = filterFuturePickAssetsForMode([basePlayer, ...assets], mode);

      expect(visible.map((p) => p.player)).toEqual(['JaMarr Chase', ...expectedNames]);
    },
  );

  it.each([
    ['packages', ['JaMarr Chase', 'Legacy Pick Package']],
    ['individual', ['JaMarr Chase', 'Legacy 2027 1st']],
    ['none', ['JaMarr Chase']],
  ] satisfies Array<[FuturePickAuctionMode, string[]]>)(
    'treats untagged legacy PICK and PKG rows as future pick assets in %s mode',
    (mode, expectedNames) => {
      const basePlayer: Player = {
        player: 'JaMarr Chase',
        team: 'CIN',
        pos: 'WR',
        age: 26,
        sfRank: 1,
        budget: 250,
        ceiling: 288,
        floor: 218,
        notes: '',
      };
      const legacyPackage: Player = {
        player: 'Legacy Pick Package',
        team: 'coreschke',
        pos: 'PKG',
        age: null,
        sfRank: 900,
        budget: 109,
        ceiling: 131,
        floor: 75,
        notes: '',
      };
      const legacyPick: Player = {
        player: 'Legacy 2027 1st',
        team: 'coreschke',
        pos: 'PICK',
        age: null,
        sfRank: 901,
        budget: 75,
        ceiling: 90,
        floor: 52,
        notes: '',
      };

      const visible = filterFuturePickAssetsForMode([basePlayer, legacyPackage, legacyPick], mode);

      expect(visible.map((p) => p.player)).toEqual(expectedNames);
    },
  );
});
