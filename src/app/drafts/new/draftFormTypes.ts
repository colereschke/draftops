import type { StartingSlot } from '@/types';

export interface TeamRow {
  handle: string;
  displayName: string;
  isMine: boolean;
  sleeperRosterId?: number;
}

export type ImportState =
  | { status: 'idle' }
  | { status: 'error'; message: string }
  | { status: 'success'; confirm: string; warnings: string[] };

export function defaultTeams(count: number): TeamRow[] {
  return Array.from({ length: count }, (_, i) => ({
    handle: `team-${i + 1}`,
    displayName: '',
    isMine: i === 0,
  }));
}

export function sortStartingLineup(slots: StartingSlot[]): StartingSlot[] {
  const options: StartingSlot[] = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'SUPER_FLEX'];
  return [...slots].sort((left, right) => options.indexOf(left) - options.indexOf(right));
}
