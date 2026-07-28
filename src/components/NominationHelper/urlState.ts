import type { Position } from '@/types';

const VALID_POSITIONS: Array<'ALL' | Position> = ['ALL', 'QB', 'RB', 'WR', 'TE', 'PICK', 'PKG'];

export function parseNominationPosFilter(params: URLSearchParams): 'ALL' | Position {
  const pos = params.get('pos');
  return (VALID_POSITIONS as string[]).includes(pos ?? '') ? (pos as 'ALL' | Position) : 'ALL';
}

export function buildNominationQueryString(posFilter: 'ALL' | Position): string {
  return posFilter === 'ALL' ? '' : `pos=${posFilter}`;
}
