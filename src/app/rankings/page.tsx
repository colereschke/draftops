import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import RankingsUploadForm from '@/components/RankingsUpload/RankingsUploadForm';
import ResolveUnmatchedList from '@/components/RankingsUpload/ResolveUnmatchedList';
import MissingFromEtrList from '@/components/RankingsUpload/MissingFromEtrList';
import { computeMissingFromEtr, ETR_SKILL_PLAYERS } from '@/lib/rankingsCoverage';

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

  const missingFromEtr = rankingSet
    ? computeMissingFromEtr(rankingSet.players.map((p) => p.name))
    : [];

  return (
    <main
      id="main-content"
      tabIndex={-1}
      style={{ padding: '2rem', maxWidth: '720px', margin: '0 auto' }}
    >
      <Link
        href="/drafts"
        style={{
          display: 'inline-block',
          marginBottom: '1rem',
          color: 'var(--text-secondary)',
          fontFamily: 'var(--font-barlow)',
          fontSize: '0.8rem',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        ← All Drafts
      </Link>
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
                etrCoverage: {
                  covered: ETR_SKILL_PLAYERS.length - missingFromEtr.length,
                  total: ETR_SKILL_PLAYERS.length,
                },
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
      {rankingSet && <MissingFromEtrList names={missingFromEtr.map((p) => p.player)} />}
    </main>
  );
}
