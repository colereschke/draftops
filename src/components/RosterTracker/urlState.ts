import type { AppetitePos } from '@/lib/tendencies.constants';
import { APPETITE_POSITIONS } from '@/lib/tendencies.constants';

export type RosterTrackerSortKey = 'spend' | 'aggression' | 'buys' | 'age' | AppetitePos;
export type RosterTrackerSortDir = 'asc' | 'desc';

const STAT_SORT_KEYS: RosterTrackerSortKey[] = ['spend', 'aggression', 'buys', 'age'];
const VALID_SORT_KEYS: RosterTrackerSortKey[] = [...STAT_SORT_KEYS, ...APPETITE_POSITIONS];

export interface RosterTrackerUrlState {
  sortBy: RosterTrackerSortKey;
  sortDir: RosterTrackerSortDir;
  selectedTeamId: number | null;
}

export function parseRosterTrackerSearchParams(params: URLSearchParams): RosterTrackerUrlState {
  const sort = params.get('sort');
  const dir = params.get('dir');
  const team = params.get('team');
  const teamId = team !== null ? Number(team) : NaN;
  return {
    sortBy: (VALID_SORT_KEYS as string[]).includes(sort ?? '')
      ? (sort as RosterTrackerSortKey)
      : 'spend',
    sortDir: dir === 'asc' ? 'asc' : 'desc',
    selectedTeamId: Number.isSafeInteger(teamId) ? teamId : null,
  };
}

export function buildRosterTrackerQueryString(state: RosterTrackerUrlState): string {
  const params = new URLSearchParams();
  if (state.sortBy !== 'spend') params.set('sort', state.sortBy);
  if (state.sortDir !== 'desc') params.set('dir', state.sortDir);
  if (state.selectedTeamId !== null) params.set('team', String(state.selectedTeamId));
  return params.toString();
}
