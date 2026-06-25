import { prisma } from '@/lib/db';
import AuctionSheet from '@/components/AuctionSheet/AuctionSheet';
import type { ClaimedBid, LeagueTeam } from '@/types';

export default async function Home() {
  const [rawBids, teams] = await Promise.all([
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

  return <AuctionSheet claimedBids={claimedBids} teams={leagueTeams} />;
}
