import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import AuctionSheet from '@/components/AuctionSheet/AuctionSheet';
import type { DeletedBid } from '@/components/BidHistory/BidHistoryPanel';
import type { ClaimedBid, LeagueTeam } from '@/types';
import { auth } from '@/auth';
import { getDraft } from '@/lib/draft';
import { getActiveDraftPlayers } from '@/lib/activeDraftPlayers';
import { fromPrismaFuturePickMode } from '@/lib/futurePickAssets';
import { computeSpreads } from '@/lib/valueSpread';
import { toStartingLineup } from '@/lib/startingLineup';
import { DEFAULT_SCORING_SETTINGS, type ScoringSettings } from '@/types';

export default async function DraftHomePage({ params }: { params: Promise<{ draftId: string }> }) {
  const draftId = parseInt((await params).draftId, 10);
  const session = await auth();
  if (!session) notFound();
  const draft = await getDraft(session.user.id, draftId);
  if (!draft) notFound();

  const [rawBids, deletedBidRows, teams, nominatedEntries] = await Promise.all([
    prisma.auctionResult.findMany({
      where: { draftId, deletedAt: null },
      select: {
        id: true,
        playerId: true,
        player: true,
        position: true,
        price: true,
        teamId: true,
        team: { select: { handle: true } },
      },
    }),
    prisma.auctionResult.findMany({
      where: { draftId, deletedAt: { not: null } },
      select: {
        id: true,
        player: true,
        position: true,
        price: true,
        deletedAt: true,
        supersededAt: true,
        team: { select: { handle: true } },
      },
      orderBy: { deletedAt: 'desc' },
    }),
    prisma.team.findMany({
      where: { draftId },
      select: { id: true, handle: true, displayName: true, sleeperRosterId: true },
      orderBy: { handle: 'asc' },
    }),
    prisma.nominatedPlayer.findMany({
      where: { draftId },
      select: { playerId: true },
    }),
  ]);

  const claimedBids: ClaimedBid[] = rawBids.map((r) => ({
    id: r.id,
    playerId: r.playerId,
    player: r.player,
    position: r.position,
    price: r.price,
    teamId: r.teamId,
    teamHandle: r.team.handle,
  }));
  const deletedBids: DeletedBid[] = deletedBidRows.flatMap((bid) =>
    bid.deletedAt === null
      ? []
      : [
          {
            id: bid.id,
            player: bid.player,
            position: bid.position,
            price: bid.price,
            teamHandle: bid.team.handle,
            deletedAt: bid.deletedAt.toISOString(),
            supersededAt: bid.supersededAt?.toISOString() ?? null,
          },
        ],
  );

  const startingLineup = toStartingLineup(draft.startingLineup);

  const activePlayers = await getActiveDraftPlayers({
    draftId,
    bids: rawBids.map((bid) => ({
      player: bid.player,
      price: bid.price,
      teamHandle: bid.team.handle,
    })),
    startingLineup,
    futurePickAuctionMode: fromPrismaFuturePickMode(draft.futurePickAuctionMode),
  });

  const players = computeSpreads(activePlayers);
  const sleeperRosterIds = teams.map((team) => team.sleeperRosterId);
  const sleeperSyncConfigured =
    Boolean(draft.sleeperLeagueId) &&
    sleeperRosterIds.every((rosterId) => rosterId !== null) &&
    new Set(sleeperRosterIds).size === sleeperRosterIds.length;

  return (
    <AuctionSheet
      players={players}
      claimedBids={claimedBids}
      teams={teams as LeagueTeam[]}
      nominatedPlayers={nominatedEntries.map((entry) => entry.playerId)}
      draftId={draftId}
      ownerHandle={draft.ownerTeam?.handle ?? null}
      ownerBudget={draft.ownerTeam?.budget ?? 1000}
      scoringSettings={(draft.scoringSettings ?? DEFAULT_SCORING_SETTINGS) as ScoringSettings}
      teamCount={draft.teamCount}
      budget={draft.budget}
      rosterSize={draft.rosterSize}
      startingLineup={startingLineup}
      sleeperSyncConfigured={sleeperSyncConfigured}
      sleeperLeagueId={draft.sleeperLeagueId}
      isReadOnly={draft.status === 'COMPLETE'}
      deletedBids={deletedBids}
    />
  );
}
