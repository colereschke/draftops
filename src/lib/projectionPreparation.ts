import { DEFAULT_SCORING_SETTINGS, DEFAULT_TARGET_ROSTER, type ScoringSettings } from '@/types';
import {
  calculateProjectionMarketValues,
  type ProjectionMarketValueOutput,
} from '@/lib/projectionMarketValue';
import { calculateProjectedPoints, type ProjectionStats } from '@/lib/projectionScoring';
import { calculateProjectionValues, type ProjectionValueInput } from '@/lib/projectionVor';
import { ProjectionApplicationFailure } from '@/lib/projectionValueSet';
import { toStartingLineup } from '@/lib/startingLineup';
import type {
  DraftPlayerValueData,
  DraftPlayerValueDeleteWhere,
  JoinedProjectionRow,
  PlayerJoinRow,
  ProjectionApplyPrisma,
  ProjectionCandidate,
  ProjectionJoinRow,
  ProjectionPreparationInput,
  ResolvedPlayerJoinRow,
  SleeperIdUpdate,
  StoredProjectionRow,
  TargetRoster,
  VorPosition,
} from '@/lib/projectionApplicationTypes';

export async function getLatestProjectionSourceId(
  prisma: ProjectionApplyPrisma,
): Promise<number | null> {
  const source = await prisma.projectionSource.findFirst({
    orderBy: [{ projectionDate: 'desc' }, { updatedAt: 'desc' }, { id: 'desc' }],
  });
  return source?.id ?? null;
}

export function prepareProjectionCandidates(
  input: ProjectionPreparationInput,
): ProjectionCandidate[] {
  const scoringSettings = toScoringSettings(input.draft.scoringSettings);
  const joined = joinPlayersToStoredProjectionRows(
    input.players,
    input.projections,
    scoringSettings,
  );
  if (joined.length === 0) {
    throw noJoinedPlayersFailure(input.draft.id);
  }

  const projectionInputs: ProjectionValueInput[] = joined.map((row) => ({
    sleeperId: row.sleeperId,
    name: String(row.playerId),
    position: row.position,
    projectedPoints: row.projectedPoints,
    fallbackAuctionValue: row.fallbackAuctionValue,
    isRookie: row.isRookie,
  }));
  const values = calculateProjectionValues({
    players: projectionInputs,
    teamCount: input.draft.teamCount,
    rosterSize: input.draft.rosterSize,
    budget: input.draft.budget,
    startingLineup: toStartingLineup(input.draft.startingLineup),
    targetRoster: toTargetRoster(input.draft.targetRoster),
    scoringSettings,
  });
  const valuesBySleeperId = new Map(values.map((value) => [value.sleeperId, value]));
  const marketValues = calculateProjectionMarketValues({
    players: joined.map((row) => ({
      sleeperId: row.sleeperId,
      name: String(row.playerId),
      position: row.position,
      projectedPoints: row.projectedPoints,
      baselineProjectedPoints: row.baselineProjectedPoints,
      fallbackAuctionValue: row.fallbackAuctionValue,
      isRookie: row.isRookie,
    })),
  });
  const marketValuesBySleeperId = new Map(marketValues.map((value) => [value.sleeperId, value]));
  const candidateRows = joined.flatMap((row): ProjectionCandidate[] => {
    const value = valuesBySleeperId.get(row.sleeperId);
    const marketValue = marketValuesBySleeperId.get(row.sleeperId);
    if (!value || !marketValue) return [];
    const data = buildDraftPlayerValueData(row, value, marketValue);
    return [
      {
        draftId: input.draft.id,
        playerId: row.playerId,
        projectionSourceId: input.projectionSourceId,
        ...data,
      },
    ];
  });

  if (candidateRows.length === 0) {
    throw noJoinedPlayersFailure(input.draft.id);
  }
  assertFiniteCandidateRows(candidateRows);
  return candidateRows;
}

export function resolvePlayerSleeperIds(
  players: PlayerJoinRow[],
  etrMatches: Map<string, string>,
): ResolvedPlayerJoinRow[] {
  return players.map((player) => {
    const resolvedSleeperId = player.sleeperId ?? etrMatches.get(player.name) ?? null;
    return {
      ...player,
      sleeperId: resolvedSleeperId,
      shouldUpdateSleeperId: player.sleeperId !== resolvedSleeperId && resolvedSleeperId !== null,
    };
  });
}

export function getSleeperIdUpdates(players: ResolvedPlayerJoinRow[]): SleeperIdUpdate[] {
  return players.flatMap((player) =>
    player.shouldUpdateSleeperId && player.sleeperId
      ? [{ id: player.id, sleeperId: player.sleeperId }]
      : [],
  );
}

export function joinPlayersToProjectionRows(
  players: PlayerJoinRow[],
  projections: ProjectionJoinRow[],
): JoinedProjectionRow[] {
  const projectionsBySleeperId = new Map(
    projections.map((projection) => [projection.sleeperId, projection]),
  );

  return players.flatMap((player) => {
    if (!player.sleeperId) return [];
    const projection = projectionsBySleeperId.get(player.sleeperId);
    if (!projection) return [];
    return [
      {
        playerId: player.id,
        sleeperId: player.sleeperId,
        position: projection.position,
        projectedPoints: projection.projectedPoints,
        baselineProjectedPoints: projection.baselineProjectedPoints,
        fallbackAuctionValue: player.budget,
        isRookie: projection.isRookie,
      },
    ];
  });
}

export function buildDraftPlayerValueData(
  row: JoinedProjectionRow,
  value: {
    replacementPoints: number | null;
    vor: number | null;
    projectionAuctionValue: number | null;
  },
  marketValue: ProjectionMarketValueOutput,
): DraftPlayerValueData {
  return {
    projectedPoints: row.projectedPoints,
    replacementPoints: value.replacementPoints,
    vor: value.vor,
    projectionAuctionValue: value.projectionAuctionValue,
    fallbackAuctionValue: row.fallbackAuctionValue,
    activeAuctionValue: marketValue.activeAuctionValue,
    valueSource: marketValue.valueSource,
  };
}

export function buildStaleDraftPlayerValueDeleteWhere(
  draftId: number,
  projectionSourceId: number,
  joined: JoinedProjectionRow[],
): DraftPlayerValueDeleteWhere {
  const currentPlayerIds = joined.map((row) => row.playerId);
  if (currentPlayerIds.length === 0) {
    return { draftId, projectionSourceId };
  }
  return { draftId, projectionSourceId, playerId: { notIn: currentPlayerIds } };
}

export function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}

function joinPlayersToStoredProjectionRows(
  players: PlayerJoinRow[],
  projections: StoredProjectionRow[],
  scoring: ScoringSettings,
): JoinedProjectionRow[] {
  const projectionRows = projections.flatMap((projection): ProjectionJoinRow[] => {
    const position = toVorPosition(projection.position);
    if (!position) return [];
    const stats = toProjectionStats({ ...projection, position });
    return [
      {
        sleeperId: projection.sleeperId,
        position,
        projectedPoints: calculateProjectedPoints(stats, scoring),
        baselineProjectedPoints: calculateProjectedPoints(stats, DEFAULT_SCORING_SETTINGS),
        isRookie: projection.isRookie,
      },
    ];
  });

  return joinPlayersToProjectionRows(players, projectionRows);
}

function assertFiniteCandidateRows(rows: ProjectionCandidate[]): void {
  for (const row of rows) {
    const numericValues = [
      row.projectedPoints,
      row.replacementPoints,
      row.vor,
      row.projectionAuctionValue,
      row.fallbackAuctionValue,
      row.activeAuctionValue,
    ].filter((value): value is number => value !== null);
    if (numericValues.some((value) => !Number.isFinite(value))) {
      throw new ProjectionApplicationFailure(
        'INVALID_CALCULATION',
        `Projection calculation produced an invalid value for player ${row.playerId}`,
      );
    }
  }
}

function noJoinedPlayersFailure(draftId: number): ProjectionApplicationFailure {
  return new ProjectionApplicationFailure(
    'NO_JOINED_PLAYERS',
    `No projection values could be applied to draft ${draftId}`,
  );
}

function toProjectionStats(row: StoredProjectionRow & { position: VorPosition }): ProjectionStats {
  return {
    sleeperId: row.sleeperId,
    position: row.position,
    games: row.games,
    passAtt: row.passAtt,
    passCmp: row.passCmp,
    passYds: row.passYds,
    passTd: row.passTd,
    passInt: row.passInt,
    passSacks: row.passSacks,
    rushAtt: row.rushAtt,
    rushYds: row.rushYds,
    rushTd: row.rushTd,
    targets: row.targets,
    receptions: row.receptions,
    recYds: row.recYds,
    recTd: row.recTd,
  };
}

function toVorPosition(position: string): VorPosition | null {
  if (position === 'QB' || position === 'RB' || position === 'WR' || position === 'TE') {
    return position;
  }
  return null;
}

function toScoringSettings(value: unknown): ScoringSettings {
  if (value === null || typeof value !== 'object') return { ...DEFAULT_SCORING_SETTINGS };
  return { ...DEFAULT_SCORING_SETTINGS, ...(value as Partial<ScoringSettings>) };
}

function toTargetRoster(value: unknown): TargetRoster {
  if (value === null || typeof value !== 'object') return DEFAULT_TARGET_ROSTER;
  return value as TargetRoster;
}
