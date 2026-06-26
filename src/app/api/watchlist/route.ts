import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await request.json()) as { playerName?: string };
  if (!body.playerName) {
    return NextResponse.json({ error: 'playerName required' }, { status: 400 });
  }
  const entry = await prisma.playerWatchlist.upsert({
    where: { playerName: body.playerName },
    create: { playerName: body.playerName },
    update: {},
  });
  return NextResponse.json({ playerName: entry.playerName });
}

export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await request.json()) as { playerName?: string };
  if (!body.playerName) {
    return NextResponse.json({ error: 'playerName required' }, { status: 400 });
  }
  try {
    await prisma.playerWatchlist.delete({ where: { playerName: body.playerName } });
  } catch {
    // Already deleted — idempotent
  }
  return NextResponse.json({ ok: true });
}
