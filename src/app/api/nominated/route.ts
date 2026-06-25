import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { playerName?: string };
  if (!body.playerName) {
    return NextResponse.json({ error: 'playerName required' }, { status: 400 });
  }
  const entry = await prisma.nominatedPlayer.upsert({
    where: { playerName: body.playerName },
    create: { playerName: body.playerName },
    update: {},
  });
  return NextResponse.json({ playerName: entry.playerName });
}

export async function DELETE(request: NextRequest) {
  const body = (await request.json()) as { playerName?: string };
  if (!body.playerName) {
    return NextResponse.json({ error: 'playerName required' }, { status: 400 });
  }
  try {
    await prisma.nominatedPlayer.delete({ where: { playerName: body.playerName } });
  } catch {
    // Already deleted — idempotent
  }
  return NextResponse.json({ ok: true });
}
