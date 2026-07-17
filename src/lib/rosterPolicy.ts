const ROSTER_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE']);

export function countsTowardRoster(position: string): position is 'QB' | 'RB' | 'WR' | 'TE' {
  return ROSTER_POSITIONS.has(position);
}
