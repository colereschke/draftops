import {
  calculateProjectionMarketValues,
  type ProjectionMarketValueInput,
} from '@/lib/projectionMarketValue';

const player = (overrides: Partial<ProjectionMarketValueInput>): ProjectionMarketValueInput => ({
  sleeperId: '1',
  name: 'Player',
  position: 'TE',
  fallbackAuctionValue: 100,
  baselineProjectedPoints: 100,
  projectedPoints: 110,
  isRookie: false,
  ...overrides,
});

describe('calculateProjectionMarketValues', () => {
  it('raises a high-reception TE more than an efficiency TE in the same market bucket', () => {
    const values = calculateProjectionMarketValues({
      players: [
        player({
          sleeperId: 'kelce',
          name: 'High Volume TE',
          position: 'TE',
          fallbackAuctionValue: 100,
          baselineProjectedPoints: 200,
          projectedPoints: 250,
        }),
        player({
          sleeperId: 'kittle',
          name: 'Efficiency TE',
          position: 'TE',
          fallbackAuctionValue: 98,
          baselineProjectedPoints: 200,
          projectedPoints: 220,
        }),
        player({
          sleeperId: 'peer',
          name: 'Peer TE',
          position: 'TE',
          fallbackAuctionValue: 96,
          baselineProjectedPoints: 200,
          projectedPoints: 220,
        }),
        player({ sleeperId: 'te4', position: 'TE', fallbackAuctionValue: 60 }),
        player({ sleeperId: 'te5', position: 'TE', fallbackAuctionValue: 40 }),
        player({ sleeperId: 'te6', position: 'TE', fallbackAuctionValue: 20 }),
        player({ sleeperId: 'te7', position: 'TE', fallbackAuctionValue: 10 }),
      ],
    });

    const volume = values.find((value) => value.sleeperId === 'kelce')!;
    const efficiency = values.find((value) => value.sleeperId === 'kittle')!;

    expect(volume.projectionMarketMultiplier).toBeGreaterThan(
      efficiency.projectionMarketMultiplier,
    );
    expect(volume.activeAuctionValue).toBeGreaterThan(100);
    expect(efficiency.activeAuctionValue).toBeLessThanOrEqual(98);
    expect(volume.valueSource).toBe('projection_adjusted_market');
  });

  it('normalizes against peers instead of giving every player the same lift', () => {
    const values = calculateProjectionMarketValues({
      players: [
        player({
          sleeperId: 'wr1',
          name: 'Target Hog WR',
          position: 'WR',
          fallbackAuctionValue: 80,
          baselineProjectedPoints: 200,
          projectedPoints: 250,
        }),
        player({
          sleeperId: 'wr2',
          name: 'Neutral WR',
          position: 'WR',
          fallbackAuctionValue: 78,
          baselineProjectedPoints: 200,
          projectedPoints: 220,
        }),
        player({ sleeperId: 'wr3', position: 'WR', fallbackAuctionValue: 60 }),
        player({ sleeperId: 'wr4', position: 'WR', fallbackAuctionValue: 40 }),
        player({ sleeperId: 'wr5', position: 'WR', fallbackAuctionValue: 20 }),
        player({ sleeperId: 'wr6', position: 'WR', fallbackAuctionValue: 10 }),
      ],
    });

    const targetHog = values.find((value) => value.sleeperId === 'wr1')!;
    const neutral = values.find((value) => value.sleeperId === 'wr2')!;

    expect(targetHog.rawScoringLift).toBeCloseTo(1.25);
    expect(neutral.rawScoringLift).toBeCloseTo(1.1);
    expect(targetHog.relativeScoringLift).toBeGreaterThan(1);
    expect(neutral.relativeScoringLift).toBeLessThan(1);
    expect(targetHog.projectionMarketMultiplier).not.toBe(neutral.projectionMarketMultiplier);
  });

  it('keeps fallback active when projection points are missing', () => {
    const [value] = calculateProjectionMarketValues({
      players: [
        player({
          sleeperId: 'missing',
          fallbackAuctionValue: 42,
          baselineProjectedPoints: null,
          projectedPoints: null,
        }),
      ],
    });

    expect(value.activeAuctionValue).toBe(42);
    expect(value.valueSource).toBe('fallback');
    expect(value.rawScoringLift).toBeNull();
    expect(value.relativeScoringLift).toBeNull();
    expect(value.projectionMarketMultiplier).toBe(1);
  });

  it('keeps fallback active when baseline points are zero', () => {
    const [value] = calculateProjectionMarketValues({
      players: [
        player({
          sleeperId: 'zero',
          fallbackAuctionValue: 37,
          baselineProjectedPoints: 0,
          projectedPoints: 18,
        }),
      ],
    });

    expect(value.activeAuctionValue).toBe(37);
    expect(value.valueSource).toBe('fallback');
  });

  it('keeps fallback active when projected points are non-positive', () => {
    const values = calculateProjectionMarketValues({
      players: [
        player({
          sleeperId: 'non-positive',
          fallbackAuctionValue: 37,
          baselineProjectedPoints: 100,
          projectedPoints: 0,
        }),
        player({
          sleeperId: 'same-bucket-peer',
          fallbackAuctionValue: 38,
          baselineProjectedPoints: 100,
          projectedPoints: 100,
        }),
      ],
    });

    const value = values.find((projectionValue) => projectionValue.sleeperId === 'non-positive')!;
    expect(value.activeAuctionValue).toBe(37);
    expect(value.valueSource).toBe('fallback');
    expect(value.rawScoringLift).toBeNull();
  });

  it('does not let low rookie projection shape reduce active value below fallback', () => {
    const values = calculateProjectionMarketValues({
      players: [
        player({
          sleeperId: 'rookie',
          name: 'Rookie WR',
          position: 'WR',
          fallbackAuctionValue: 75,
          baselineProjectedPoints: 100,
          projectedPoints: 90,
          isRookie: true,
        }),
        player({
          sleeperId: 'vet',
          name: 'Veteran WR',
          position: 'WR',
          fallbackAuctionValue: 76,
          baselineProjectedPoints: 100,
          projectedPoints: 120,
        }),
        player({ sleeperId: 'wr3', position: 'WR', fallbackAuctionValue: 60 }),
        player({ sleeperId: 'wr4', position: 'WR', fallbackAuctionValue: 40 }),
        player({ sleeperId: 'wr5', position: 'WR', fallbackAuctionValue: 20 }),
        player({ sleeperId: 'wr6', position: 'WR', fallbackAuctionValue: 10 }),
      ],
    });

    const rookie = values.find((value) => value.sleeperId === 'rookie')!;
    expect(rookie.activeAuctionValue).toBe(75);
    expect(rookie.valueSource).toBe('projection_adjusted_market');
  });

  it('lets strong rookie projection shape raise active value', () => {
    const values = calculateProjectionMarketValues({
      players: [
        player({
          sleeperId: 'rookie',
          name: 'Rookie WR',
          position: 'WR',
          fallbackAuctionValue: 75,
          baselineProjectedPoints: 100,
          projectedPoints: 130,
          isRookie: true,
        }),
        player({
          sleeperId: 'vet',
          name: 'Veteran WR',
          position: 'WR',
          fallbackAuctionValue: 76,
          baselineProjectedPoints: 100,
          projectedPoints: 105,
        }),
        player({ sleeperId: 'wr3', position: 'WR', fallbackAuctionValue: 60 }),
        player({ sleeperId: 'wr4', position: 'WR', fallbackAuctionValue: 40 }),
        player({ sleeperId: 'wr5', position: 'WR', fallbackAuctionValue: 20 }),
        player({ sleeperId: 'wr6', position: 'WR', fallbackAuctionValue: 10 }),
      ],
    });

    const rookie = values.find((value) => value.sleeperId === 'rookie')!;
    expect(rookie.activeAuctionValue).toBeGreaterThan(75);
    expect(rookie.valueSource).toBe('projection_adjusted_market');
  });

  it('uses fallback value percentile within position for peer buckets', () => {
    const values = calculateProjectionMarketValues({
      players: [
        player({
          sleeperId: 'te1',
          name: 'Elite TE',
          position: 'TE',
          fallbackAuctionValue: 65,
          baselineProjectedPoints: 100,
          projectedPoints: 130,
        }),
        player({
          sleeperId: 'te2',
          name: 'Starter TE',
          position: 'TE',
          fallbackAuctionValue: 45,
          baselineProjectedPoints: 100,
          projectedPoints: 100,
        }),
        player({
          sleeperId: 'te3',
          name: 'Depth TE',
          position: 'TE',
          fallbackAuctionValue: 5,
          baselineProjectedPoints: 100,
          projectedPoints: 100,
        }),
        player({
          sleeperId: 'wr1',
          name: 'Elite WR',
          position: 'WR',
          fallbackAuctionValue: 150,
          baselineProjectedPoints: 100,
          projectedPoints: 100,
        }),
      ],
    });

    const eliteTe = values.find((value) => value.sleeperId === 'te1')!;
    const starterTe = values.find((value) => value.sleeperId === 'te2')!;

    expect(eliteTe.marketBucket).toBe('elite');
    expect(starterTe.marketBucket).toBe('starter');
    expect(eliteTe.relativeScoringLift).toBeCloseTo(1);
    expect(starterTe.relativeScoringLift).toBeCloseTo(1);
  });
});
