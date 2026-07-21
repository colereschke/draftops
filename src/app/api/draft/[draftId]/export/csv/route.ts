import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { getDraft } from '@/lib/draft';
import { serializeDraftCsv } from '@/lib/draftExport';

function attachmentHeaders(draftId: number): HeadersInit {
  const date = new Date().toISOString().slice(0, 10);
  return {
    'Cache-Control': 'no-store',
    'Content-Disposition': `attachment; filename="draft-${draftId}-${date}.csv"`,
    'Content-Type': 'text/csv; charset=utf-8',
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

  const bids = await prisma.auctionResult.findMany({
    where: { draftId, deletedAt: null },
    include: { team: { select: { id: true, handle: true, displayName: true } } },
    orderBy: { id: 'asc' },
  });

  return new NextResponse(serializeDraftCsv(bids), { headers: attachmentHeaders(draftId) });
}
