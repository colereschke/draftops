import { formatLineupFormat, hasTePremium } from '@/lib/describeDraftSettings';
import { DEFAULT_SCORING_SETTINGS, DEFAULT_STARTING_LINEUP, type StartingSlot } from '@/types';

describe('formatLineupFormat', () => {
  it('returns Superflex when the lineup includes a SUPER_FLEX slot', () => {
    expect(formatLineupFormat(DEFAULT_STARTING_LINEUP)).toBe('Superflex');
  });

  it('returns 1QB for a single-QB lineup with no superflex slot', () => {
    const lineup: StartingSlot[] = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX'];
    expect(formatLineupFormat(lineup)).toBe('1QB');
  });

  it('returns 2QB for a two-QB lineup with no superflex slot', () => {
    const lineup: StartingSlot[] = ['QB', 'QB', 'RB', 'RB', 'WR', 'WR', 'TE'];
    expect(formatLineupFormat(lineup)).toBe('2QB');
  });
});

describe('hasTePremium', () => {
  it('is false for default scoring settings', () => {
    expect(hasTePremium(DEFAULT_SCORING_SETTINGS)).toBe(false);
  });

  it('is true when pprTE exceeds pprWR', () => {
    expect(hasTePremium({ ...DEFAULT_SCORING_SETTINGS, pprTE: 1.5 })).toBe(true);
  });

  it('is true when teFDBonus exceeds wrFDBonus', () => {
    expect(hasTePremium({ ...DEFAULT_SCORING_SETTINGS, teFDBonus: 0.25 })).toBe(true);
  });

  it('is false when TE and WR receiving settings are identical but both non-zero', () => {
    expect(hasTePremium({ ...DEFAULT_SCORING_SETTINGS, pprTE: 1.5, pprWR: 1.5 })).toBe(false);
  });
});
