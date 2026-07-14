import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { getDraft } from '@/lib/draft';
import { DEFAULT_TARGET_ROSTER } from '@/types';
import type { TeamStats, AuctionResultEntry, Position } from '@/types';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ draftId: string }> },
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const draftId = parseInt((await params).draftId, 10);
  const draft = await getDraft(session.user.id, draftId);
  if (!draft) return NextResponse.json({ error: 'No draft found' }, { status: 404 });

  const teams = await prisma.team.findMany({
    where: { draftId: draft.id },
    include: { results: true },
  });

  const teamStats: TeamStats[] = teams.map((team) => {
    const spent = team.results.reduce((sum: number, r) => sum + r.price, 0);
    const remaining = team.budget - spent;
    const rosterCount = team.results.length;
    const rosterRemaining = draft.rosterSize - rosterCount;
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
      avgAge: null,
    };
  });

  const auctionResults: AuctionResultEntry[] = teams.flatMap((team) =>
    team.results.map((r) => ({
      id: r.id,
      playerId: r.playerId,
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
    watchlist: watchlistEntries.flatMap((e) => (e.playerId === null ? [] : [e.playerId])),
    nominated: nominatedEntries.flatMap((e) => (e.playerId === null ? [] : [e.playerId])),
    ownerHandle: draft.ownerTeam?.handle ?? null,
    targetRoster:
      (draft.targetRoster as Partial<Record<Position, number>> | null) ?? DEFAULT_TARGET_ROSTER,
  });
}
