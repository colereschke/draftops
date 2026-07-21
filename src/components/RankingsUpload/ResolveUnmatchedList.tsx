'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { Command, CommandInput, CommandList, CommandItem } from '@/components/ui/command';
import { resolveRankingMatch } from '@/lib/rankings-actions';
import { normalizeName } from '@/lib/sleeperNormalize';
import type { SleeperSearchResponse, SleeperSearchResult } from '@/lib/sleeperSearch';
import ErrorText from './ErrorText';

export interface UnmatchedRankingPlayer {
  id: number;
  name: string;
  team: string;
  pos: string;
}

export type SleeperPlayerOption = SleeperSearchResult;

interface ResolveUnmatchedListProps {
  unmatchedPlayers: UnmatchedRankingPlayer[];
}

interface UnmatchedRowProps {
  player: UnmatchedRankingPlayer;
  onResolved: () => void;
}

export default function ResolveUnmatchedList({ unmatchedPlayers }: ResolveUnmatchedListProps) {
  const [resolvedIds, setResolvedIds] = useState<Set<number>>(new Set());
  const remaining = unmatchedPlayers.filter((p) => !resolvedIds.has(p.id));

  return (
    <div style={{ background: 'var(--bg-surface)', borderRadius: '6px', padding: '1.25rem' }}>
      <div
        style={{
          fontFamily: 'var(--font-barlow)',
          fontSize: '0.8rem',
          color: 'var(--text-secondary)',
          marginBottom: '0.75rem',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        Resolve unmatched ({remaining.length})
      </div>
      {remaining.map((player) => (
        <UnmatchedRow
          key={player.id}
          player={player}
          onResolved={() => setResolvedIds((prev) => new Set(prev).add(player.id))}
        />
      ))}
    </div>
  );
}

function UnmatchedRow({ player, onResolved }: UnmatchedRowProps) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<SleeperPlayerOption[]>([]);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);

  useEffect(() => {
    const query = normalizeName(search);
    if (query.length < 2 || !['QB', 'RB', 'WR', 'TE'].includes(player.pos)) {
      return;
    }
    const controller = new AbortController();
    const request = ++requestRef.current;
    const timer = setTimeout(() => {
      void fetch(
        `/api/rankings/sleeper-search?q=${encodeURIComponent(query)}&position=${player.pos}`,
        {
          signal: controller.signal,
        },
      )
        .then(async (response) => {
          if (!response.ok) throw new Error('Search failed');
          return response.json() as Promise<SleeperSearchResponse>;
        })
        .then((data) => {
          if (request === requestRef.current) setResults(data.results);
        })
        .catch((fetchError: unknown) => {
          if (
            typeof fetchError === 'object' &&
            fetchError !== null &&
            'name' in fetchError &&
            fetchError.name === 'AbortError'
          ) {
            return;
          }
          if (request === requestRef.current) {
            setResults([]);
            setError('Unable to search Sleeper players. Try again.');
          }
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [player.pos, search]);

  function pick(sleeperId: string) {
    setError(null);
    startTransition(async () => {
      try {
        await resolveRankingMatch(player.id, sleeperId);
        onResolved();
      } catch {
        setError('Failed to resolve — try again.');
      }
    });
  }

  function updateSearch(value: string) {
    setSearch(value);
    setError(null);
    if (normalizeName(value).length < 2) setResults([]);
  }

  return (
    <div
      data-testid={`unmatched-row-${player.id}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.35rem',
        marginBottom: '0.75rem',
        paddingBottom: '0.75rem',
        borderBottom: '1px solid #2a2f3e',
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          color: 'var(--text-primary)',
          fontSize: '0.875rem',
        }}
      >
        {player.name} · {player.team} · {player.pos}
      </span>
      <Command shouldFilter={false}>
        <CommandInput
          data-testid={`unmatched-search-${player.id}`}
          placeholder="Search Sleeper players…"
          aria-label={`Search Sleeper players to match ${player.name}`}
          autoComplete="off"
          value={search}
          onValueChange={updateSearch}
        />
        <CommandList>
          {results.map((r) => (
            <CommandItem
              key={r.id}
              data-testid={`unmatched-result-${r.id}`}
              onSelect={() => pick(r.id)}
              disabled={isPending}
            >
              {r.name} · {r.team || 'FA'} · {r.pos}
            </CommandItem>
          ))}
        </CommandList>
      </Command>
      {error && <ErrorText messages={[error]} />}
    </div>
  );
}
