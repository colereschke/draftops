import type { Prisma } from '@prisma/client';
import { lockDraftForMutation } from '@/lib/draftLock';

it('uses the shared draft mutation advisory-lock namespace', async () => {
  const executeRaw = jest.fn().mockResolvedValue(1);
  const tx = { $executeRaw: executeRaw } as unknown as Prisma.TransactionClient;

  await lockDraftForMutation(tx, 42);

  expect(executeRaw).toHaveBeenCalledTimes(1);
  expect(executeRaw.mock.calls[0][0].join('')).toContain('pg_advisory_xact_lock');
  expect(executeRaw.mock.calls[0]).toContain(1_144_002_001);
  expect(executeRaw.mock.calls[0]).toContain(42);
});
