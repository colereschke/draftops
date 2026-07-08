'use client';

import { useMemo } from 'react';
import type { Position } from '@/types';
import type { ScoredPlayer } from '@/lib/nominationScoring';
import { POS_COLORS } from '@/lib/posColors';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import RivalDemandBar from './RivalDemandBar';

const POSITIONS: Array<'ALL' | Position> = ['ALL', 'QB', 'RB', 'WR', 'TE', 'PICK', 'PKG'];

const COLUMNS = ['#', 'Player', 'Target / Ceil', 'Pressure', 'Rival Demand', '', ''] as const;

interface NominationTableProps {
  scored: ScoredPlayer[];
  posFilter: 'ALL' | Position;
  onPosFilterChange: (pos: 'ALL' | Position) => void;
  hasAuctionData: boolean;
  onWatch: (playerName: string) => void;
  onNominate: (playerName: string) => void;
}

export default function NominationTable({
  scored,
  posFilter,
  onPosFilterChange,
  hasAuctionData,
  onWatch,
  onNominate,
}: NominationTableProps) {
  const filtered = useMemo(
    () => (posFilter === 'ALL' ? scored : scored.filter((s) => s.player.pos === posFilter)),
    [scored, posFilter],
  );

  if (!hasAuctionData) {
    return (
      <div className="flex h-[300px] items-center justify-center text-[13px] text-muted-foreground">
        No auction data yet — start logging bids to see nomination suggestions.
      </div>
    );
  }

  return (
    <>
      <div className="mb-3.5 flex flex-wrap items-center gap-[3px]">
        <ToggleGroup
          value={[posFilter]}
          onValueChange={(vals) =>
            onPosFilterChange((vals[0] as ('ALL' | Position) | undefined) ?? 'ALL')
          }
          className="flex-wrap gap-[3px]"
        >
          {POSITIONS.map((pos) => {
            const active = pos === posFilter;
            const c = pos === 'ALL' ? null : POS_COLORS[pos];
            return (
              <ToggleGroupItem
                key={pos}
                value={pos}
                className="font-label rounded-[5px] border border-border px-2.5 py-1 text-[11px] font-semibold tracking-wide text-muted-foreground"
                style={
                  active
                    ? {
                        borderColor: c?.accent ?? 'var(--pos-pick)',
                        background: c?.bg ?? POS_COLORS.PICK.bg,
                        color: c?.accent ?? 'var(--pos-pick)',
                      }
                    : undefined
                }
              >
                {pos}
              </ToggleGroupItem>
            );
          })}
        </ToggleGroup>
        <div className="ml-auto self-center text-[11px] text-muted-foreground">
          {filtered.length} targets
        </div>
      </div>

      <Table className="mt-1.5">
        <TableHeader>
          <TableRow className="border-border hover:bg-transparent">
            {COLUMNS.map((col, i) => (
              <TableHead
                key={i}
                className="font-label border-none py-2 text-[10px] font-semibold tracking-wide whitespace-nowrap text-muted-foreground uppercase"
                style={{
                  textAlign: col === 'Player' || col === 'Rival Demand' ? 'left' : 'center',
                }}
              >
                {col}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((s, i) => {
            const { player, nominationScore, rivalContributions } = s;
            const c = POS_COLORS[player.pos];
            const isRookie = player.notes.toLowerCase().includes('rookie');
            return (
              <TableRow
                key={player.player}
                className={cn(
                  'border-b-border-subtle hover:bg-card',
                  i % 2 !== 0 ? 'bg-muted/20' : undefined,
                )}
                style={{ borderLeft: `3px solid ${c.accent}` }}
              >
                <TableCell className="text-center font-mono text-[11px] text-muted-foreground tabular-nums">
                  {i + 1}
                </TableCell>
                <TableCell className="text-left">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[13px] font-semibold text-foreground">
                      {player.player}
                    </span>
                    <span
                      className="font-label inline-block rounded text-[9px] font-bold tracking-wide"
                      style={{ background: c.badge, color: c.badgeText, padding: '2px 5px' }}
                    >
                      {player.pos}
                    </span>
                    {isRookie && (
                      <span
                        className="rounded text-[8px] font-bold tracking-wide uppercase"
                        style={{
                          background: 'var(--accent)',
                          color: 'var(--pos-wr)',
                          padding: '1px 4px',
                        }}
                      >
                        R
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-center">
                  <span
                    className="font-mono text-[13px] font-bold tabular-nums"
                    style={{ color: c.accent }}
                  >
                    ${player.budget}
                  </span>
                  <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
                    {' '}
                    / ${player.ceiling}
                  </span>
                </TableCell>
                <TableCell className="text-center">
                  <span
                    className="font-mono text-[13px] font-bold tabular-nums"
                    style={{ color: 'var(--pos-wr)' }}
                  >
                    {Math.round(nominationScore).toLocaleString()}
                  </span>
                </TableCell>
                <TableCell className="min-w-[200px] text-left">
                  <RivalDemandBar rivalContributions={rivalContributions} />
                </TableCell>
                <TableCell className="text-center">
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => onWatch(player.player)}
                    className="font-label tracking-wide hover:border-[var(--pos-rb)]"
                    style={{ color: 'var(--pos-rb)' }}
                  >
                    Watch
                  </Button>
                </TableCell>
                <TableCell className="text-center">
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => onNominate(player.player)}
                    className="font-label tracking-wide hover:border-[var(--pos-pick)]"
                    style={{ color: 'var(--pos-pick)' }}
                  >
                    Nominate
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
          {filtered.length === 0 && (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={7} className="p-10 text-center text-xs text-muted-foreground">
                No nomination targets found.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </>
  );
}
