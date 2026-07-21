import type { Session } from 'next-auth';
import Link from 'next/link';
import { ChevronDownIcon, LogOutIcon, Menu } from 'lucide-react';
import LogoLockup from '@/components/Brand/LogoLockup';
import { signOut } from '@/auth';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import NavLinks from './NavLinks';

const FEEDBACK_URL = 'https://github.com/colereschke/draftops/issues/new?template=feedback.yml';

export default function NavBar({ session }: { session: Session | null }) {
  return (
    <div className="bg-card gap-x-lg gap-y-xs px-lg py-sm sticky top-0 z-50 flex flex-wrap items-center justify-between">
      <Link href="/" data-testid="nav-logo-link">
        <LogoLockup />
      </Link>

      {/* Desktop: full inline nav, unchanged from before the mobile pass. */}
      <div className="gap-lg hidden items-center md:flex">
        <NavLinks />
        <a
          href={FEEDBACK_URL}
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
              <DropdownMenuItem
                render={<Link href="/rankings" prefetch={false} />}
                className="font-label text-label-sm w-full font-bold tracking-wide uppercase"
              >
                Rankings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
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

      {/* Mobile: single hamburger folding links, draft picker, feedback, and sign out. */}
      <div className="flex items-center md:hidden">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                aria-label="Open menu"
                data-testid="mobile-nav-menu"
              />
            }
          >
            <Menu className="size-5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-48">
            <NavLinks variant="menu" />
            <DropdownMenuItem
              render={<a href={FEEDBACK_URL} target="_blank" rel="noopener noreferrer" />}
              className="font-label text-label-sm font-bold tracking-wide uppercase"
            >
              Feedback
            </DropdownMenuItem>
            {session && (
              <DropdownMenuItem
                render={
                  <Link href="/rankings" prefetch={false} data-testid="mobile-nav-rankings" />
                }
                className="font-label text-label-sm font-bold tracking-wide uppercase"
              >
                Rankings
              </DropdownMenuItem>
            )}
            {session && (
              <>
                <DropdownMenuSeparator />
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
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
