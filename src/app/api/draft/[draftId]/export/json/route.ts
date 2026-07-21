import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getPrisma } from '@/lib/db';
import { getDraft } from '@/lib/draft';
import { serializeDraftExport } from '@/lib/draftExport';

function attachmentHeaders(draftId: number, extension: 'json' | 'csv'): HeadersInit {
  const date = new Date().toISOString().slice(0, 10);
  return {
    'Cache-Control': 'no-store',
    'Content-Disposition': `attachment; filename="draft-${draftId}-${date}.${extension}"`,
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ draftId: string }> },
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const draftId = Number.parseInt((await params).draftId, 10);
  if (!Number.isSafeInteger(draftId))
    return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const draft = await getDraft(session.user.id, draftId);
  if (!draft) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const [bids, auditEvents, completionSnapshot] = await Promise.all([
    getPrisma().auctionResult.findMany({
      where: { draftId, deletedAt: null },
      include: { team: { select: { id: true, handle: true, displayName: true } } },
      orderBy: { id: 'asc' },
    }),
    getPrisma().bidAuditEvent.findMany({
      where: { draftId },
      orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
    }),
    getPrisma().draftCompletionSnapshot.findUnique({ where: { draftId } }),
  ]);

  const body = JSON.stringify(
    serializeDraftExport({
      draft: {
        id: draft.id,
        name: draft.name,
        status: draft.status,
        budget: draft.budget,
        teamCount: draft.teamCount,
        rosterSize: draft.rosterSize,
        playerValueSourceBudget: draft.playerValueSourceBudget,
        startingLineup: draft.startingLineup,
        scoringSettings: draft.scoringSettings,
        targetRoster: draft.targetRoster,
        futurePickAuctionMode: draft.futurePickAuctionMode,
        sleeperLeagueId: draft.sleeperLeagueId,
        activeProjectionValueSetId: draft.activeProjectionValueSetId,
      },
      bids,
      auditEvents,
      completionSnapshot,
    }),
  );

  return new NextResponse(body, {
    headers: {
      ...attachmentHeaders(draftId, 'json'),
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}
