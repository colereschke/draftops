import { getCustomPlayerKey } from '@/lib/playerIdentity';
import type { Player } from '@/types';

const BASE_PLAYER: Player = {
  player: 'Josh Allen',
  team: 'BUF',
  pos: 'QB',
  age: 30.1,
  sfRank: 2,
  budget: 255,
  ceiling: 293,
  floor: 222,
  notes: '',
  sleeperId: '4984',
};

describe('getCustomPlayerKey', () => {
  it('returns null for real Sleeper players', () => {
    expect(getCustomPlayerKey(BASE_PLAYER, 0)).toBeNull();
  });

  it('uses seed order for current 2027 package assets', () => {
    expect(
      getCustomPlayerKey(
        {
          ...BASE_PLAYER,
          player: 'Matt Gay',
          team: 'coreschke',
          pos: 'PKG',
          sleeperId: null,
          futurePickYear: 2027,
          futurePickRound: null,
          futurePickOriginHandle: 'coreschke',
          futurePickAssetKind: 'package',
        },
        7,
      ),
    ).toBe('pkg:2027:slot:08');
  });

  it('uses asset keys for generic future packages and picks', () => {
    expect(
      getCustomPlayerKey(
        {
          ...BASE_PLAYER,
          player: '2028 Pick Package',
          team: 'NFL',
          pos: 'PKG',
          sleeperId: null,
          futurePickYear: 2028,
          futurePickRound: null,
          futurePickOriginHandle: 'NFL',
          futurePickAssetKind: 'package',
        },
        12,
      ),
    ).toBe('pkg:2028:bundle');

    expect(
      getCustomPlayerKey(
        {
          ...BASE_PLAYER,
          player: '2028 2nd Round Pick',
          team: 'NFL',
          pos: 'PICK',
          sleeperId: null,
          futurePickYear: 2028,
          futurePickRound: 2,
          futurePickOriginHandle: 'NFL',
          futurePickAssetKind: 'pick',
        },
        13,
      ),
    ).toBe('pick:2028:round:2');
  });
});
