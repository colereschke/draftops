import {
  activateProjectionValueSet,
  markProjectionValueSetFailed,
  ProjectionApplicationFailure,
  pruneProjectionValueSetRows,
} from '@/lib/projectionValueSet';

const mockLockDraftForMutation = jest.fn();

jest.mock('@/lib/draftLock', () => ({
  lockDraftForMutation: (...args: unknown[]) => mockLockDraftForMutation(...args),
}));

const mockDraftFindUnique = jest.fn();
const mockDraftUpdate = jest.fn();
const mockValueSetFindUnique = jest.fn();
const mockValueSetFindMany = jest.fn();
const mockValueSetUpdateMany = jest.fn();
const mockValueDeleteMany = jest.fn();
const mockValueCount = jest.fn();

const tx = {
  draft: { findUnique: mockDraftFindUnique, update: mockDraftUpdate },
  draftProjectionValueSet: {
    findUnique: mockValueSetFindUnique,
    findMany: mockValueSetFindMany,
    updateMany: mockValueSetUpdateMany,
  },
  draftPlayerValue: { count: mockValueCount, deleteMany: mockValueDeleteMany },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockLockDraftForMutation.mockResolvedValue(undefined);
  mockDraftFindUnique.mockResolvedValue({ activeProjectionValueSetId: 10 });
  mockValueSetFindUnique.mockResolvedValue({
    id: 11,
    draftId: 5,
    projectionSourceId: 7,
    status: 'STAGING',
    expectedPlayerCount: 2,
  });
  mockValueCount.mockResolvedValue(2);
  mockValueSetUpdateMany.mockResolvedValue({ count: 1 });
  mockDraftUpdate.mockResolvedValue({});
});

it('activates a complete staging set under the shared draft lock', async () => {
  const result = await activateProjectionValueSet(tx, {
    draftId: 5,
    valueSetId: 11,
    projectionSourceId: 7,
  });

  expect(mockLockDraftForMutation).toHaveBeenCalledWith(tx, 5);
  expect(mockValueCount).toHaveBeenCalledWith({
    where: { draftId: 5, valueSetId: 11, projectionSourceId: 7 },
  });
  expect(mockValueSetUpdateMany).toHaveBeenNthCalledWith(1, {
    where: { id: 10, draftId: 5, status: 'ACTIVE' },
    data: { status: 'ARCHIVED' },
  });
  expect(mockValueSetUpdateMany).toHaveBeenNthCalledWith(2, {
    where: { id: 11, draftId: 5, projectionSourceId: 7, status: 'STAGING' },
    data: {
      status: 'ACTIVE',
      appliedPlayerCount: 2,
      activatedAt: expect.any(Date),
    },
  });
  expect(mockDraftUpdate).toHaveBeenCalledWith({
    where: { id: 5 },
    data: { activeProjectionValueSetId: 11 },
  });
  expect(mockValueSetUpdateMany.mock.invocationCallOrder[1]).toBeLessThan(
    mockDraftUpdate.mock.invocationCallOrder[0],
  );
  expect(result).toEqual({
    valueSetId: 11,
    projectionSourceId: 7,
    appliedCount: 2,
    activatedAt: expect.any(Date),
  });
});

it('rejects activation when persisted row count does not match the candidate', async () => {
  mockValueCount.mockResolvedValue(1);

  await expect(
    activateProjectionValueSet(tx, {
      draftId: 5,
      valueSetId: 11,
      projectionSourceId: 7,
    }),
  ).rejects.toMatchObject<Partial<ProjectionApplicationFailure>>({
    code: 'PERSISTED_COUNT_MISMATCH',
  });

  expect(mockValueSetUpdateMany).not.toHaveBeenCalled();
  expect(mockDraftUpdate).not.toHaveBeenCalled();
});

it('rejects a candidate that is no longer staging', async () => {
  mockValueSetFindUnique.mockResolvedValue({
    id: 11,
    draftId: 5,
    projectionSourceId: 7,
    status: 'FAILED',
    expectedPlayerCount: 2,
  });

  await expect(
    activateProjectionValueSet(tx, {
      draftId: 5,
      valueSetId: 11,
      projectionSourceId: 7,
    }),
  ).rejects.toMatchObject<Partial<ProjectionApplicationFailure>>({ code: 'ACTIVATION_CONFLICT' });
});

it('retains rows for the three newest archived value sets', async () => {
  mockValueSetFindMany.mockResolvedValue([{ id: 9 }, { id: 8 }, { id: 7 }, { id: 6 }, { id: 5 }]);
  mockValueDeleteMany.mockResolvedValue({ count: 4 });

  await pruneProjectionValueSetRows(tx, 4);

  expect(mockValueSetFindMany).toHaveBeenCalledWith({
    where: { draftId: 4, status: 'ARCHIVED' },
    orderBy: [{ activatedAt: 'desc' }, { id: 'desc' }],
    select: { id: true },
  });
  expect(mockValueDeleteMany).toHaveBeenCalledWith({
    where: { draftId: 4, valueSetId: { in: [6, 5] } },
  });
});

it('removes partial rows before recording a failed staging set', async () => {
  mockValueDeleteMany.mockResolvedValue({ count: 2 });
  mockValueSetUpdateMany.mockResolvedValue({ count: 1 });

  await markProjectionValueSetFailed(tx, {
    draftId: 5,
    valueSetId: 11,
    code: 'PERSISTENCE_FAILURE',
    message: 'write failed',
  });

  expect(mockValueDeleteMany).toHaveBeenCalledWith({ where: { draftId: 5, valueSetId: 11 } });
  expect(mockValueSetUpdateMany).toHaveBeenCalledWith({
    where: { id: 11, draftId: 5, status: 'STAGING' },
    data: {
      status: 'FAILED',
      failedAt: expect.any(Date),
      failureCode: 'PERSISTENCE_FAILURE',
      failureMessage: 'write failed',
    },
  });
  expect(mockValueDeleteMany.mock.invocationCallOrder[0]).toBeLessThan(
    mockValueSetUpdateMany.mock.invocationCallOrder[0],
  );
});
