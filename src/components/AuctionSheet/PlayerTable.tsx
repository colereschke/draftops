'use client';

import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import type { Player, ClaimedBid } from '@/types';
import { POS_COLORS } from '@/lib/posColors';
import { ageColor } from '@/lib/ageColor';
import { formatSpread, spreadColor } from '@/lib/valueSpread';
import { cn } from '@/lib/utils';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';

export type SortKey = keyof Player | 'claimedPrice';

interface PlayerTableProps {
  players: Player[];
  showNotes: boolean;
  hasClaims: boolean;
  claimMap: Map<number | string, ClaimedBid>;
  nominatedSet: Set<number | string>;
  sortBy: SortKey;
  sortDir: 'asc' | 'desc';
  onboardingSubjectPlayerName?: string | null;
  onSort: (col: SortKey) => void;
  onRowClick?: (player: Player) => void;
}

const SORT_COLUMNS: Array<{ key: SortKey; label: string }> = [
  { key: 'sfRank', label: 'SF Rank' },
  { key: 'player', label: 'Player' },
  { key: 'pos', label: 'Pos' },
  { key: 'team', label: 'Team' },
  { key: 'age', label: 'Age' },
  { key: 'floor', label: 'Floor' },
  { key: 'budget', label: 'Target' },
  { key: 'ceiling', label: 'Ceiling' },
  { key: 'spread', label: 'Spread' },
];

interface SortIconProps {
  col: SortKey;
  sortBy: SortKey;
  sortDir: 'asc' | 'desc';
}

function SortIcon({ col, sortBy, sortDir }: SortIconProps) {
  if (sortBy !== col) return <ArrowUpDown className="ml-1 inline size-3.5 text-muted-foreground" />;
  return sortDir === 'asc' ? (
    <ArrowUp className="ml-1 inline size-3.5" style={{ color: 'var(--primary)' }} />
  ) : (
    <ArrowDown className="ml-1 inline size-3.5" style={{ color: 'var(--primary)' }} />
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
  onboardingSubjectPlayerName,
  onSort,
  onRowClick,
}: PlayerTableProps) {
  return (
    <div className="overflow-x-auto px-5 pb-10">
      <Table className="mt-1.5 border-separate border-spacing-0">
        <TableHeader>
          <TableRow className="border-border-subtle hover:bg-transparent">
            {SORT_COLUMNS.map((col) => (
              <TableHead
                key={col.key}
                aria-sort={
                  sortBy === col.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'
                }
                className="border-none py-2"
                style={{
                  textAlign: col.key === 'player' ? 'left' : 'center',
                }}
              >
                <button
                  type="button"
                  onClick={() => onSort(col.key)}
                  data-testid={`sort-${col.key}`}
                  aria-label={`Sort by ${col.label}`}
                  className="font-label cursor-pointer border-0 bg-transparent p-0 text-[10px] font-semibold tracking-wide whitespace-nowrap uppercase select-none text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  style={{
                    color: sortBy === col.key ? 'var(--primary)' : undefined,
                    textAlign: col.key === 'player' ? 'left' : 'center',
                  }}
                >
                  {col.label}
                  <SortIcon col={col.key} sortBy={sortBy} sortDir={sortDir} />
                </button>
              </TableHead>
            ))}
            {showNotes && (
              <TableHead className="font-label border-none py-2 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                Notes
              </TableHead>
            )}
            {hasClaims && (
              <TableHead
                aria-sort={
                  sortBy === 'claimedPrice'
                    ? sortDir === 'asc'
                      ? 'ascending'
                      : 'descending'
                    : 'none'
                }
                className="border-none py-2 text-left"
              >
                <button
                  type="button"
                  onClick={() => onSort('claimedPrice')}
                  aria-label="Sort by Claimed"
                  className="font-label cursor-pointer border-0 bg-transparent p-0 text-[10px] font-semibold tracking-wide whitespace-nowrap uppercase select-none text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  style={{ color: sortBy === 'claimedPrice' ? 'var(--primary)' : undefined }}
                >
                  Claimed
                  <SortIcon col="claimedPrice" sortBy={sortBy} sortDir={sortDir} />
                </button>
              </TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {players.map((p, i) => {
            const c = POS_COLORS[p.pos];
            const isRookie = p.notes.toLowerCase().includes('rookie');
            const isPkg = p.pos === 'PKG';
            const key = p.id ?? p.player;
            const isNominated = nominatedSet.has(key);
            const claim = claimMap.get(key);
            const isOnboardingUndoTarget =
              claim !== undefined && onboardingSubjectPlayerName === p.player;
            const playerNameStyle = {
              fontWeight: isPkg ? 700 : 600,
              color: claim
                ? 'var(--text-secondary)'
                : isPkg
                  ? 'var(--pos-pkg)'
                  : 'var(--text-primary)',
            };
            return (
              <TableRow
                key={p.id ?? p.player}
                data-testid={
                  isOnboardingUndoTarget
                    ? `onboarding-bid-undo-${p.player}`
                    : `player-row-${p.sfRank}`
                }
                data-onboarding-target={isOnboardingUndoTarget ? 'bid-undo' : undefined}
                title={
                  isOnboardingUndoTarget
                    ? 'Reopen this player and use Remove in the bid modal to undo this bid.'
                    : undefined
                }
                onClick={onRowClick ? () => onRowClick(p) : undefined}
                className={cn(
                  'border-b-border-subtle hover:bg-card',
                  onRowClick && 'cursor-pointer',
                  claim && 'bg-background',
                  !claim && isNominated && 'bg-[color-mix(in_srgb,var(--pos-pick)_9%,transparent)]',
                  !claim && !isNominated && i % 2 !== 0 && 'bg-card/45',
                )}
                style={{
                  borderLeft: `3px solid ${isNominated ? 'var(--pos-pick)' : c.accent}`,
                }}
              >
                <TableCell
                  className={cn(
                    'text-center font-mono text-[11px] text-muted-foreground tabular-nums',
                    claim && 'text-muted-foreground',
                  )}
                >
                  {p.sfRank}
                </TableCell>
                <TableCell className="text-left">
                  <div className="flex items-center gap-1.5">
                    {onRowClick ? (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onRowClick(p);
                        }}
                        aria-label={`Open bid modal for ${p.player}`}
                        className="cursor-pointer rounded-sm border-0 bg-transparent p-0 text-left text-[13px] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        style={playerNameStyle}
                      >
                        {p.player}
                      </button>
                    ) : (
                      <span className="text-[13px]" style={playerNameStyle}>
                        {p.player}
                      </span>
                    )}
                    {isRookie && (
                      <span
                        className="rounded-[3px] px-1 py-px text-[8px] font-bold tracking-wide uppercase"
                        style={{ background: '#172719', color: 'var(--age-young)' }}
                      >
                        R
                      </span>
                    )}
                    {isPkg && (
                      <span
                        className="rounded-[3px] px-1 py-px text-[8px] font-bold tracking-wide uppercase"
                        style={{ background: POS_COLORS.PKG.bg, color: POS_COLORS.PKG.accent }}
                      >
                        PKG
                      </span>
                    )}
                    {isNominated && (
                      <span
                        className="rounded-[3px] px-1 py-px text-[8px] font-bold tracking-wide uppercase"
                        style={{ background: POS_COLORS.PICK.bg, color: 'var(--pos-pick)' }}
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
                <TableCell
                  className={cn(
                    'text-center text-[11px] text-secondary-fg',
                    claim && 'text-muted-foreground',
                  )}
                >
                  {p.team}
                </TableCell>
                <TableCell
                  className={cn(
                    'text-center font-mono text-[11px] tabular-nums',
                    claim && 'text-secondary-fg',
                  )}
                  style={{ color: claim ? undefined : ageColor(p.age, p.pos) }}
                >
                  {p.age !== null ? p.age.toFixed(1) : '—'}
                </TableCell>
                <TableCell
                  className={cn(
                    'text-center font-mono text-xs text-secondary-fg tabular-nums',
                    claim && 'text-muted-foreground',
                  )}
                >
                  ${p.floor}
                </TableCell>
                <TableCell
                  className={cn(
                    'text-center font-mono text-sm font-bold tabular-nums',
                    claim && 'text-secondary-fg',
                  )}
                  style={{ color: claim ? 'var(--text-secondary)' : 'var(--primary)' }}
                >
                  ${p.budget}
                  {p.dynamicPickValue && p.dynamicPickValue.direction !== 'flat' && (
                    <span
                      data-testid={`dynamic-pick-value-${p.sfRank}`}
                      title={`Baseline $${p.dynamicPickValue.baseline} · Adjusted $${p.dynamicPickValue.adjusted}`}
                      className="ml-1 font-mono text-[10px] tabular-nums"
                      style={{
                        color:
                          p.dynamicPickValue.direction === 'up'
                            ? 'var(--age-young)'
                            : 'var(--age-old)',
                      }}
                    >
                      {p.dynamicPickValue.adjustment > 0
                        ? `+$${p.dynamicPickValue.adjustment}`
                        : `-$${Math.abs(p.dynamicPickValue.adjustment)}`}
                    </span>
                  )}
                </TableCell>
                <TableCell
                  className={cn(
                    'text-center font-mono text-xs tabular-nums',
                    claim && 'text-muted-foreground',
                  )}
                  style={{ color: claim ? 'var(--text-muted)' : 'var(--text-secondary)' }}
                >
                  ${p.ceiling}
                </TableCell>
                <TableCell
                  data-testid={`spread-${p.sfRank}`}
                  className={cn(
                    'text-center font-mono text-xs tabular-nums',
                    claim && 'text-muted-foreground',
                  )}
                  style={{ color: claim ? undefined : spreadColor(p.spread) }}
                >
                  {p.spread == null ? '—' : formatSpread(p.spread)}
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
