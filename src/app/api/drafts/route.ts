import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getActiveDraftsForUser } from '@/lib/draft';

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const drafts = await getActiveDraftsForUser(session.user.id);
  return NextResponse.json(drafts);
}
