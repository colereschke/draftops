/**
 * @jest-environment node
 */

import { seedDefaultDraft } from './seedDefaultDraft';

describe('seedDefaultDraft', () => {
  it('seeds every team and assigns the owner within one transaction', async () => {
    const transaction = {
      draft: {
        findFirst: jest.fn().mockResolvedValue({ id: 7, ownerTeamId: null }),
        create: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      team: {
        upsert: jest.fn().mockResolvedValue({}),
        findFirst: jest.fn().mockResolvedValue({ id: 12 }),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (tx: typeof transaction) => Promise<void>) =>
        callback(transaction),
      ),
    };

    await seedDefaultDraft(prisma as never, 'owner-discord-id');

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(transaction.team.upsert).toHaveBeenCalledTimes(12);
    expect(transaction.draft.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { ownerTeamId: 12 },
    });
  });

  it('propagates transaction failures', async () => {
    const prisma = {
      $transaction: jest.fn().mockRejectedValue(new Error('team write failed')),
    };

    await expect(seedDefaultDraft(prisma as never)).rejects.toThrow('team write failed');
  });
});
