import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { getDraftForUser } from '@/lib/draft';
import { ROSTER_SIZE } from '@/lib/teams';
import type { TeamStats, AuctionResultEntry } from '@/types';

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const draft = await getDraftForUser(session.user.id);
  if (!draft) return NextResponse.json({ error: 'No draft found' }, { status: 404 });

  const teams = await prisma.team.findMany({
    where: { draftId: draft.id },
    include: { results: true },
  });

  const teamStats: TeamStats[] = teams.map((team) => {
    const spent = team.results.reduce((sum: number, r) => sum + r.price, 0);
    const remaining = team.budget - spent;
    const rosterCount = team.results.length;
    const rosterRemaining = ROSTER_SIZE - rosterCount;
    const buyingPower = remaining - rosterRemaining;
    const pkgCount = team.results.filter((r) => r.position === 'PKG').length;
    return {
      id: team.id,
      handle: team.handle,
      displayName: team.displayName,
      budget: team.budget,
      spent,
      remaining,
      rosterCount,
      rosterRemaining,
      buyingPower,
      pkgCount,
    };
  });

  const auctionResults: AuctionResultEntry[] = teams.flatMap((team) =>
    team.results.map((r) => ({
      id: r.id,
      player: r.player,
      position: r.position,
      nflTeam: r.nflTeam,
      price: r.price,
      sfRank: r.sfRank,
      teamId: team.id,
      teamHandle: team.handle,
      createdAt: r.createdAt,
    })),
  );

  const [watchlistEntries, nominatedEntries] = await Promise.all([
    prisma.playerWatchlist.findMany({
      where: { draftId: draft.id },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.nominatedPlayer.findMany({
      where: { draftId: draft.id },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  return NextResponse.json({
    teamStats,
    auctionResults,
    watchlist: watchlistEntries.map((e) => e.playerName),
    nominated: nominatedEntries.map((e) => e.playerName),
    ownerHandle: draft.ownerTeam?.handle ?? null,
  });
}
