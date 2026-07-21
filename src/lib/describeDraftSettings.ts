import type { ScoringSettings, StartingSlot } from '@/types';

export function formatLineupFormat(startingLineup: StartingSlot[]): string {
  if (startingLineup.includes('SUPER_FLEX')) return 'Superflex';
  const qbSlots = startingLineup.filter((slot) => slot === 'QB').length;
  return `${qbSlots}QB`;
}

export function hasTePremium(scoringSettings: ScoringSettings): boolean {
  const teNeverWorse =
    scoringSettings.pprTE >= scoringSettings.pprWR &&
    scoringSettings.teFDBonus >= scoringSettings.wrFDBonus;
  const teStrictlyBetter =
    scoringSettings.pprTE > scoringSettings.pprWR ||
    scoringSettings.teFDBonus > scoringSettings.wrFDBonus;
  return teNeverWorse && teStrictlyBetter;
}
