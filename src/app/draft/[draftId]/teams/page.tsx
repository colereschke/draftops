import { notFound } from 'next/navigation';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { getDraft } from '@/lib/draft';
import { getActiveDraftPlayers } from '@/lib/activeDraftPlayers';
import { computeDraftTeamStats } from '@/lib/computeDraftTeamStats';
import { computeTendencies } from '@/lib/tendencies';
import RosterTracker from '@/components/RosterTracker';
import { DEFAULT_STARTING_LINEUP, type StartingSlot } from '@/types';
import { fromPrismaFuturePickMode } from '@/lib/futurePickAssets';

export const dynamic = 'force-dynamic';

export default async function TeamsPage({ params }: { params: Promise<{ draftId: string }> }) {
  const draftId = parseInt((await params).draftId, 10);
  const session = await auth();
  if (!session) notFound();
  const draft = await getDraft(session.user.id, draftId);
  if (!draft) notFound();

  const rawTeams = await prisma.team.findMany({
    where: { draftId },
    include: { results: true },
    orderBy: { handle: 'asc' },
  });

  const bids = rawTeams.flatMap((team) =>
    team.results.map((result) => ({
      player: result.player,
      price: result.price,
      teamHandle: team.handle,
    })),
  );
  const startingLineup = (draft.startingLineup ?? DEFAULT_STARTING_LINEUP) as StartingSlot[];

  const players = await getActiveDraftPlayers({
    draftId,
    bids,
    startingLineup,
    futurePickAuctionMode: fromPrismaFuturePickMode(draft.futurePickAuctionMode),
  });

  const tendencies = computeTendencies(rawTeams, players);
  const teams = computeDraftTeamStats({
    teams: rawTeams,
    players,
    rosterSize: draft.rosterSize,
  });

  return (
    <RosterTracker
      teams={teams}
      tendencies={tendencies}
      ownerHandle={draft.ownerTeam?.handle ?? null}
      startingLineup={startingLineup}
    />
  );
}
