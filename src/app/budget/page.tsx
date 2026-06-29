import { prisma } from '@/lib/db';
import { computeTeamStats } from '@/lib/budget';
import BudgetPressureView from '@/components/BudgetPressure';
import { auth } from '@/auth';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function BudgetPage() {
  const session = await auth();
  if (!session) redirect('/sign-in');
  const teams = await prisma.team.findMany({ include: { results: true } });
  const teamStats = computeTeamStats(teams);
  return <BudgetPressureView teams={teamStats} />;
}
