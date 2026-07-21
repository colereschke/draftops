export const SLEEPER_SEARCH_POSITIONS = ['QB', 'RB', 'WR', 'TE'] as const;

export type SleeperSearchPosition = (typeof SLEEPER_SEARCH_POSITIONS)[number];

export interface SleeperSearchResult {
  id: string;
  name: string;
  team: string;
  pos: SleeperSearchPosition;
}

export interface SleeperSearchResponse {
  results: SleeperSearchResult[];
}

export function isSleeperSearchPosition(value: string): value is SleeperSearchPosition {
  return SLEEPER_SEARCH_POSITIONS.includes(value as SleeperSearchPosition);
}
