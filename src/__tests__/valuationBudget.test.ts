import {
  DEFAULT_RANKING_SOURCE_BUDGET,
  RAW_RANKING_BUDGET,
  getBudgetScale,
  scaleWholeDollar,
} from '@/lib/valuationBudget';

describe('valuation budget contract', () => {
  it('defines the raw and normalized ranking economies explicitly', () => {
    expect(RAW_RANKING_BUDGET).toBe(200);
    expect(DEFAULT_RANKING_SOURCE_BUDGET).toBe(1000);
  });

  it.each([
    [1000, 200, 0.2],
    [1000, 1000, 1],
    [1000, 2000, 2],
  ])('scales a $%i source into a $%i draft', (sourceBudget, draftBudget, expected) => {
    expect(getBudgetScale(sourceBudget, draftBudget)).toBe(expected);
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid source budgets: %s',
    (sourceBudget) => {
      expect(() => getBudgetScale(sourceBudget, 1000)).toThrow('source budget');
    },
  );

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid draft budgets: %s',
    (draftBudget) => {
      expect(() => getBudgetScale(1000, draftBudget)).toThrow('draft budget');
    },
  );

  it('rounds scaled values once and applies the requested minimum', () => {
    expect(scaleWholeDollar(109, 0.2, 1)).toBe(22);
    expect(scaleWholeDollar(1, 0.2, 1)).toBe(1);
    expect(scaleWholeDollar(5, 2, 10)).toBe(10);
  });
});
