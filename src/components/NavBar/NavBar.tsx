import type { Session } from 'next-auth';
import { ChevronDownIcon, LogOutIcon } from 'lucide-react';
import { signOut } from '@/auth';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="sm"
                  className="font-label text-label-md text-muted-foreground gap-1 px-1 font-bold tracking-wide uppercase hover:text-foreground"
                />
              }
            >
              {session.user?.name}
              <ChevronDownIcon className="size-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-36">
              <form
                action={async () => {
                  'use server';
                  await signOut({ redirectTo: '/sign-in' });
                }}
              >
                <DropdownMenuItem
                  nativeButton
                  render={<button type="submit" />}
                  className="font-label text-label-sm w-full font-bold tracking-wide uppercase"
                >
                  <LogOutIcon className="size-3.5" />
                  Sign out
                </DropdownMenuItem>
              </form>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}
