import type { Player } from '@/types';

type IdentityPlayer = Pick<
  Player,
  | 'player'
  | 'team'
  | 'pos'
  | 'sleeperId'
  | 'futurePickYear'
  | 'futurePickRound'
  | 'futurePickOriginHandle'
  | 'futurePickAssetKind'
>;

export function getCustomPlayerKey(player: IdentityPlayer, index: number): string | null {
  if (player.sleeperId) return null;

  if (player.futurePickAssetKind === 'package' && player.futurePickYear === 2027) {
    return `pkg:2027:slot:${String(index + 1).padStart(2, '0')}`;
  }

  if (player.futurePickAssetKind === 'package' && player.futurePickYear === 2028) {
    return 'pkg:2028:bundle';
  }

  if (
    player.futurePickAssetKind === 'pick' &&
    player.futurePickYear === 2028 &&
    player.futurePickRound !== null &&
    player.futurePickRound !== undefined
  ) {
    return `pick:2028:round:${player.futurePickRound}`;
  }

  return null;
}
