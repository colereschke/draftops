import type { AppetitePos } from './tendencies.constants';
import { APPETITE_POSITIONS } from './tendencies.constants';

// Single source for "which positions the threat board tracks", derived from the
// tendency engine's position list so the two never drift.
const APPETITE_SET = new Set<string>(APPETITE_POSITIONS);

export interface LiveNomination {
  position: AppetitePos;
  name: string;
}

/**
 * Resolve the position the threat board should anchor to from the currently
 * nominated players. The board tracks one appetite position at a time, but
 * several players can be nominated at once, so we pick the position with the
 * most live nominations and break ties toward the most recently nominated.
 * `name` is the winning position's most recent nominee.
 *
 * `nominated` MUST be ordered most-recent-first (createdAt desc); PICK/PKG and
 * any player missing from `posByName` are ignored.
 */
export function resolveLiveNomination(
  nominated: { playerId?: number | null; playerName: string }[],
  posByName: Map<string, string>,
  posByPlayerId = new Map<number, string>(),
): LiveNomination | null {
  const counts = new Map<AppetitePos, number>();
  const recentName = new Map<AppetitePos, string>();

  for (const n of nominated) {
    const pos = resolveNominationPosition(n, posByName, posByPlayerId);
    if (!pos || !APPETITE_SET.has(pos)) continue;
    const ap = pos as AppetitePos;
    counts.set(ap, (counts.get(ap) ?? 0) + 1);
    // Desc order ⇒ the first row seen for a position is its most recent nominee.
    if (!recentName.has(ap)) recentName.set(ap, n.playerName);
  }

  let best: AppetitePos | null = null;
  let bestCount = 0;
  // Walk in recency order and only replace on a strictly higher count, so equal
  // counts resolve to the position encountered first — the most recent nomination.
  for (const n of nominated) {
    const pos = resolveNominationPosition(n, posByName, posByPlayerId);
    if (!pos || !APPETITE_SET.has(pos)) continue;
    const ap = pos as AppetitePos;
    const c = counts.get(ap) ?? 0;
    if (c > bestCount) {
      bestCount = c;
      best = ap;
    }
  }

  return best ? { position: best, name: recentName.get(best)! } : null;
}

function resolveNominationPosition(
  nomination: { playerId?: number | null; playerName: string },
  posByName: Map<string, string>,
  posByPlayerId: Map<number, string>,
): string | undefined {
  if (typeof nomination.playerId === 'number') return posByPlayerId.get(nomination.playerId);
  return posByName.get(nomination.playerName);
}
