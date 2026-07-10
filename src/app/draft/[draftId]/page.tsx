import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import AuctionSheet from '@/components/AuctionSheet/AuctionSheet';
import type { ClaimedBid, LeagueTeam } from '@/types';
import { auth } from '@/auth';
import { getDraft } from '@/lib/draft';
import { mapPlayersWithDraftValues } from '@/lib/playerValueMapping';
import { filterFuturePickAssetsForMode, fromPrismaFuturePickMode } from '@/lib/futurePickAssets';

export default async function DraftHomePage({ params }: { params: Promise<{ draftId: string }> }) {
  const draftId = parseInt((await params).draftId, 10);
  const session = await auth();
  if (!session) notFound();
  const draft = await getDraft(session.user.id, draftId);
  if (!draft) notFound();

  const [rawBids, teams, nominatedEntries, dbPlayers, draftValues] = await Promise.all([
    prisma.auctionResult.findMany({
      where: { draftId },
      select: {
        id: true,
        player: true,
        position: true,
        price: true,
        teamId: true,
        team: { select: { handle: true } },
      },
    }),
    prisma.team.findMany({
      where: { draftId },
      select: { id: true, handle: true, displayName: true },
      orderBy: { handle: 'asc' },
    }),
    prisma.nominatedPlayer.findMany({
      where: { draftId },
      select: { playerName: true },
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

  const claimedBids: ClaimedBid[] = rawBids.map((r) => ({
    id: r.id,
    player: r.player,
    position: r.position,
    price: r.price,
    teamId: r.teamId,
    teamHandle: r.team.handle,
  }));

  const players = filterFuturePickAssetsForMode(
    mapPlayersWithDraftValues(dbPlayers, draftValues),
    fromPrismaFuturePickMode(draft.futurePickAuctionMode),
  );

  return (
    <AuctionSheet
      players={players}
      claimedBids={claimedBids}
      teams={teams as LeagueTeam[]}
      nominatedPlayers={nominatedEntries.map((e) => e.playerName)}
      draftId={draftId}
      ownerHandle={draft.ownerTeam?.handle ?? null}
      ownerBudget={draft.ownerTeam?.budget ?? 1000}
    />
  );
}
