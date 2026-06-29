import { prisma } from '@/lib/db';
import AuctionSheet from '@/components/AuctionSheet/AuctionSheet';
import type { ClaimedBid, LeagueTeam } from '@/types';
import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { getDraftForUser } from '@/lib/draft';

const NO_DRAFT_VIEW = (
  <div
    style={{
      background: '#0a0d14',
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#e05050',
      fontFamily: 'var(--font-inter), sans-serif',
      fontSize: 14,
    }}
  >
    No draft found. Run <code style={{ marginLeft: 4, marginRight: 4 }}>make setup</code> and ensure{' '}
    <code>OWNER_DISCORD_ID</code> is set in <code>.env.local</code>.
  </div>
);

export default async function Home() {
  const session = await auth();
  if (!session) redirect('/sign-in');

  const draft = await getDraftForUser(session.user.id);
  if (!draft) return NO_DRAFT_VIEW;

  const [rawBids, teams, nominatedEntries] = await Promise.all([
    prisma.auctionResult.findMany({
      where: { draftId: draft.id },
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
      where: { draftId: draft.id },
      select: { id: true, handle: true, displayName: true },
      orderBy: { handle: 'asc' },
    }),
    prisma.nominatedPlayer.findMany({
      where: { draftId: draft.id },
      select: { playerName: true },
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
  const nominatedPlayers = nominatedEntries.map((e) => e.playerName);

  return (
    <AuctionSheet
      claimedBids={claimedBids}
      teams={leagueTeams}
      nominatedPlayers={nominatedPlayers}
    />
  );
}
