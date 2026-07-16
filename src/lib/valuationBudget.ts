export const RAW_RANKING_BUDGET = 200;
export const DEFAULT_RANKING_SOURCE_BUDGET = 1000;

function assertPositiveSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive safe integer`);
  }
}

export function getBudgetScale(sourceBudget: number, draftBudget: number): number {
  assertPositiveSafeInteger(sourceBudget, 'source budget');
  assertPositiveSafeInteger(draftBudget, 'draft budget');
  return draftBudget / sourceBudget;
}

export function scaleWholeDollar(value: number, scale: number, minimum = 1): number {
  return Math.max(minimum, Math.round(value * scale));
}
