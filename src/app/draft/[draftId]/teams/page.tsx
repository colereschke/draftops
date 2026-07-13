import { notFound } from 'next/navigation';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { getDraft } from '@/lib/draft';
import { computeTeamStats } from '@/lib/computeTeamStats';
import { computeTendencies } from '@/lib/tendencies';
import RosterTracker from '@/components/RosterTracker';
import { DEFAULT_STARTING_LINEUP, type StartingSlot } from '@/types';
import { applyDynamicPickValues } from '@/lib/dynamicPickValues';
import { mapPlayersWithDraftValues } from '@/lib/playerValueMapping';

export const dynamic = 'force-dynamic';

export default async function TeamsPage({ params }: { params: Promise<{ draftId: string }> }) {
  const draftId = parseInt((await params).draftId, 10);
  const session = await auth();
  if (!session) notFound();
  const draft = await getDraft(session.user.id, draftId);
  if (!draft) notFound();

  const [rawTeams, dbPlayers, draftValues] = await Promise.all([
    prisma.team.findMany({
      where: { draftId },
      include: { results: true },
      orderBy: { handle: 'asc' },
    }),
    prisma.player.findMany({ where: { draftId }, orderBy: { sfRank: 'asc' } }),
    prisma.draftPlayerValue.findMany({
      where: { draftId },
      select: {
        playerId: true,
        projectionSourceId: true,
        projectedPoints: true,
        replacementPoints: true,
        vor: true,
        projectionAuctionValue: true,
        fallbackAuctionValue: true,
        activeAuctionValue: true,
        valueSource: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
    }),
  ]);

  const players = applyDynamicPickValues({
    players: mapPlayersWithDraftValues(dbPlayers, draftValues),
    bids: rawTeams.flatMap((team) =>
      team.results.map((result) => ({
        player: result.player,
        price: result.price,
        teamHandle: team.handle,
      })),
    ),
    startingLineup: (draft.startingLineup ?? DEFAULT_STARTING_LINEUP) as StartingSlot[],
  });

  const tendencies = computeTendencies(rawTeams, players);

  return (
    <RosterTracker
      teams={computeTeamStats(rawTeams, players, draft.rosterSize)}
      tendencies={tendencies}
      ownerHandle={draft.ownerTeam?.handle ?? null}
    />
  );
}
