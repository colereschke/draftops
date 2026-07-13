import { players as ETR_PLAYERS } from '@/data/players';
import { normalizeName } from '@/lib/sleeperNormalize';
import type { Player, Position } from '@/types';

const SKILL_POSITIONS = new Set<Position>(['QB', 'RB', 'WR', 'TE']);

export const ETR_SKILL_PLAYERS: Player[] = ETR_PLAYERS.filter((p) => SKILL_POSITIONS.has(p.pos));

export function computeMissingFromEtr(uploadedNames: string[]): Player[] {
  const uploaded = new Set(uploadedNames.map(normalizeName));
  return ETR_SKILL_PLAYERS.filter((p) => !uploaded.has(normalizeName(p.player)));
}
