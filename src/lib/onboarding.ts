import 'server-only';
import { prisma } from '@/lib/db';

export async function getOnboardingProgress(userId: string) {
  return prisma.onboardingProgress.findUnique({ where: { userId } });
}

export async function isFirstDraftOnboardingEligible(userId: string): Promise<boolean> {
  const [progress, draftCount] = await Promise.all([
    getOnboardingProgress(userId),
    prisma.draft.count({ where: { ownerId: userId } }),
  ]);

  return progress === null && draftCount === 0;
}
