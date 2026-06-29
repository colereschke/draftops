import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { getDraftForUser } from '@/lib/draft';

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const draft = await getDraftForUser(session.user.id);
  if (!draft) return NextResponse.json({ error: 'No draft found' }, { status: 404 });

  const body = (await request.json()) as { playerName?: string };
  if (!body.playerName) {
    return NextResponse.json({ error: 'playerName required' }, { status: 400 });
  }
  const entry = await prisma.playerWatchlist.upsert({
    where: { playerName: body.playerName },
    create: { playerName: body.playerName, draftId: draft.id },
    update: {},
  });
  return NextResponse.json({ playerName: entry.playerName });
}

export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const draft = await getDraftForUser(session.user.id);
  if (!draft) return NextResponse.json({ error: 'No draft found' }, { status: 404 });

  const body = (await request.json()) as { playerName?: string };
  if (!body.playerName) {
    return NextResponse.json({ error: 'playerName required' }, { status: 400 });
  }
  try {
    await prisma.playerWatchlist.delete({ where: { playerName: body.playerName } });
  } catch (e) {
    if ((e as { code?: string }).code !== 'P2025') {
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  }
  return NextResponse.json({ ok: true });
}
