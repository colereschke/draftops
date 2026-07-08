'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { Player } from '@/types';
import { POS_COLORS } from '@/lib/posColors';
import { Command, CommandInput, CommandList, CommandItem } from '@/components/ui/command';

interface WatchlistSidebarProps {
  players: Player[];
  nominated: string[];
  watchlist: string[];
  wonNames: Set<string>;
  onAddToWatchlist: (playerName: string) => void;
  onRemoveFromWatchlist: (playerName: string) => void;
  onUnNominate: (playerName: string) => void;
}

export default function WatchlistSidebar({
  players,
  nominated,
  watchlist,
  wonNames,
  onAddToWatchlist,
  onRemoveFromWatchlist,
  onUnNominate,
}: WatchlistSidebarProps) {
  const [search, setSearch] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const watchlistSet = useMemo(() => new Set(watchlist), [watchlist]);
  const nominatedSet = useMemo(() => new Set(nominated), [nominated]);

  const searchResults = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.toLowerCase();
    return players
      .filter(
        (p) =>
          !wonNames.has(p.player) && !watchlistSet.has(p.player) && !nominatedSet.has(p.player),
      )
      .filter((p) => p.player.toLowerCase().includes(q) || p.team.toLowerCase().includes(q))
      .slice(0, 8);
  }, [search, players, wonNames, watchlistSet, nominatedSet]);

  return (
    <div className="flex w-full flex-col gap-3 border-b border-border-subtle bg-card px-3 py-4 md:w-60 md:min-w-60 md:border-r md:border-b-0">
      <div>
        <div className="font-label mb-3 text-[10px] tracking-[2.5px] text-muted-foreground uppercase">
          Live Rail
        </div>
        <div className="font-label mb-1.5 text-[10px] tracking-[2px] text-foreground uppercase">
          In Auction
        </div>
        <div className="flex flex-col gap-1.5">
          {nominated.length === 0 ? (
            <div className="text-[11px] leading-relaxed text-muted-foreground">
              No players currently nominated
            </div>
          ) : (
            nominated.map((name) => {
              const p = players.find((pl) => pl.player === name);
              return (
                <div
                  key={name}
                  className="flex items-center gap-1.5 rounded-[5px] border border-border-subtle bg-muted px-2 py-1.5"
                  style={{ borderLeft: '3px solid var(--primary)' }}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-semibold text-foreground">{name}</div>
                    {p && (
                      <div className="font-mono text-[10px] text-muted-foreground">
                        {p.pos} · ${p.budget}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => onUnNominate(name)}
                    title="Remove from in auction"
                    aria-label={`Remove ${name} from in auction`}
                    className="shrink-0 text-muted-foreground transition-colors hover:text-primary"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="mt-1 border-t border-border-subtle" />

      <div className="font-label text-[10px] tracking-[2px] text-muted-foreground uppercase">
        My Watchlist
      </div>

      {/* Search-to-add */}
      <div ref={wrapperRef} className="relative">
        <Command shouldFilter={false} className="rounded-[5px] border border-border bg-muted">
          <CommandInput
            value={search}
            onValueChange={setSearch}
            placeholder="Add player I want..."
          />
          {search.trim() !== '' && searchResults.length > 0 && (
            <CommandList className="absolute top-full right-0 left-0 z-10 mt-1 rounded-[5px] border border-border bg-popover">
              {searchResults.map((p) => (
                <CommandItem
                  key={p.player}
                  value={p.player}
                  onSelect={() => {
                    onAddToWatchlist(p.player);
                    setSearch('');
                  }}
                >
                  <span className="font-semibold text-foreground">{p.player}</span>
                  <span className="ml-1.5 font-mono text-[10px] text-muted-foreground">
                    {p.pos} · ${p.budget}
                  </span>
                </CommandItem>
              ))}
            </CommandList>
          )}
        </Command>
      </div>

      {/* Watchlist entries */}
      <div className="flex flex-col gap-1.5 overflow-y-auto">
        {watchlist.length === 0 ? (
          <div className="text-[11px] leading-relaxed text-muted-foreground">
            No players marked — add players you still want to win
          </div>
        ) : (
          watchlist.map((name) => {
            const p = players.find((pl) => pl.player === name);
            const accent = p ? POS_COLORS[p.pos].accent : '#4a5168';
            return (
              <div
                key={name}
                className="flex items-center gap-1.5 rounded-[5px] border border-border-subtle bg-muted px-2 py-1.5"
                style={{ borderLeft: `3px solid ${accent}` }}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-semibold text-foreground">{name}</div>
                  {p && (
                    <div className="font-mono text-[10px] text-muted-foreground">
                      {p.pos} · ${p.budget}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => onRemoveFromWatchlist(name)}
                  title="Remove from watchlist"
                  aria-label={`Remove ${name} from watchlist`}
                  className="shrink-0 text-muted-foreground transition-colors hover:text-destructive"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
