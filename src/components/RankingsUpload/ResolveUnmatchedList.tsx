'use client';

import { useMemo, useState, useTransition } from 'react';
import { Command, CommandInput, CommandList, CommandItem } from '@/components/ui/command';
import { resolveRankingMatch } from '@/lib/rankings-actions';
import { normalizeName } from '@/lib/sleeperNormalize';
import ErrorText from './ErrorText';

export interface UnmatchedRankingPlayer {
  id: number;
  name: string;
  team: string;
  pos: string;
}

export interface SleeperPlayerOption {
  id: string;
  name: string;
  normalizedName: string;
  team: string;
  pos: string;
}

interface ResolveUnmatchedListProps {
  unmatchedPlayers: UnmatchedRankingPlayer[];
  sleeperPlayers: SleeperPlayerOption[];
}

export default function ResolveUnmatchedList({
  unmatchedPlayers,
  sleeperPlayers,
}: ResolveUnmatchedListProps) {
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
          sleeperPlayers={sleeperPlayers}
          onResolved={() => setResolvedIds((prev) => new Set(prev).add(player.id))}
        />
      ))}
    </div>
  );
}

function UnmatchedRow({
  player,
  sleeperPlayers,
  onResolved,
}: {
  player: UnmatchedRankingPlayer;
  sleeperPlayers: SleeperPlayerOption[];
  onResolved: () => void;
}) {
  const [search, setSearch] = useState('');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const results = useMemo(() => {
    if (!search.trim()) return [];
    const q = normalizeName(search);
    if (!q) return [];
    return sleeperPlayers
      .filter((candidate) => candidate.pos === player.pos && candidate.normalizedName.includes(q))
      .slice(0, 8);
  }, [player.pos, search, sleeperPlayers]);

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
          value={search}
          onValueChange={setSearch}
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
