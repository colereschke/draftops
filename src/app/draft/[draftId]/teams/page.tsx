import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { getDraft } from '@/lib/draft';
import { computeTeamStats } from '@/lib/computeTeamStats';
import RosterTracker from '@/components/RosterTracker';

export const dynamic = 'force-dynamic';

export default async function TeamsPage({ params }: { params: Promise<{ draftId: string }> }) {
  const draftId = parseInt((await params).draftId, 10);
  const session = await auth();
  const draft = await getDraft(session!.user.id, draftId);

  const rawTeams = await prisma.team.findMany({
    where: { draftId },
    include: { results: true },
    orderBy: { handle: 'asc' },
  });

  return (
    <RosterTracker
      teams={computeTeamStats(rawTeams)}
      ownerHandle={draft?.ownerTeam?.handle ?? null}
    />
  );
}
