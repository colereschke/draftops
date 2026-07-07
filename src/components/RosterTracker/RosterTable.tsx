'use client';

import { ArrowUp, ArrowDown, ArrowUpDown, ChevronRight } from 'lucide-react';
import type { TeamWithRoster } from '@/types';
import { ROSTER_SIZE } from '@/lib/teams';
import { cn } from '@/lib/utils';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import TeamRosterDetail from './TeamRosterDetail';

export type SortKey = 'buyingPower' | 'spent' | 'remaining' | 'rosterCount';

function buyingPowerColor(bp: number): string {
  if (bp > 150) return '#4caf6e';
  if (bp >= 50) return '#e8a030';
  return '#e05050';
}

interface SortIconProps {
  col: SortKey;
  sortBy: SortKey;
  sortDir: 'asc' | 'desc';
}

function SortIcon({ col, sortBy, sortDir }: SortIconProps) {
  if (sortBy !== col) {
    return <ArrowUpDown className="ml-1 inline size-3.5 text-muted-foreground" />;
  }
  return sortDir === 'asc' ? (
    <ArrowUp className="ml-1 inline size-3.5" style={{ color: 'var(--pos-wr)' }} />
  ) : (
    <ArrowDown className="ml-1 inline size-3.5" style={{ color: 'var(--pos-wr)' }} />
  );
}

interface RosterTableProps {
  teams: TeamWithRoster[];
  expanded: Set<number>;
  onToggle: (id: number) => void;
  sortBy: SortKey;
  sortDir: 'asc' | 'desc';
  onSort: (col: SortKey) => void;
  ownerHandle: string | null;
}

const SORT_COLUMNS: Array<{ key: SortKey; label: string }> = [
  { key: 'spent', label: 'Spent' },
  { key: 'remaining', label: 'Remaining' },
  { key: 'buyingPower', label: 'Buying Power' },
];

export default function RosterTable({
  teams,
  expanded,
  onToggle,
  sortBy,
  sortDir,
  onSort,
  ownerHandle,
}: RosterTableProps) {
  return (
    <div className="overflow-x-auto px-5 pb-10">
      <Table className="mt-1.5">
        <TableHeader>
          <TableRow className="border-border hover:bg-transparent">
            <TableHead className="font-label border-none py-2 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
              Team
            </TableHead>
            <TableHead
              aria-sort={
                sortBy === 'rosterCount' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'
              }
              className="border-none py-2 text-center"
            >
              <button
                type="button"
                onClick={() => onSort('rosterCount')}
                aria-label="Sort by Roster"
                className="font-label cursor-pointer border-0 bg-transparent p-0 text-[10px] font-semibold tracking-wide whitespace-nowrap uppercase select-none text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                style={{ color: sortBy === 'rosterCount' ? 'var(--pos-wr)' : undefined }}
              >
                Roster
                <SortIcon col="rosterCount" sortBy={sortBy} sortDir={sortDir} />
              </button>
            </TableHead>
            <TableHead className="font-label border-none py-2 text-center text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
              PKG
            </TableHead>
            {SORT_COLUMNS.map((col) => (
              <TableHead
                key={col.key}
                aria-sort={
                  sortBy === col.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'
                }
                className="border-none py-2 text-center"
              >
                <button
                  type="button"
                  onClick={() => onSort(col.key)}
                  aria-label={`Sort by ${col.label}`}
                  className="font-label cursor-pointer border-0 bg-transparent p-0 text-[10px] font-semibold tracking-wide whitespace-nowrap uppercase select-none text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  style={{ color: sortBy === col.key ? 'var(--pos-wr)' : undefined }}
                >
                  {col.label}
                  <SortIcon col={col.key} sortBy={sortBy} sortDir={sortDir} />
                </button>
              </TableHead>
            ))}
            <TableHead className="w-8 border-none py-2" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {teams.flatMap((team, i) => {
            const isExpanded = expanded.has(team.id);
            const isOwner = ownerHandle !== null && team.handle === ownerHandle;

            const rows = [
              <TableRow
                key={team.id}
                onClick={() => onToggle(team.id)}
                className={cn(
                  'cursor-pointer hover:bg-card',
                  isExpanded ? 'border-b-0' : 'border-b-[#141824]',
                  !isOwner && i % 2 !== 0 ? 'bg-[#0a0c10]' : undefined,
                )}
                style={{
                  background: isOwner ? '#141e2e' : undefined,
                  borderLeft: `3px solid ${isOwner ? '#4f83e8' : 'var(--border)'}`,
                }}
              >
                <TableCell className="text-left">
                  <span
                    className={cn(
                      'text-[13px]',
                      isOwner ? 'font-bold' : 'font-normal text-foreground',
                    )}
                    style={isOwner ? { color: '#4f83e8' } : undefined}
                  >
                    {team.handle}
                  </span>
                  {team.displayName && (
                    <span className="ml-1.5 text-[11px] text-muted-foreground">
                      {team.displayName}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-center font-mono text-xs text-secondary-fg tabular-nums">
                  {team.rosterCount} / {ROSTER_SIZE}
                </TableCell>
                <TableCell className="text-center">
                  {team.pkgCount > 0 && (
                    <span
                      className="rounded font-mono text-[11px] font-bold tabular-nums"
                      style={{ color: 'var(--pos-pkg)', background: '#2a2010', padding: '2px 6px' }}
                    >
                      {team.pkgCount}×
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-center font-mono text-[13px] text-secondary-fg tabular-nums">
                  ${team.spent}
                </TableCell>
                <TableCell className="text-center font-mono text-[13px] text-foreground tabular-nums">
                  ${team.remaining}
                </TableCell>
                <TableCell
                  className="text-center font-mono text-[13px] font-bold tabular-nums"
                  style={{ color: buyingPowerColor(team.buyingPower) }}
                >
                  ${team.buyingPower}
                </TableCell>
                <TableCell className="text-right">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onToggle(team.id);
                    }}
                    aria-expanded={isExpanded}
                    aria-label={`${isExpanded ? 'Collapse' : 'Expand'} roster for ${team.handle}`}
                    className="ml-auto inline-flex cursor-pointer items-center justify-center rounded-sm border-0 bg-transparent p-0 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <ChevronRight
                      className={cn(
                        'size-3.5 text-muted-foreground transition-transform duration-150',
                        isExpanded && 'rotate-90',
                      )}
                    />
                  </button>
                </TableCell>
              </TableRow>,
            ];

            if (isExpanded) {
              rows.push(
                <TableRow key={`${team.id}-roster`} className="hover:bg-transparent">
                  <TableCell colSpan={7} className="border-b-2 border-b-[#2a3048] p-0">
                    <div className="bg-[#080a10] px-4 pt-2.5 pb-3.5">
                      <TeamRosterDetail results={team.results} />
                    </div>
                  </TableCell>
                </TableRow>,
              );
            }

            return rows;
          })}
        </TableBody>
      </Table>
    </div>
  );
}
