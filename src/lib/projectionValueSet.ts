import type { Prisma } from '@prisma/client';
import { lockDraftForMutation } from '@/lib/draftLock';

export const RETAINED_ARCHIVED_VALUE_SET_COUNT = 3;

export type ProjectionApplicationFailureCode =
  | 'NO_PROJECTION_SOURCE'
  | 'NO_JOINED_PLAYERS'
  | 'INVALID_CALCULATION'
  | 'PERSISTED_COUNT_MISMATCH'
  | 'ACTIVATION_CONFLICT'
  | 'PERSISTENCE_FAILURE';

export class ProjectionApplicationFailure extends Error {
  constructor(
    readonly code: ProjectionApplicationFailureCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ProjectionApplicationFailure';
  }
}

export interface ActivateProjectionValueSetInput {
  draftId: number;
  valueSetId: number;
  projectionSourceId: number;
}

export interface ActivatedProjectionValueSet {
  valueSetId: number;
  projectionSourceId: number;
  appliedCount: number;
  activatedAt: Date;
}

interface ProjectionValueSetTransaction {
  draft: {
    findUnique(args: {
      where: { id: number };
      select: { activeProjectionValueSetId: true };
    }): Promise<{ activeProjectionValueSetId: number | null } | null>;
    update(args: {
      where: { id: number };
      data: { activeProjectionValueSetId: number };
    }): Promise<unknown>;
  };
  draftProjectionValueSet: {
    findUnique(args: {
      where: { id: number };
      select: {
        id: true;
        draftId: true;
        projectionSourceId: true;
        status: true;
        expectedPlayerCount: true;
      };
    }): Promise<{
      id: number;
      draftId: number;
      projectionSourceId: number | null;
      status: string;
      expectedPlayerCount: number;
    } | null>;
    updateMany(args: {
      where: {
        id: number;
        draftId: number;
        projectionSourceId?: number;
        status: 'ACTIVE' | 'STAGING';
      };
      data:
        | { status: 'ARCHIVED' }
        | { status: 'ACTIVE'; appliedPlayerCount: number; activatedAt: Date };
    }): Promise<{ count: number }>;
  };
  draftPlayerValue: {
    count(args: {
      where: { draftId: number; valueSetId: number; projectionSourceId: number };
    }): Promise<number>;
  };
}

interface ProjectionValueSetRetentionPrisma {
  draftProjectionValueSet: {
    findMany(args: {
      where: { draftId: number; status: 'ARCHIVED' };
      orderBy: [{ activatedAt: 'desc' }, { id: 'desc' }];
      select: { id: true };
    }): Promise<Array<{ id: number }>>;
  };
  draftPlayerValue: {
    deleteMany(args: {
      where: { draftId: number; valueSetId: { in: number[] } };
    }): Promise<{ count: number }>;
  };
}

interface ProjectionValueSetFailurePrisma {
  draftProjectionValueSet: {
    updateMany(args: {
      where: { id: number; draftId: number; status: 'STAGING' };
      data: {
        status: 'FAILED';
        failedAt: Date;
        failureCode: ProjectionApplicationFailureCode;
        failureMessage: string;
      };
    }): Promise<{ count: number }>;
  };
  draftPlayerValue: {
    deleteMany(args: {
      where: { draftId: number; valueSetId: number };
    }): Promise<{ count: number }>;
  };
}

export interface MarkProjectionValueSetFailedInput {
  draftId: number;
  valueSetId: number;
  code: ProjectionApplicationFailureCode;
  message: string;
}

export async function activateProjectionValueSet(
  tx: ProjectionValueSetTransaction,
  input: ActivateProjectionValueSetInput,
): Promise<ActivatedProjectionValueSet> {
  await lockDraftForMutation(tx as unknown as Prisma.TransactionClient, input.draftId);

  const [draft, candidate] = await Promise.all([
    tx.draft.findUnique({
      where: { id: input.draftId },
      select: { activeProjectionValueSetId: true },
    }),
    tx.draftProjectionValueSet.findUnique({
      where: { id: input.valueSetId },
      select: {
        id: true,
        draftId: true,
        projectionSourceId: true,
        status: true,
        expectedPlayerCount: true,
      },
    }),
  ]);

  if (
    !draft ||
    !candidate ||
    candidate.status !== 'STAGING' ||
    candidate.draftId !== input.draftId ||
    candidate.projectionSourceId !== input.projectionSourceId
  ) {
    throw new ProjectionApplicationFailure(
      'ACTIVATION_CONFLICT',
      `Projection value set ${input.valueSetId} is not an activatable candidate`,
    );
  }

  const appliedCount = await tx.draftPlayerValue.count({
    where: {
      draftId: input.draftId,
      valueSetId: input.valueSetId,
      projectionSourceId: input.projectionSourceId,
    },
  });
  if (appliedCount !== candidate.expectedPlayerCount) {
    throw new ProjectionApplicationFailure(
      'PERSISTED_COUNT_MISMATCH',
      `Projection value set ${input.valueSetId} expected ${candidate.expectedPlayerCount} row(s) but persisted ${appliedCount}`,
    );
  }

  if (draft.activeProjectionValueSetId !== null) {
    const archived = await tx.draftProjectionValueSet.updateMany({
      where: {
        id: draft.activeProjectionValueSetId,
        draftId: input.draftId,
        status: 'ACTIVE',
      },
      data: { status: 'ARCHIVED' },
    });
    if (archived.count !== 1) {
      throw new ProjectionApplicationFailure(
        'ACTIVATION_CONFLICT',
        `Draft ${input.draftId} active projection value set changed during activation`,
      );
    }
  }

  const activatedAt = new Date();
  const activated = await tx.draftProjectionValueSet.updateMany({
    where: {
      id: input.valueSetId,
      draftId: input.draftId,
      projectionSourceId: input.projectionSourceId,
      status: 'STAGING',
    },
    data: { status: 'ACTIVE', appliedPlayerCount: appliedCount, activatedAt },
  });
  if (activated.count !== 1) {
    throw new ProjectionApplicationFailure(
      'ACTIVATION_CONFLICT',
      `Projection value set ${input.valueSetId} changed during activation`,
    );
  }

  await tx.draft.update({
    where: { id: input.draftId },
    data: { activeProjectionValueSetId: input.valueSetId },
  });

  return {
    valueSetId: input.valueSetId,
    projectionSourceId: input.projectionSourceId,
    appliedCount,
    activatedAt,
  };
}

export async function pruneProjectionValueSetRows(
  prisma: ProjectionValueSetRetentionPrisma,
  draftId: number,
): Promise<void> {
  const archived = await prisma.draftProjectionValueSet.findMany({
    where: { draftId, status: 'ARCHIVED' },
    orderBy: [{ activatedAt: 'desc' }, { id: 'desc' }],
    select: { id: true },
  });
  const prunableIds = archived
    .slice(RETAINED_ARCHIVED_VALUE_SET_COUNT)
    .map((valueSet) => valueSet.id);
  if (prunableIds.length === 0) return;

  await prisma.draftPlayerValue.deleteMany({
    where: { draftId, valueSetId: { in: prunableIds } },
  });
}

export async function markProjectionValueSetFailed(
  prisma: ProjectionValueSetFailurePrisma,
  input: MarkProjectionValueSetFailedInput,
): Promise<void> {
  await prisma.draftPlayerValue.deleteMany({
    where: { draftId: input.draftId, valueSetId: input.valueSetId },
  });
  await prisma.draftProjectionValueSet.updateMany({
    where: { id: input.valueSetId, draftId: input.draftId, status: 'STAGING' },
    data: {
      status: 'FAILED',
      failedAt: new Date(),
      failureCode: input.code,
      failureMessage: input.message,
    },
  });
}
