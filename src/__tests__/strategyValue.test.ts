import { applyStrategyLens, type StrategyLens } from '@/lib/strategyValue';
import type { Player } from '@/types';

const PLAYER: Player = {
  player: 'Test Player',
  team: 'BUF',
  pos: 'QB',
  age: 27,
  sfRank: 1,
  budget: 120,
  ceiling: 138,
  floor: 104,
  notes: '',
  baseBudget: 120,
  projectionAuctionValue: 160,
  projectedPoints: 400,
  vor: 120,
  valueSource: 'fallback',
};

function valueFor(overrides: Partial<Player>, strategy: StrategyLens): Player {
  return applyStrategyLens([{ ...PLAYER, ...overrides }], strategy)[0];
}

describe('applyStrategyLens', () => {
  it('keeps rebuild values anchored to dynasty price', () => {
    const player = valueFor({ projectionAuctionValue: 200 }, 'rebuild');

    expect(player.budget).toBe(120);
    expect(player.strategyAdjustment).toBe(0);
    expect(player.strategyLens).toBe('rebuild');
  });

  it('moves balanced values less than contend values toward projection value', () => {
    const balanced = valueFor({ projectionAuctionValue: 160 }, 'balanced');
    const contend = valueFor({ projectionAuctionValue: 160 }, 'contend');

    expect(balanced.budget).toBeGreaterThan(120);
    expect(contend.budget).toBeGreaterThan(balanced.budget);
    expect(contend.budget).toBeLessThan(160);
  });

  it('protects young dynasty assets from large negative projection deltas', () => {
    const player = valueFor({ age: 22, projectionAuctionValue: 40 }, 'contend');

    expect(player.budget).toBe(111);
    expect(player.strategyAdjustment).toBe(-9);
  });

  it('lets older productive players rise more in contend mode', () => {
    const player = valueFor({ age: 31, projectionAuctionValue: 180 }, 'contend');

    expect(player.budget).toBe(161);
    expect(player.strategyAdjustment).toBe(41);
  });

  it('recalculates floor and ceiling from the strategy-adjusted target', () => {
    const player = valueFor({ projectionAuctionValue: 160 }, 'contend');

    expect(player.floor).toBe(Math.max(5, Math.round((player.budget * 87) / 100)));
    expect(player.ceiling).toBe(Math.round((player.budget * 115) / 100));
  });

  it('leaves players without projection value unchanged', () => {
    const player = valueFor({ projectionAuctionValue: null }, 'contend');

    expect(player.budget).toBe(120);
    expect(player.strategyAdjustment).toBe(0);
  });
});
