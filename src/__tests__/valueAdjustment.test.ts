import { computeScoringMultipliers } from '@/lib/valueAdjustment';
import { DEFAULT_SCORING_SETTINGS, type ScoringSettings } from '@/types';

const scoring = (overrides: Partial<ScoringSettings> = {}): ScoringSettings => ({
  ...DEFAULT_SCORING_SETTINGS,
  ...overrides,
});

describe('computeScoringMultipliers', () => {
  it('returns 1.0 for every position under default scoring', () => {
    const m = computeScoringMultipliers(scoring());
    expect(m.QB).toBeCloseTo(1);
    expect(m.RB).toBeCloseTo(1);
    expect(m.WR).toBeCloseTo(1);
    expect(m.TE).toBeCloseTo(1);
  });

  it('raises only TE for a TE premium, and nothing else', () => {
    const m = computeScoringMultipliers(scoring({ pprTE: 1.75 }));
    expect(m.TE).toBeGreaterThan(1);
    expect(m.RB).toBeCloseTo(1);
    expect(m.WR).toBeCloseTo(1);
    expect(m.QB).toBeCloseTo(1);
  });

  it('lets a 2x TE premium exceed the general 1.5 cap (wider TE band)', () => {
    const m = computeScoringMultipliers(scoring({ pprTE: 2.0 }));
    expect(m.TE).toBeGreaterThan(1.5);
    expect(m.TE).toBeLessThanOrEqual(1.9);
  });

  it('clamps QB/RB/WR scoring at 1.5', () => {
    const m = computeScoringMultipliers(scoring({ pprRB: 10 }));
    expect(m.RB).toBe(1.5);
  });

  it('raises QB for a passing-TD premium', () => {
    const m = computeScoringMultipliers(scoring({ passTD: 6 }));
    expect(m.QB).toBeGreaterThan(1);
  });

  it('raises QB when passing yards are worth more (lower yds/pt)', () => {
    const m = computeScoringMultipliers(scoring({ passYdsPerPoint: 20 }));
    expect(m.QB).toBeGreaterThan(1);
  });
});
