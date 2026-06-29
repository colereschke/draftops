import { prisma } from '@/lib/db';
import AuctionSheet from '@/components/AuctionSheet/AuctionSheet';
import type { ClaimedBid, LeagueTeam } from '@/types';
import { auth } from '@/auth';
import { redirect } from 'next/navigation';

export default async function Home() {
  const session = await auth();
  if (!session) redirect('/sign-in');

  const [rawBids, teams, nominatedEntries] = await Promise.all([
    prisma.auctionResult.findMany({
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
      select: { id: true, handle: true, displayName: true },
      orderBy: { handle: 'asc' },
    }),
    prisma.nominatedPlayer.findMany({ select: { playerName: true } }),
  ]);

  const claimedBids: ClaimedBid[] = rawBids.map((r) => ({
    id: r.id,
    player: r.player,
    position: r.position,
    price: r.price,
    teamId: r.teamId,
    teamHandle: r.team.handle,
  }));

  const leagueTeams: LeagueTeam[] = teams;
  const nominatedPlayers = nominatedEntries.map((e) => e.playerName);

  return (
    <AuctionSheet
      claimedBids={claimedBids}
      teams={leagueTeams}
      nominatedPlayers={nominatedPlayers}
    />
  );
}
