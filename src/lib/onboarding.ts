import 'server-only';
import { getPrisma } from '@/lib/db';

export async function getOnboardingProgress(userId: string) {
  return getPrisma().onboardingProgress.findUnique({ where: { userId } });
}

export async function isFirstDraftOnboardingEligible(userId: string): Promise<boolean> {
  const [progress, draftCount] = await Promise.all([
    getOnboardingProgress(userId),
    getPrisma().draft.count({ where: { ownerId: userId } }),
  ]);

  return progress === null && draftCount === 0;
}
