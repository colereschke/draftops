'use server';

import type { OnboardingStep } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';

export interface AdvanceOnboardingInput {
  draftId: number;
  step: OnboardingStep;
  subjectPlayerName?: string;
}

export async function beginOnboarding(): Promise<void> {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');

  await prisma.onboardingProgress.upsert({
    where: { userId: session.user.id },
    create: { userId: session.user.id, phase: 'DRAFT_SETUP' },
    update: {},
  });
  revalidatePath('/drafts');
}

export async function advanceOnboardingStep(input: AdvanceOnboardingInput): Promise<void> {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');

  const result = await prisma.onboardingProgress.updateMany({
    where: {
      userId: session.user.id,
      phase: 'FEATURE_TOUR',
      draftId: input.draftId,
    },
    data: {
      step: input.step,
      subjectPlayerName: input.subjectPlayerName,
    },
  });
  if (result.count === 0) throw new Error('Onboarding not found');

  revalidatePath(`/draft/${input.draftId}`);
}

export async function completeOnboarding(): Promise<void> {
  const session = await auth();
  if (!session) throw new Error('Unauthorized');

  await prisma.onboardingProgress.upsert({
    where: { userId: session.user.id },
    create: { userId: session.user.id, phase: 'COMPLETED', completedAt: new Date() },
    update: {
      phase: 'COMPLETED',
      completedAt: new Date(),
      draftId: null,
      subjectPlayerName: null,
    },
  });
  revalidatePath('/drafts');
}
