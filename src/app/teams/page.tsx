import { prisma } from '@/lib/db';
import { computeTeamStats } from '@/lib/computeTeamStats';
import RosterTracker from '@/components/RosterTracker';

export const dynamic = 'force-dynamic';

export default async function TeamsPage() {
  const teams = await prisma.team.findMany({
    include: { results: true },
    orderBy: { handle: 'asc' },
  });

  const teamsWithRoster = computeTeamStats(teams);

  return <RosterTracker teams={teamsWithRoster} />;
}
