import { auth, signIn } from '@/auth';
import { redirect } from 'next/navigation';

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const [session, params] = await Promise.all([auth(), searchParams]);
  if (session) redirect('/');

  const raw = params.callbackUrl ?? '/';
  const callbackUrl = raw.startsWith('/') ? raw : '/';

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg-base, #0a0d14)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          background: 'var(--bg-surface, #141824)',
          borderRadius: 8,
          padding: '40px 48px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 24,
          minWidth: 280,
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-barlow), sans-serif',
            fontWeight: 700,
            fontSize: 22,
            letterSpacing: 3,
            color: 'var(--text-primary, #e8eaf0)',
            textTransform: 'uppercase',
          }}
        >
          DraftOps
        </span>
        <form
          action={async () => {
            'use server';
            await signIn('discord', { redirectTo: callbackUrl });
          }}
        >
          <button
            type="submit"
            style={{
              background: '#5865F2',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              padding: '10px 28px',
              fontSize: 14,
              fontFamily: 'var(--font-inter), sans-serif',
              fontWeight: 600,
              cursor: 'pointer',
              letterSpacing: 0.5,
            }}
          >
            Sign in with Discord
          </button>
        </form>
      </div>
    </div>
  );
}
