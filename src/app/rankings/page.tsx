import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import RankingsUploadForm from '@/components/RankingsUpload/RankingsUploadForm';
import ResolveUnmatchedList from '@/components/RankingsUpload/ResolveUnmatchedList';

export default async function RankingsPage() {
  const session = await auth();
  if (!session) redirect('/sign-in');

  const rankingSet = await prisma.userRankingSet.findUnique({
    where: { userId: session.user.id },
    include: { players: true },
  });

  const unmatched = rankingSet?.players.filter((p) => p.matchStatus === 'unmatched') ?? [];
  const sleeperPlayers =
    unmatched.length > 0
      ? await prisma.sleeperPlayer.findMany({
          select: { id: true, name: true, normalizedName: true, team: true, pos: true },
          orderBy: { name: 'asc' },
        })
      : [];

  return (
    <main style={{ padding: '2rem', maxWidth: '720px', margin: '0 auto' }}>
      <h1
        style={{
          fontFamily: 'var(--font-barlow)',
          fontSize: '1.5rem',
          color: 'var(--text-primary)',
          marginBottom: '1.5rem',
        }}
      >
        Custom Rankings
      </h1>
      <RankingsUploadForm
        summary={
          rankingSet
            ? {
                fileName: rankingSet.fileName,
                uploadedAt: rankingSet.uploadedAt.toISOString(),
                totalCount: rankingSet.players.length,
                matchedCount: rankingSet.players.filter(
                  (p) => p.matchStatus === 'matched' || p.matchStatus === 'manual',
                ).length,
                unmatchedCount: unmatched.length,
              }
            : null
        }
      />
      {unmatched.length > 0 && (
        <ResolveUnmatchedList
          unmatchedPlayers={unmatched.map((p) => ({
            id: p.id,
            name: p.name,
            team: p.team,
            pos: p.pos,
          }))}
          sleeperPlayers={sleeperPlayers}
        />
      )}
    </main>
  );
}
