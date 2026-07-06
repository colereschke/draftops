import type { Position, ScoringSettings } from '@/types';

export interface ProjectionStats {
  sleeperId: string;
  position: Position;
  games: number;
  passYds: number;
  passTd: number;
  passInt: number;
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

  return (
    projection.passYds / scoring.passYdsPerPoint +
    projection.passTd * scoring.passTD +
    projection.passInt * scoring.passInt +
    projection.rushAtt * scoring.rushAtt +
    projection.rushYds / RUSH_YDS_PER_POINT +
    projection.rushTd * RUSH_TD +
    projection.receptions * ppr +
    projection.recYds / REC_YDS_PER_POINT +
    projection.recTd * REC_TD
  );
}
