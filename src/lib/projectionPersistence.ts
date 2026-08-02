import type {
  ApplyProjectionValuesOptions,
  ApplyProjectionValuesResult,
  ProjectionApplyPrisma,
  ProjectionCandidate,
  SleeperIdUpdate,
} from '@/lib/projectionApplicationTypes';
import { chunk } from '@/lib/projectionPreparation';
import {
  activateProjectionValueSet,
  markProjectionValueSetFailed,
  ProjectionApplicationFailure,
  pruneProjectionValueSetRows,
} from '@/lib/projectionValueSet';

const WRITE_BATCH_SIZE = 50;
const WRITE_TRANSACTION_TIMEOUT_MS = 60_000;

interface PersistProjectionCandidatesInput {
  draftId: number;
  projectionSourceId: number;
  candidateRows: ProjectionCandidate[];
  mode: ApplyProjectionValuesOptions['mode'];
}

export async function persistSleeperIdUpdates(
  prisma: ProjectionApplyPrisma,
  updates: SleeperIdUpdate[],
): Promise<void> {
  for (const batch of chunk(updates, WRITE_BATCH_SIZE)) {
    await Promise.all(
      batch.map((player) =>
        prisma.player.update({
          where: { id: player.id },
          data: { sleeperId: player.sleeperId },
        }),
      ),
    );
  }
}

export async function persistProjectionCandidates(
  prisma: ProjectionApplyPrisma,
  input: PersistProjectionCandidatesInput,
): Promise<ApplyProjectionValuesResult> {
  let valueSet: { id: number };
  try {
    valueSet = await prisma.draftProjectionValueSet.create({
      data: {
        draftId: input.draftId,
        projectionSourceId: input.projectionSourceId,
        status: 'STAGING',
        expectedPlayerCount: input.candidateRows.length,
      },
      select: { id: true },
    });
  } catch (error) {
    throw new ProjectionApplicationFailure(
      'PERSISTENCE_FAILURE',
      `Failed to create a projection value set for draft ${input.draftId}: ${toErrorMessage(error)}`,
      { cause: error },
    );
  }

  try {
    for (const batch of chunk(input.candidateRows, WRITE_BATCH_SIZE)) {
      await prisma.draftPlayerValue.createMany({
        data: batch.map((row) => ({ ...row, valueSetId: valueSet.id })),
      });
    }

    const activationInput = {
      draftId: input.draftId,
      valueSetId: valueSet.id,
      projectionSourceId: input.projectionSourceId,
    };
    const activated =
      input.mode === 'transaction'
        ? await activateProjectionValueSet(prisma as never, activationInput)
        : await requireProjectionTransaction(prisma)(
            (tx) => activateProjectionValueSet(tx as never, activationInput),
            { timeout: WRITE_TRANSACTION_TIMEOUT_MS },
          );

    if (input.mode !== 'transaction') {
      try {
        await pruneProjectionValueSetRows(prisma as never, input.draftId);
      } catch (error) {
        console.error(`Failed to prune projection value rows for draft ${input.draftId}`, error);
      }
    }
    return activated;
  } catch (error) {
    const failure =
      error instanceof ProjectionApplicationFailure
        ? error
        : new ProjectionApplicationFailure(
            'PERSISTENCE_FAILURE',
            `Failed to persist projection values for draft ${input.draftId}: ${toErrorMessage(error)}`,
            { cause: error },
          );
    if (input.mode !== 'transaction') {
      try {
        await requireProjectionTransaction(prisma)(
          (tx) =>
            markProjectionValueSetFailed(tx as never, {
              draftId: input.draftId,
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
