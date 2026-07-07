import type { Position, ScoringSettings } from '@/types';

export interface ProjectionStats {
  sleeperId: string;
  position: Position;
  games: number;
  passAtt: number;
  passCmp: number;
  passYds: number;
  passTd: number;
  passInt: number;
  passSacks: number;
  rushAtt: number;
  rushYds: number;
  rushTd: number;
  targets: number;
  receptions: number;
  recYds: number;
  recTd: number;
}

const RUSH_YDS_PER_POINT = 10;
const REC_YDS_PER_POINT = 10;
const RUSH_TD = 6;
const REC_TD = 6;
const RUSH_FIRST_DOWN_RATE = 0.325;
const RECEIVING_FIRST_DOWN_RATES: Partial<Record<Position, number>> = {
  RB: 0.34,
  WR: 0.665,
  TE: 0.575,
};

export function calculateProjectedPoints(
  projection: ProjectionStats,
  scoring: ScoringSettings,
): number {
  const ppr =
    projection.position === 'RB'
      ? scoring.pprRB
      : projection.position === 'WR'
        ? scoring.pprWR
        : projection.position === 'TE'
          ? scoring.pprTE
          : 0;
  const receivingFirstDownRate = RECEIVING_FIRST_DOWN_RATES[projection.position] ?? 0;
  const receivingFirstDownPoints =
    projection.receptions *
    receivingFirstDownRate *
    (scoring.recFD + getPositionReceivingFirstDownBonus(projection.position, scoring));

  return (
    projection.passYds / scoring.passYdsPerPoint +
    projection.passTd * scoring.passTD +
    projection.passInt * scoring.passInt +
    projection.rushAtt * scoring.rushAtt +
    projection.rushAtt * RUSH_FIRST_DOWN_RATE * scoring.rushFD +
    projection.rushYds / RUSH_YDS_PER_POINT +
    projection.rushTd * RUSH_TD +
    projection.receptions * ppr +
    receivingFirstDownPoints +
    projection.recYds / REC_YDS_PER_POINT +
    projection.recTd * REC_TD
  );
}

function getPositionReceivingFirstDownBonus(position: Position, scoring: ScoringSettings): number {
  if (position === 'RB') return scoring.rbFDBonus;
  if (position === 'WR') return scoring.wrFDBonus;
  if (position === 'TE') return scoring.teFDBonus;
  return 0;
}
