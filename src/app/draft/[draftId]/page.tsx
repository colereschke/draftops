import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import AuctionSheet from '@/components/AuctionSheet/AuctionSheet';
import type { ClaimedBid, LeagueTeam } from '@/types';
import { auth } from '@/auth';
import { getDraft } from '@/lib/draft';
import { getActiveDraftPlayers } from '@/lib/activeDraftPlayers';
import { fromPrismaFuturePickMode } from '@/lib/futurePickAssets';
import { computeSpreads } from '@/lib/valueSpread';
import {
  DEFAULT_STARTING_LINEUP,
  DEFAULT_SCORING_SETTINGS,
  type StartingSlot,
  type ScoringSettings,
} from '@/types';

export default async function DraftHomePage({ params }: { params: Promise<{ draftId: string }> }) {
  const draftId = parseInt((await params).draftId, 10);
  const session = await auth();
  if (!session) notFound();
  const draft = await getDraft(session.user.id, draftId);
  if (!draft) notFound();

  const [rawBids, teams, nominatedEntries] = await Promise.all([
    prisma.auctionResult.findMany({
      where: { draftId },
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

  const activePlayers = await getActiveDraftPlayers({
    draftId,
    bids: rawBids.map((bid) => ({
      player: bid.player,
      price: bid.price,
      teamHandle: bid.team.handle,
    })),
    startingLineup: (draft.startingLineup ?? DEFAULT_STARTING_LINEUP) as StartingSlot[],
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
      sleeperSyncConfigured={sleeperSyncConfigured}
      sleeperLeagueId={draft.sleeperLeagueId}
      isReadOnly={draft.status === 'COMPLETE'}
    />
  );
}
