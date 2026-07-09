import { notFound } from 'next/navigation';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { getDraft } from '@/lib/draft';
import { computeTeamStats } from '@/lib/computeTeamStats';
import { computeTendencies } from '@/lib/tendencies';
import RosterTracker from '@/components/RosterTracker';
import type { Player, Position } from '@/types';

export const dynamic = 'force-dynamic';

export default async function TeamsPage({ params }: { params: Promise<{ draftId: string }> }) {
  const draftId = parseInt((await params).draftId, 10);
  const session = await auth();
  if (!session) notFound();
  const draft = await getDraft(session.user.id, draftId);
  if (!draft) notFound();

  const [rawTeams, dbPlayers] = await Promise.all([
    prisma.team.findMany({
      where: { draftId },
      include: { results: true },
      orderBy: { handle: 'asc' },
    }),
    prisma.player.findMany({ where: { draftId }, orderBy: { sfRank: 'asc' } }),
  ]);

  const players: Player[] = dbPlayers.map((p) => ({
    player: p.name,
    team: p.nflTeam,
    pos: p.pos as Position,
    age: p.age,
    sfRank: p.sfRank,
    budget: p.budget,
    ceiling: p.ceiling,
    floor: p.floor,
    notes: p.notes,
    sleeperId: p.sleeperId,
  }));

  const tendencies = computeTendencies(rawTeams, players);

  return (
    <RosterTracker
      teams={computeTeamStats(rawTeams, players, draft.rosterSize)}
      tendencies={tendencies}
      ownerHandle={draft.ownerTeam?.handle ?? null}
    />
  );
}
