import { calculateProjectionValues, type ProjectionValueInput } from '@/lib/projectionVor';
import { DEFAULT_SCORING_SETTINGS, DEFAULT_STARTING_LINEUP, DEFAULT_TARGET_ROSTER } from '@/types';

const player = (
  sleeperId: string,
  position: 'QB' | 'RB' | 'WR' | 'TE',
  points: number,
  fallbackAuctionValue = 10,
  isRookie = false,
): ProjectionValueInput => ({
  sleeperId,
  name: `${position}${sleeperId}`,
  position,
  projectedPoints: points,
  fallbackAuctionValue,
  isRookie,
});

it('uses the Nth player at a position as replacement level', () => {
  const values = calculateProjectionValues({
    players: [player('1', 'QB', 300), player('2', 'QB', 250), player('3', 'QB', 200)],
    teamCount: 2,
    rosterSize: 3,
    budget: 10,
    startingLineup: ['QB'],
    targetRoster: { QB: 1 },
    scoringSettings: DEFAULT_SCORING_SETTINGS,
  });

  expect(values.find((p) => p.sleeperId === '1')?.replacementPoints).toBe(250);
  expect(values.find((p) => p.sleeperId === '1')?.vor).toBe(50);
});

it('allocates auction dollars only across positive VOR', () => {
  const values = calculateProjectionValues({
    players: [player('1', 'QB', 300), player('2', 'QB', 250), player('3', 'QB', 200)],
    teamCount: 2,
    rosterSize: 3,
    budget: 30,
    startingLineup: DEFAULT_STARTING_LINEUP,
    targetRoster: { QB: 1 },
    scoringSettings: DEFAULT_SCORING_SETTINGS,
  });

  expect(values.find((p) => p.sleeperId === '1')?.projectionAuctionValue).toBeGreaterThan(1);
  expect(values.find((p) => p.sleeperId === '3')?.projectionAuctionValue).toBe(1);
});

it('returns fallback-only rows when a player has no projection points', () => {
  const values = calculateProjectionValues({
    players: [{ ...player('1', 'QB', 0), projectedPoints: null }],
    teamCount: 12,
    rosterSize: 30,
    budget: 1000,
    startingLineup: DEFAULT_STARTING_LINEUP,
    targetRoster: DEFAULT_TARGET_ROSTER,
    scoringSettings: DEFAULT_SCORING_SETTINGS,
  });

  expect(values[0].projectionAuctionValue).toBeNull();
  expect(values[0].activeAuctionValue).toBe(values[0].fallbackAuctionValue);
  expect(values[0].vor).toBeNull();
});

it('does not let low rookie projections reduce active dynasty value', () => {
  const values = calculateProjectionValues({
    players: [
      player('1', 'WR', 40, 80, true),
      player('2', 'WR', 120, 20),
      player('3', 'WR', 100, 20),
    ],
    teamCount: 2,
    rosterSize: 3,
    budget: 10,
    startingLineup: ['WR'],
    targetRoster: { WR: 1 },
    scoringSettings: DEFAULT_SCORING_SETTINGS,
    activateProjectionValues: true,
  });

  const rookie = values.find((p) => p.sleeperId === '1')!;
  expect(rookie.projectionAuctionValue).toBe(1);
  expect(rookie.activeAuctionValue).toBe(80);
});

it('lets strong rookie projections raise active value when projection values are active', () => {
  const values = calculateProjectionValues({
    players: [
      player('1', 'WR', 180, 20, true),
      player('2', 'WR', 120, 20),
      player('3', 'WR', 100, 20),
    ],
    teamCount: 2,
    rosterSize: 3,
    budget: 30,
    startingLineup: ['WR'],
    targetRoster: { WR: 1 },
    scoringSettings: DEFAULT_SCORING_SETTINGS,
    activateProjectionValues: true,
  });

  const rookie = values.find((p) => p.sleeperId === '1')!;
  expect(rookie.projectionAuctionValue).toBeGreaterThan(rookie.fallbackAuctionValue);
  expect(rookie.activeAuctionValue).toBe(rookie.projectionAuctionValue);
});
