import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { getDraft } from '@/lib/draft';
import { getActiveDraftPlayers } from '@/lib/activeDraftPlayers';
import { computeDraftTeamStats } from '@/lib/computeDraftTeamStats';
import { fromPrismaFuturePickMode } from '@/lib/futurePickAssets';
import { DEFAULT_STARTING_LINEUP, DEFAULT_TARGET_ROSTER } from '@/types';
import type { AuctionResultEntry, Position, StartingSlot } from '@/types';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ draftId: string }> },
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const draftId = parseInt((await params).draftId, 10);
  const draft = await getDraft(session.user.id, draftId);
  if (!draft) return NextResponse.json({ error: 'No draft found' }, { status: 404 });

  const [teams, watchlistEntries, nominatedEntries] = await Promise.all([
    prisma.team.findMany({
      where: { draftId: draft.id },
      include: { results: { where: { deletedAt: null } } },
    }),
    prisma.playerWatchlist.findMany({
      where: { draftId: draft.id },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.nominatedPlayer.findMany({
      where: { draftId: draft.id },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  const players = await getActiveDraftPlayers({
    draftId: draft.id,
    bids: teams.flatMap((team) =>
      team.results.map((result) => ({
        player: result.player,
        price: result.price,
        teamHandle: team.handle,
      })),
    ),
    startingLineup: (draft.startingLineup ?? DEFAULT_STARTING_LINEUP) as StartingSlot[],
    futurePickAuctionMode: fromPrismaFuturePickMode(draft.futurePickAuctionMode),
  });
  const teamStats = computeDraftTeamStats({
    teams,
    players,
    rosterSize: draft.rosterSize,
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

  return NextResponse.json({
    teamStats,
    auctionResults,
    watchlist: watchlistEntries.map((entry) => entry.playerId),
    nominated: nominatedEntries.map((entry) => entry.playerId),
    ownerHandle: draft.ownerTeam?.handle ?? null,
    targetRoster:
      (draft.targetRoster as Partial<Record<Position, number>> | null) ?? DEFAULT_TARGET_ROSTER,
  });
}
