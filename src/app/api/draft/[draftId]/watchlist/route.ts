import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { getDraft } from '@/lib/draft';
import { DraftMutationError, requireAvailablePlayer } from '@/lib/draftMutationGuard';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ draftId: string }> },
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const draftId = parseInt((await params).draftId, 10);
  const draft = await getDraft(session.user.id, draftId);
  if (!draft) return NextResponse.json({ error: 'No draft found' }, { status: 404 });

  const body = (await request.json()) as { playerName?: string };
  if (!body.playerName) {
    return NextResponse.json({ error: 'playerName required' }, { status: 400 });
  }

  try {
    await requireAvailablePlayer(draft.id, body.playerName);
  } catch (e) {
    if (e instanceof DraftMutationError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }

  const entry = await prisma.playerWatchlist.upsert({
    where: { playerName_draftId: { playerName: body.playerName, draftId: draft.id } },
    create: { playerName: body.playerName, draftId: draft.id },
    update: {},
  });
  return NextResponse.json({ playerName: entry.playerName });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ draftId: string }> },
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const draftId = parseInt((await params).draftId, 10);
  const draft = await getDraft(session.user.id, draftId);
  if (!draft) return NextResponse.json({ error: 'No draft found' }, { status: 404 });

  const body = (await request.json()) as { playerName?: string };
  if (!body.playerName) {
    return NextResponse.json({ error: 'playerName required' }, { status: 400 });
  }
  try {
    await prisma.playerWatchlist.delete({
      where: { playerName_draftId: { playerName: body.playerName, draftId: draft.id } },
    });
  } catch (e) {
    if ((e as { code?: string }).code !== 'P2025') {
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  }
  return NextResponse.json({ ok: true });
}
