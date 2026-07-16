import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { getDraft } from '@/lib/draft';
import { DraftMutationError, requirePlayerNotWon } from '@/lib/draftMutationGuard';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ draftId: string }> },
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const draftId = parseInt((await params).draftId, 10);
  const draft = await getDraft(session.user.id, draftId);
  if (!draft) return NextResponse.json({ error: 'No draft found' }, { status: 404 });

  const body = (await request.json()) as { playerId?: number };
  if (typeof body.playerId !== 'number') {
    return NextResponse.json({ error: 'playerId required' }, { status: 400 });
  }
  const player = await prisma.player.findFirst({
    where: { id: body.playerId, draftId: draft.id },
    select: { id: true, name: true },
  });
  if (!player) return NextResponse.json({ error: 'Player not found' }, { status: 404 });

  try {
    await requirePlayerNotWon(draft.id, player.id);
  } catch (e) {
    if (e instanceof DraftMutationError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }

  const entry = await prisma.nominatedPlayer.upsert({
    where: { playerId_draftId: { playerId: player.id, draftId: draft.id } },
    create: { playerId: player.id, playerName: player.name, draftId: draft.id },
    update: { playerName: player.name },
  });
  return NextResponse.json({ playerId: entry.playerId, playerName: entry.playerName });
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

  const body = (await request.json()) as { playerId?: number };
  if (typeof body.playerId !== 'number') {
    return NextResponse.json({ error: 'playerId required' }, { status: 400 });
  }
  try {
    await prisma.nominatedPlayer.delete({
      where: { playerId_draftId: { playerId: body.playerId, draftId: draft.id } },
    });
  } catch (e) {
    if ((e as { code?: string }).code !== 'P2025') {
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  }
  return NextResponse.json({ ok: true });
}
