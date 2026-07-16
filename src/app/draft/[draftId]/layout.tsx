import { auth } from '@/auth';
import { redirect, notFound } from 'next/navigation';
import { getDraft } from '@/lib/draft';
import { getOnboardingProgress } from '@/lib/onboarding';
import { OnboardingProvider } from '@/components/Onboarding';

export default async function DraftLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ draftId: string }>;
}) {
  const { draftId: draftIdStr } = await params;
  const draftId = parseInt(draftIdStr, 10);

  const session = await auth();
  if (!session) redirect(`/sign-in?callbackUrl=/draft/${draftIdStr}`);
  if (isNaN(draftId)) notFound();

  const [draft, onboardingProgress] = await Promise.all([
    getDraft(session.user.id, draftId),
    getOnboardingProgress(session.user.id),
  ]);
  if (!draft) notFound();

  const tourProgress =
    onboardingProgress?.phase === 'FEATURE_TOUR' && onboardingProgress.draftId === draftId
      ? {
          draftId,
          step: onboardingProgress.step,
          subjectPlayerName: onboardingProgress.subjectPlayerName,
        }
      : null;

  return <OnboardingProvider progress={tourProgress}>{children}</OnboardingProvider>;
}
