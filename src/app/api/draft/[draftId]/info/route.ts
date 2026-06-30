import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ draftId: string }> },
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const draftId = parseInt((await params).draftId, 10);
  const draft = await prisma.draft.findFirst({
    where: { id: draftId, ownerId: session.user.id },
    select: { id: true, name: true, status: true },
  });
  if (!draft) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json(draft);
}
