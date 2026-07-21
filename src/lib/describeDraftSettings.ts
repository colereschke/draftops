import type { ScoringSettings, StartingSlot } from '@/types';

export function formatLineupFormat(startingLineup: StartingSlot[]): string {
  if (startingLineup.includes('SUPER_FLEX')) return 'Superflex';
  const qbSlots = startingLineup.filter((slot) => slot === 'QB').length;
  return `${Math.max(qbSlots, 1)}QB`;
}

export function hasTePremium(scoringSettings: ScoringSettings): boolean {
  return (
    scoringSettings.pprTE > scoringSettings.pprWR ||
    scoringSettings.teFDBonus > scoringSettings.wrFDBonus
  );
}
