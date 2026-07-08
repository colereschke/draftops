import type { Session } from 'next-auth';
import { signOut } from '@/auth';
import { Button } from '@/components/ui/button';
import NavLinks from './NavLinks';

export default function NavBar({ session }: { session: Session | null }) {
  return (
    <div className="bg-card gap-x-lg gap-y-xs px-lg py-sm sticky top-0 z-50 flex flex-wrap items-center justify-between">
      <span className="font-label text-label-lg text-foreground font-bold tracking-wide uppercase">
        DraftOps
      </span>
      <div className="gap-lg flex items-center">
        <NavLinks />
        <a
          href="https://github.com/colereschke/draftops/issues/new?template=feedback.yml"
          target="_blank"
          rel="noopener noreferrer"
          className="font-label text-label-md text-muted-foreground font-bold tracking-wide uppercase no-underline"
        >
          Feedback
        </a>
        {session && (
          <div className="gap-md flex items-center">
            <span className="font-label text-label-md text-muted-foreground font-bold tracking-wide uppercase">
              {session.user?.name}
            </span>
            <form
              action={async () => {
                'use server';
                await signOut({ redirectTo: '/sign-in' });
              }}
            >
              <Button
                type="submit"
                variant="ghost"
                size="sm"
                className="font-label text-label-md text-muted-foreground h-auto p-0 font-bold tracking-wide uppercase"
              >
                Sign out
              </Button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
