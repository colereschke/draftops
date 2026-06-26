import type { Session } from 'next-auth';
import { signOut } from '@/auth';
import NavLinks from './NavLinks';

export default function NavBar({ session }: { session: Session | null }) {
  return (
    <div
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        background: 'var(--bg-surface, #141824)',
        padding: '6px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '4px 20px',
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-barlow), sans-serif',
          fontWeight: 700,
          fontSize: 15,
          letterSpacing: 1.5,
          color: '#e8eaf0',
          textTransform: 'uppercase',
        }}
      >
        DraftOps
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        <NavLinks />
        {session && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span
              style={{
                fontFamily: 'var(--font-barlow), sans-serif',
                fontWeight: 700,
                fontSize: 13,
                letterSpacing: 1,
                textTransform: 'uppercase',
                color: '#4a5168',
              }}
            >
              {session.user?.name}
            </span>
            <form
              action={async () => {
                'use server';
                await signOut({ redirectTo: '/sign-in' });
              }}
            >
              <button
                type="submit"
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-barlow), sans-serif',
                  fontWeight: 700,
                  fontSize: 13,
                  letterSpacing: 1,
                  textTransform: 'uppercase',
                  color: '#4a5168',
                  padding: 0,
                }}
              >
                Sign out
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
