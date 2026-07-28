import type { PositionFilter, StrategyFilter } from './FilterControls';
import type { SortKey } from './PlayerTable';

const VALID_POSITIONS: PositionFilter[] = ['ALL', 'QB', 'RB', 'WR', 'TE', 'PICK', 'PKG'];
const VALID_STRATEGIES: StrategyFilter[] = ['ALL', 'WIN-NOW', 'BARGAIN', 'FUTURE', 'FADE'];
const VALID_SORT_KEYS: SortKey[] = [
  'sfRank',
  'player',
  'pos',
  'team',
  'age',
  'floor',
  'budget',
  'ceiling',
  'spread',
  'claimedPrice',
];

export interface AuctionSheetUrlState {
  posFilter: PositionFilter;
  strategyFilter: StrategyFilter;
  search: string;
  sortBy: SortKey;
  sortDir: 'asc' | 'desc';
  availableOnly: boolean;
}

export function parseAuctionSheetSearchParams(params: URLSearchParams): AuctionSheetUrlState {
  const pos = params.get('pos');
  const strategy = params.get('strategy');
  const sort = params.get('sort');
  const dir = params.get('dir');
  return {
    posFilter: (VALID_POSITIONS as string[]).includes(pos ?? '') ? (pos as PositionFilter) : 'ALL',
    strategyFilter: (VALID_STRATEGIES as string[]).includes(strategy ?? '')
      ? (strategy as StrategyFilter)
      : 'ALL',
    search: params.get('q') ?? '',
    sortBy: (VALID_SORT_KEYS as string[]).includes(sort ?? '') ? (sort as SortKey) : 'budget',
    sortDir: dir === 'asc' ? 'asc' : 'desc',
    availableOnly: params.get('available') === '1',
  };
}

export function buildAuctionSheetQueryString(state: AuctionSheetUrlState): string {
  const params = new URLSearchParams();
  if (state.posFilter !== 'ALL') params.set('pos', state.posFilter);
  if (state.strategyFilter !== 'ALL') params.set('strategy', state.strategyFilter);
  if (state.search) params.set('q', state.search);
  if (state.sortBy !== 'budget') params.set('sort', state.sortBy);
  if (state.sortDir !== 'desc') params.set('dir', state.sortDir);
  if (state.availableOnly) params.set('available', '1');
  return params.toString();
}
