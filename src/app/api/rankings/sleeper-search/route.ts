import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getPrisma } from '@/lib/db';
import { normalizeName } from '@/lib/sleeperNormalize';
import { isSleeperSearchPosition, type SleeperSearchResponse } from '@/lib/sleeperSearch';

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const query = normalizeName(request.nextUrl.searchParams.get('q') ?? '');
  const position = request.nextUrl.searchParams.get('position') ?? '';
  if (query.length < 2 || query.length > 80) {
    return NextResponse.json({ error: 'Invalid search query' }, { status: 400 });
  }
  if (!isSleeperSearchPosition(position)) {
    return NextResponse.json({ error: 'Invalid position' }, { status: 400 });
  }

  try {
    const results = await getPrisma().sleeperPlayer.findMany({
      where: { normalizedName: { contains: query }, pos: position },
      select: { id: true, name: true, team: true, pos: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: 8,
    });
    return NextResponse.json<SleeperSearchResponse>({
      results: results.map((result) => ({ ...result, pos: position })),
    });
  } catch {
    return NextResponse.json({ error: 'Unable to search players' }, { status: 500 });
  }
}
