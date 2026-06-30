import { notFound } from 'next/navigation';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { getDraft } from '@/lib/draft';
import { computeTeamStats } from '@/lib/budget';
import BudgetPressureView from '@/components/BudgetPressure';

export const dynamic = 'force-dynamic';

export default async function BudgetPage({ params }: { params: Promise<{ draftId: string }> }) {
  const draftId = parseInt((await params).draftId, 10);
  const session = await auth();
  const draft = await getDraft(session!.user.id, draftId);
  if (!session || !draft) notFound();

  const teams = await prisma.team.findMany({
    where: { draftId },
    include: { results: true },
  });

  return (
    <BudgetPressureView
      teams={computeTeamStats(teams)}
      ownerHandle={draft.ownerTeam?.handle ?? null}
    />
  );
}
