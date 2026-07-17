import { scaleRankingValue } from '@/lib/scaleRankingValue';
import { DEFAULT_RANKING_SOURCE_BUDGET, RAW_RANKING_BUDGET } from '@/lib/valuationBudget';

describe('scaleRankingValue', () => {
  it('scales a raw value by 5x for non-TE positions', () => {
    expect(scaleRankingValue('QB', 52)).toEqual({ budget: 260, ceiling: 299, floor: 226 });
  });

  it('normalizes raw $200 values into the default $1,000 source economy', () => {
    expect(DEFAULT_RANKING_SOURCE_BUDGET / RAW_RANKING_BUDGET).toBe(5);
    expect(scaleRankingValue('QB', 52)).toEqual({ budget: 260, ceiling: 299, floor: 226 });
  });

  it('applies the 1.18x TE premium on top of the 5x scale', () => {
    // raw 37 -> 185 -> TE premium round(185*1.18)=218 -> ceiling round(218*1.15)=251 -> floor max(5, round(218*0.87))=190
    expect(scaleRankingValue('TE', 37)).toEqual({ budget: 218, ceiling: 251, floor: 190 });
  });

  it('clamps budget to a minimum of 5', () => {
    expect(scaleRankingValue('QB', 0)).toEqual({ budget: 5, ceiling: 6, floor: 5 });
  });

  it('applies the same formula (no TE premium) to PICK rows', () => {
    expect(scaleRankingValue('PICK', 15)).toEqual({ budget: 75, ceiling: 86, floor: 65 });
  });
});
