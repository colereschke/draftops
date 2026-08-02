'use client';

import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { SortKey } from './PlayerTable';

interface PlayerTableHeaderProps {
  showNotes: boolean;
  hasClaims: boolean;
  sortBy: SortKey;
  sortDir: 'asc' | 'desc';
  onSort: (column: SortKey) => void;
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

export default function PlayerTableHeader({
  showNotes,
  hasClaims,
  sortBy,
  sortDir,
  onSort,
}: PlayerTableHeaderProps) {
  return (
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
              sortBy === 'claimedPrice' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'
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
  );
}
