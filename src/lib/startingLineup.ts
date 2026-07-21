import { DEFAULT_STARTING_LINEUP, type StartingSlot } from '@/types';

export function isStartingSlot(value: unknown): value is StartingSlot {
  return (
    value === 'QB' ||
    value === 'RB' ||
    value === 'WR' ||
    value === 'TE' ||
    value === 'FLEX' ||
    value === 'SUPER_FLEX'
  );
}

export function toStartingLineup(value: unknown): StartingSlot[] {
  if (!Array.isArray(value)) return [...DEFAULT_STARTING_LINEUP];
  const slots = value.filter(isStartingSlot);
  return slots.length > 0 ? slots : [...DEFAULT_STARTING_LINEUP];
}
