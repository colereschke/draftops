import { prisma } from '@/lib/db';
import { computeTeamStats } from '@/lib/budget';
import BudgetPressureView from '@/components/BudgetPressure';

export const dynamic = 'force-dynamic';

export default async function BudgetPage() {
  const teams = await prisma.team.findMany({ include: { results: true } });
  const teamStats = computeTeamStats(teams);
  return <BudgetPressureView teams={teamStats} />;
}
