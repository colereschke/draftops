import {
  activateProjectionValueSet,
  markProjectionValueSetFailed,
  ProjectionApplicationFailure,
  pruneProjectionValueSetRows,
} from '@/lib/projectionValueSet';
import {
  chunk,
  getLatestProjectionSourceId,
  getSleeperIdUpdates,
  prepareProjectionCandidates,
  resolvePlayerSleeperIds,
} from '@/lib/projectionPreparation';
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

const WRITE_BATCH_SIZE = 50;
const WRITE_TRANSACTION_TIMEOUT_MS = 60_000;

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

  for (const batch of chunk(getSleeperIdUpdates(playersWithSleeperIds), WRITE_BATCH_SIZE)) {
    await Promise.all(
      batch.map((player) =>
        prisma.player.update({
          where: { id: player.id },
          data: { sleeperId: player.sleeperId },
        }),
      ),
    );
  }

  const projections = await prisma.playerProjection.findMany({
    where: { projectionSourceId },
  });
  const candidateRows = prepareProjectionCandidates({
    draft,
    projectionSourceId,
    players: playersWithSleeperIds,
    projections,
  });

  let valueSet: { id: number };
  try {
    valueSet = await prisma.draftProjectionValueSet.create({
      data: {
        draftId: draft.id,
        projectionSourceId,
        status: 'STAGING',
        expectedPlayerCount: candidateRows.length,
      },
      select: { id: true },
    });
  } catch (error) {
    throw new ProjectionApplicationFailure(
      'PERSISTENCE_FAILURE',
      `Failed to create a projection value set for draft ${draft.id}: ${toErrorMessage(error)}`,
      { cause: error },
    );
  }

  try {
    for (const batch of chunk(candidateRows, WRITE_BATCH_SIZE)) {
      await prisma.draftPlayerValue.createMany({
        data: batch.map((row) => ({ ...row, valueSetId: valueSet.id })),
      });
    }

    const activationInput = {
      draftId: draft.id,
      valueSetId: valueSet.id,
      projectionSourceId,
    };
    const activated =
      options.mode === 'transaction'
        ? await activateProjectionValueSet(prisma as never, activationInput)
        : await requireProjectionTransaction(prisma)(
            (tx) => activateProjectionValueSet(tx as never, activationInput),
            { timeout: WRITE_TRANSACTION_TIMEOUT_MS },
          );

    if (options.mode !== 'transaction') {
      try {
        await pruneProjectionValueSetRows(prisma as never, draft.id);
      } catch (error) {
        console.error(`Failed to prune projection value rows for draft ${draft.id}`, error);
      }
    }
    return activated;
  } catch (error) {
    const failure =
      error instanceof ProjectionApplicationFailure
        ? error
        : new ProjectionApplicationFailure(
            'PERSISTENCE_FAILURE',
            `Failed to persist projection values for draft ${draft.id}: ${toErrorMessage(error)}`,
            { cause: error },
          );
    if (options.mode !== 'transaction') {
      try {
        await requireProjectionTransaction(prisma)(
          (tx) =>
            markProjectionValueSetFailed(tx as never, {
              draftId: draft.id,
              valueSetId: valueSet.id,
              code: failure.code,
              message: failure.message,
            }),
          { timeout: WRITE_TRANSACTION_TIMEOUT_MS },
        );
      } catch (cleanupError) {
        console.error(`Failed to clean projection value set ${valueSet.id}`, cleanupError);
      }
    }
    throw failure;
  }
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function requireProjectionTransaction(
  prisma: ProjectionApplyPrisma,
): NonNullable<ProjectionApplyPrisma['$transaction']> {
  if (!prisma.$transaction) {
    throw new ProjectionApplicationFailure(
      'PERSISTENCE_FAILURE',
      'Staged projection application requires a transaction-capable Prisma client',
    );
  }
  return prisma.$transaction.bind(prisma);
}
