import Link from 'next/link';
import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { completeDraft } from '@/lib/actions';
import FirstRunWelcome from '@/components/Onboarding/FirstRunWelcome';
import { isFirstDraftOnboardingEligible } from '@/lib/onboarding';

export default async function DraftsPage() {
  const session = await auth();
  if (!session) redirect('/sign-in');

  const [drafts, onboardingEligible] = await Promise.all([
    prisma.draft.findMany({
      where: { ownerId: session.user.id },
      select: {
        id: true,
        name: true,
        status: true,
        createdAt: true,
        _count: { select: { teams: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    isFirstDraftOnboardingEligible(session.user.id),
  ]);

  const activeDrafts = drafts.filter((d) => d.status === 'ACTIVE');
  const completeDrafts = drafts.filter((d) => d.status === 'COMPLETE');

  return (
    <main
      id="main-content"
      tabIndex={-1}
      style={{ padding: '2rem', maxWidth: '720px', margin: '0 auto' }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1.5rem',
        }}
      >
        <h1
          style={{
            fontFamily: 'var(--font-barlow)',
            fontSize: '1.5rem',
            color: 'var(--text-primary)',
            margin: 0,
          }}
        >
          My Drafts
        </h1>
        <Link
          href="/drafts/new"
          style={{
            background: 'var(--pos-qb)',
            color: '#fff',
            padding: '0.4rem 1rem',
            borderRadius: '4px',
            fontFamily: 'var(--font-barlow)',
            textDecoration: 'none',
            fontSize: '0.875rem',
          }}
        >
          + Create Draft
        </Link>
      </div>

      <FirstRunWelcome eligible={onboardingEligible} />

      {drafts.length === 0 && (
        <p style={{ color: 'var(--text-secondary)', textAlign: 'center', marginTop: '3rem' }}>
          No drafts yet.{' '}
          <Link href="/drafts/new" style={{ color: 'var(--pos-qb)' }}>
            Create your first draft.
          </Link>
        </p>
      )}

      {activeDrafts.length > 0 && (
        <section>
          {activeDrafts.map((draft) => (
            <DraftRow key={draft.id} draft={draft} showComplete />
          ))}
        </section>
      )}

      {completeDrafts.length > 0 && (
        <section>
          {activeDrafts.length > 0 && (
            <div
              style={{
                borderTop: '1px solid var(--border)',
                margin: '1.5rem 0',
              }}
            />
          )}
          <p
            style={{
              fontFamily: 'var(--font-barlow)',
              fontSize: '0.75rem',
              color: 'var(--text-secondary)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              margin: '0 0 0.75rem',
            }}
          >
            Completed
          </p>
          {completeDrafts.map((draft) => (
            <DraftRow key={draft.id} draft={draft} showComplete={false} />
          ))}
        </section>
      )}
    </main>
  );
}

interface DraftRowProps {
  draft: {
    id: number;
    name: string;
    status: 'ACTIVE' | 'COMPLETE';
    createdAt: Date;
    _count: { teams: number };
  };
  showComplete: boolean;
}

function DraftRow({ draft, showComplete }: DraftRowProps) {
  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        borderRadius: '6px',
        padding: '1rem 1.25rem',
        marginBottom: '0.75rem',
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
      }}
    >
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontFamily: 'var(--font-barlow)',
            fontSize: '1rem',
            color: 'var(--text-primary)',
          }}
        >
          {draft.name}
        </div>
        <div
          style={{
            fontSize: '0.75rem',
            color: 'var(--text-secondary)',
            marginTop: '0.25rem',
            fontFamily: 'var(--font-mono)',
          }}
        >
          {draft._count.teams} teams &middot; {new Date(draft.createdAt).toLocaleDateString()}
        </div>
      </div>

      <span
        style={{
          fontSize: '0.7rem',
          fontFamily: 'var(--font-barlow)',
          padding: '0.15rem 0.5rem',
          borderRadius: '3px',
          background: draft.status === 'ACTIVE' ? 'var(--pos-rb)' : 'var(--text-secondary)',
          color: '#fff',
          textTransform: 'uppercase',
        }}
      >
        {draft.status}
      </span>

      <Link
        href={`/draft/${draft.id}`}
        style={{
          color: 'var(--pos-qb)',
          fontFamily: 'var(--font-barlow)',
          fontSize: '0.875rem',
          textDecoration: 'none',
        }}
      >
        Open
      </Link>

      {showComplete && (
        <form action={completeDraft.bind(null, draft.id)}>
          <button
            type="submit"
            style={{
              background: 'none',
              border: '1px solid var(--text-secondary)',
              color: 'var(--text-secondary)',
              borderRadius: '4px',
              padding: '0.2rem 0.6rem',
              fontFamily: 'var(--font-barlow)',
              fontSize: '0.8rem',
              cursor: 'pointer',
            }}
          >
            Mark Complete
          </button>
        </form>
      )}
    </div>
  );
}
