'use client';

import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import type { Player, ClaimedBid } from '@/types';
import { POS_COLORS } from '@/lib/posColors';
import { cn } from '@/lib/utils';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';

export type SortKey = keyof Player;

interface PlayerTableProps {
  players: Player[];
  showNotes: boolean;
  hasClaims: boolean;
  claimMap: Map<string, ClaimedBid>;
  nominatedSet: Set<string>;
  sortBy: SortKey;
  sortDir: 'asc' | 'desc';
  onSort: (col: SortKey) => void;
  onRowClick: (player: Player) => void;
}

const SORT_COLUMNS: Array<{ key: SortKey; label: string }> = [
  { key: 'sfRank', label: 'SF Rank' },
  { key: 'player', label: 'Player' },
  { key: 'pos', label: 'Pos' },
  { key: 'team', label: 'Team' },
  { key: 'age', label: 'Age' },
  { key: 'floor', label: '🔻 Floor' },
  { key: 'budget', label: '💰 Target' },
  { key: 'ceiling', label: '🔺 Ceiling' },
];

function ageColor(age: number | null): string {
  if (age === null) return 'var(--text-muted)';
  if (age <= 24) return 'var(--age-young)';
  if (age <= 27) return 'var(--age-prime)';
  if (age <= 30) return 'var(--age-aging)';
  return 'var(--age-old)';
}

interface SortIconProps {
  col: SortKey;
  sortBy: SortKey;
  sortDir: 'asc' | 'desc';
}

function SortIcon({ col, sortBy, sortDir }: SortIconProps) {
  if (sortBy !== col) return <ArrowUpDown className="ml-1 inline size-3.5 text-muted-foreground" />;
  return sortDir === 'asc' ? (
    <ArrowUp className="ml-1 inline size-3.5" style={{ color: 'var(--pos-wr)' }} />
  ) : (
    <ArrowDown className="ml-1 inline size-3.5" style={{ color: 'var(--pos-wr)' }} />
  );
}

export default function PlayerTable({
  players,
  showNotes,
  hasClaims,
  claimMap,
  nominatedSet,
  sortBy,
  sortDir,
  onSort,
  onRowClick,
}: PlayerTableProps) {
  return (
    <div className="overflow-x-auto px-5 pb-10">
      <Table className="mt-1.5">
        <TableHeader>
          <TableRow className="border-border hover:bg-transparent">
            {SORT_COLUMNS.map((col) => (
              <TableHead
                key={col.key}
                onClick={() => onSort(col.key)}
                className="font-label cursor-pointer border-none py-2 text-[10px] font-semibold tracking-wide whitespace-nowrap uppercase select-none text-muted-foreground"
                style={{
                  textAlign: col.key === 'player' ? 'left' : 'center',
                  color: sortBy === col.key ? 'var(--pos-wr)' : undefined,
                }}
              >
                {col.label}
                <SortIcon col={col.key} sortBy={sortBy} sortDir={sortDir} />
              </TableHead>
            ))}
            {showNotes && (
              <TableHead className="font-label border-none py-2 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                Notes
              </TableHead>
            )}
            {hasClaims && (
              <TableHead className="font-label border-none py-2 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                Claimed
              </TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {players.map((p, i) => {
            const c = POS_COLORS[p.pos];
            const isRookie = p.notes.toLowerCase().includes('rookie');
            const isPkg = p.pos === 'PKG';
            const isNominated = nominatedSet.has(p.player);
            const claim = claimMap.get(p.player);
            return (
              <TableRow
                key={p.player + i}
                onClick={() => onRowClick(p)}
                className={cn(
                  'cursor-pointer border-b-[#141824] hover:bg-card',
                  isNominated ? 'bg-[#0d1f1f]' : i % 2 !== 0 ? 'bg-[#0a0c10]' : undefined,
                )}
                style={{
                  borderLeft: `3px solid ${isNominated ? 'var(--pos-pick)' : c.accent}`,
                  opacity: claim ? 0.5 : 1,
                }}
              >
                <TableCell className="text-center font-mono text-[11px] text-muted-foreground tabular-nums">
                  {p.sfRank}
                </TableCell>
                <TableCell className="text-left">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="text-[13px]"
                      style={{
                        fontWeight: isPkg ? 700 : 600,
                        color: isPkg ? 'var(--pos-pkg)' : 'var(--text-primary)',
                      }}
                    >
                      {p.player}
                    </span>
                    {isRookie && (
                      <span
                        className="rounded-[3px] px-1 py-px text-[8px] font-bold tracking-wide uppercase"
                        style={{ background: '#3a2800', color: 'var(--pos-wr)' }}
                      >
                        R
                      </span>
                    )}
                    {isPkg && (
                      <span
                        className="rounded-[3px] px-1 py-px text-[8px] font-bold tracking-wide uppercase"
                        style={{ background: '#3a2a00', color: 'var(--pos-pkg)' }}
                      >
                        PKG
                      </span>
                    )}
                    {isNominated && (
                      <span
                        className="rounded-[3px] px-1 py-px text-[8px] font-bold tracking-wide uppercase"
                        style={{ background: '#0d2a2a', color: 'var(--pos-pick)' }}
                      >
                        LIVE
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-center">
                  <span
                    className="font-label inline-block rounded text-[9px] font-bold tracking-wide"
                    style={{ background: c.badge, color: c.badgeText, padding: '2px 6px' }}
                  >
                    {p.pos}
                  </span>
                </TableCell>
                <TableCell className="text-center text-[11px] text-secondary-fg">
                  {p.team}
                </TableCell>
                <TableCell
                  className="text-center font-mono text-[11px] tabular-nums"
                  style={{ color: ageColor(p.age) }}
                >
                  {p.age !== null ? p.age.toFixed(1) : '—'}
                </TableCell>
                <TableCell className="text-center font-mono text-xs text-secondary-fg tabular-nums">
                  ${p.floor}
                </TableCell>
                <TableCell
                  className="text-center font-mono text-sm font-bold tabular-nums"
                  style={{ color: c.accent }}
                >
                  ${p.budget}
                </TableCell>
                <TableCell
                  className="text-center font-mono text-xs tabular-nums"
                  style={{ color: 'var(--age-old)' }}
                >
                  ${p.ceiling}
                </TableCell>
                {showNotes && (
                  <TableCell className="max-w-[220px] whitespace-normal text-[10px] text-muted-foreground">
                    {p.notes || '—'}
                  </TableCell>
                )}
                {hasClaims &&
                  (claim ? (
                    <TableCell className="text-left whitespace-nowrap">
                      <span className="text-[11px] text-secondary-fg">{claim.teamHandle}</span>
                      <span className="ml-1 font-mono text-[11px] text-secondary-fg tabular-nums">
                        ${claim.price}
                      </span>
                      <span
                        className="ml-1 font-mono text-[10px] tabular-nums"
                        style={{
                          color:
                            claim.price - p.budget > 0
                              ? 'var(--age-old)'
                              : claim.price - p.budget < 0
                                ? 'var(--age-young)'
                                : 'var(--text-muted)',
                        }}
                      >
                        {claim.price - p.budget > 0
                          ? `▲$${claim.price - p.budget}`
                          : claim.price - p.budget < 0
                            ? `▼$${Math.abs(claim.price - p.budget)}`
                            : '='}
                      </span>
                    </TableCell>
                  ) : (
                    <TableCell />
                  ))}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
