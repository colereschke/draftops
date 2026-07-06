import { calculateProjectedPoints, type ProjectionStats } from '@/lib/projectionScoring';
import { DEFAULT_SCORING_SETTINGS } from '@/types';

const qb: ProjectionStats = {
  sleeperId: '1',
  position: 'QB',
  games: 17,
  passYds: 4000,
  passTd: 30,
  passInt: 10,
  rushAtt: 80,
  rushYds: 400,
  rushTd: 4,
  targets: 0,
  receptions: 0,
  recYds: 0,
  recTd: 0,
};

it('scores passing, rushing, and turnovers for QBs', () => {
  expect(calculateProjectedPoints(qb, DEFAULT_SCORING_SETTINGS)).toBeCloseTo(324);
});

it('applies position-specific PPR for receiving stats', () => {
  const te: ProjectionStats = {
    ...qb,
    position: 'TE',
    passYds: 0,
    passTd: 0,
    passInt: 0,
    rushAtt: 0,
    rushYds: 0,
    rushTd: 0,
    targets: 120,
    receptions: 80,
    recYds: 900,
    recTd: 8,
  };

  expect(calculateProjectedPoints(te, { ...DEFAULT_SCORING_SETTINGS, pprTE: 2 })).toBeCloseTo(298);
});
