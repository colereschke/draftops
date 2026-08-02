import { ProjectionApplicationFailure } from '@/lib/projectionValueSet';
import {
  getLatestProjectionSourceId,
  getSleeperIdUpdates,
  prepareProjectionCandidates,
  resolvePlayerSleeperIds,
} from '@/lib/projectionPreparation';
import { persistProjectionCandidates, persistSleeperIdUpdates } from '@/lib/projectionPersistence';
import type {
  ApplyProjectionValuesOptions,
  ApplyProjectionValuesResult,
  ProjectionApplyPrisma,
} from '@/lib/projectionApplicationTypes';

export {
  buildDraftPlayerValueData,
  buildStaleDraftPlayerValueDeleteWhere,
  getLatestProjectionSourceId,
  getSleeperIdUpdates,
  joinPlayersToProjectionRows,
  prepareProjectionCandidates,
  resolvePlayerSleeperIds,
} from '@/lib/projectionPreparation';
export type {
  ApplyProjectionValuesOptions,
  ApplyProjectionValuesResult,
  DraftPlayerValueDeleteWhere,
  JoinedProjectionRow,
  PlayerJoinRow,
  ProjectionApplyPrisma,
  ProjectionJoinRow,
  ResolvedPlayerJoinRow,
  SleeperIdUpdate,
  VorPosition,
} from '@/lib/projectionApplicationTypes';

export async function applyProjectionValuesToDraft(
  prisma: ProjectionApplyPrisma,
  options: ApplyProjectionValuesOptions,
): Promise<ApplyProjectionValuesResult> {
  const draft = await prisma.draft.findUnique({
    where: { id: options.draftId },
    select: {
      id: true,
      teamCount: true,
      rosterSize: true,
      budget: true,
      startingLineup: true,
      scoringSettings: true,
      targetRoster: true,
    },
  });
  if (!draft) throw new Error(`Draft ${options.draftId} not found`);

  const projectionSourceId =
    options.projectionSourceId ?? (await getLatestProjectionSourceId(prisma));
  if (projectionSourceId === null) {
    throw new ProjectionApplicationFailure('NO_PROJECTION_SOURCE', 'No projection source found');
  }

  const players = await prisma.player.findMany({
    where: { draftId: draft.id },
    select: { id: true, name: true, pos: true, sleeperId: true, budget: true },
  });
  const playersWithSleeperIds = resolvePlayerSleeperIds(players, options.etrMatches ?? new Map());

  await persistSleeperIdUpdates(prisma, getSleeperIdUpdates(playersWithSleeperIds));

  const projections = await prisma.playerProjection.findMany({
    where: { projectionSourceId },
  });
  const candidateRows = prepareProjectionCandidates({
    draft,
    projectionSourceId,
    players: playersWithSleeperIds,
    projections,
  });

  return persistProjectionCandidates(prisma, {
    draftId: draft.id,
    projectionSourceId,
    candidateRows,
    mode: options.mode,
  });
}
