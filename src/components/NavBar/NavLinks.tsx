'use client';

import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ChevronDownIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface DraftInfo {
  id: number;
  name: string;
}

interface NavLinksProps {
  // 'inline' renders today's desktop row (links + draft-switcher pill).
  // 'menu' renders bare DropdownMenuItems meant to be composed inside an
  // already-open parent menu (the mobile hamburger in NavBar).
  variant?: 'inline' | 'menu';
}

export default function NavLinks({ variant = 'inline' }: NavLinksProps) {
  const pathname = usePathname();
  const params = useParams();
  const draftIdParam = params?.draftId;
  const draftId = typeof draftIdParam === 'string' ? parseInt(draftIdParam, 10) : null;
  const hasDraftId = draftId !== null && !isNaN(draftId);

  const [activeDrafts, setActiveDrafts] = useState<DraftInfo[]>([]);
  const [currentDraftName, setCurrentDraftName] = useState<string | null>(null);

  useEffect(() => {
    if (!hasDraftId) return;
    void (async () => {
      const r = await fetch('/api/drafts');
      if (!r.ok) return;
      const drafts: DraftInfo[] = await r.json();
      setActiveDrafts(drafts);
      const current = drafts.find((d) => d.id === draftId);
      if (current) {
        setCurrentDraftName(current.name);
      } else {
        // Current draft not in active list (e.g. COMPLETE) — fetch its name directly.
        const r2 = await fetch(`/api/draft/${draftId}/info`);
        if (!r2.ok) return;
        const info: { name: string } = await r2.json();
        setCurrentDraftName(info.name);
      }
    })();
  }, [draftId, hasDraftId]);

  const LINKS = hasDraftId
    ? [
        { href: `/draft/${draftId}`, label: 'Value Sheet' },
        { href: `/draft/${draftId}/teams`, label: 'Team Rosters' },
        { href: `/draft/${draftId}/budget`, label: 'Budget Pressure' },
        { href: `/draft/${draftId}/nominate`, label: 'Nominate' },
      ]
    : [];

  const otherDrafts = activeDrafts.filter((d) => d.id !== draftId);

  if (variant === 'menu') {
    // Nothing to show outside a draft — skip rendering so the caller doesn't end up
    // with a leading separator over an empty section.
    if (LINKS.length === 0) return null;
    return (
      <>
        {LINKS.map(({ href, label }) => {
          const active = pathname === href;
          return (
            <DropdownMenuItem
              key={href}
              render={<Link href={href} />}
              className={cn(
                'font-label text-label-sm font-bold tracking-wide uppercase',
                active ? 'text-foreground' : 'text-muted-foreground',
              )}
            >
              {label}
            </DropdownMenuItem>
          );
        })}
        {hasDraftId && currentDraftName && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel className="font-label text-label-sm tracking-wide uppercase">
                {currentDraftName}
              </DropdownMenuLabel>
              {otherDrafts.map((d) => (
                <DropdownMenuItem
                  key={d.id}
                  render={<Link href={`/draft/${d.id}`} />}
                  className="font-label text-label-sm"
                >
                  {d.name}
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem
                render={<Link href="/drafts" />}
                className="font-label text-label-sm text-muted-foreground"
              >
                All Drafts
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </>
        )}
        <DropdownMenuSeparator />
      </>
    );
  }

  return (
    <nav className="gap-lg flex flex-wrap items-center">
      {LINKS.map(({ href, label }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              'nav-link font-label text-label-md px-1 font-bold tracking-wide uppercase no-underline',
              active ? 'text-foreground' : 'text-muted-foreground',
            )}
          >
            {label}
          </Link>
        );
      })}

      {hasDraftId && currentDraftName && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="secondary"
                size="sm"
                className="font-label text-label-sm border-border gap-1 border font-bold tracking-wide uppercase"
              />
            }
          >
            {currentDraftName}
            <ChevronDownIcon className="size-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-40">
            {otherDrafts.map((d) => (
              <DropdownMenuItem
                key={d.id}
                render={<Link href={`/draft/${d.id}`} />}
                className="font-label text-label-sm"
              >
                {d.name}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              render={<Link href="/drafts" />}
              className="font-label text-label-sm text-muted-foreground"
            >
              All Drafts
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </nav>
  );
}
