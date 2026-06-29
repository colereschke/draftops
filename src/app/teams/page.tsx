import { prisma } from '@/lib/db';
import { computeTeamStats } from '@/lib/computeTeamStats';
import RosterTracker from '@/components/RosterTracker';
import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { getDraftForUser } from '@/lib/draft';

export const dynamic = 'force-dynamic';

const NO_DRAFT_VIEW = (
  <div
    style={{
      background: '#0a0d14',
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#e05050',
      fontFamily: 'var(--font-inter), sans-serif',
      fontSize: 14,
    }}
  >
    No draft found. Run <code style={{ marginLeft: 4, marginRight: 4 }}>make setup</code> and ensure{' '}
    <code>OWNER_DISCORD_ID</code> is set in <code>.env.local</code>.
  </div>
);

export default async function TeamsPage() {
  const session = await auth();
  if (!session) redirect('/sign-in');

  const draft = await getDraftForUser(session.user.id);
  if (!draft) return NO_DRAFT_VIEW;

  let rawTeams;
  try {
    rawTeams = await prisma.team.findMany({
      where: { draftId: draft.id },
      include: { results: true },
      orderBy: { handle: 'asc' },
    });
  } catch {
    return (
      <div
        style={{
          background: '#0a0d14',
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#e05050',
          fontFamily: 'var(--font-inter), sans-serif',
          fontSize: 14,
        }}
      >
        Failed to load team data. Ensure the database is set up:{' '}
        <code style={{ marginLeft: 6, color: '#e8eaf0' }}>make setup</code>
      </div>
    );
  }

  return <RosterTracker teams={computeTeamStats(rawTeams)} />;
}
