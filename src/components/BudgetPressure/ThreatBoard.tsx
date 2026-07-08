'use client';

import { useState, useMemo } from 'react';
import type { TeamStats } from '@/types';
import type { Appetite, AppetitePos, ManagerTendency } from '@/lib/tendencies';
import { APPETITE_POSITIONS } from '@/lib/tendencies.constants';
import { maxBid, threatScore } from '@/lib/threat';
import { cn } from '@/lib/utils';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';

export interface ThreatBoardProps {
  teams: TeamStats[];
  tendencies: ManagerTendency[];
  livePosition: AppetitePos | null;
  liveName: string | null;
  ownerHandle: string | null;
}

const APPETITE_LABEL: Record<Appetite, string> = {
  overpays: 'overpays',
  thrifty: 'thrifty',
  neutral: 'neutral',
  'no-read': '—',
};

function appetiteColor(appetite: Appetite): string | undefined {
  if (appetite === 'overpays') return 'var(--age-old)';
  if (appetite === 'thrifty') return 'var(--age-young)';
  return undefined;
}

export default function ThreatBoard({
  teams,
  tendencies,
  livePosition,
  liveName,
  ownerHandle,
}: ThreatBoardProps) {
  // overridePos wins when set; otherwise follow the live nomination; fall back to QB.
  // Deriving (rather than syncing via effect) means a 20s refresh updating
  // livePosition never stomps a manual override.
  const [overridePos, setOverridePos] = useState<AppetitePos | null>(null);
  const selectedPos: AppetitePos = overridePos ?? livePosition ?? 'QB';

  const ranked = useMemo(() => {
    return teams
      .map((team) => {
        const tendency = tendencies.find((t) => t.teamId === team.id);
        const appetite: Appetite = tendency ? tendency.positions[selectedPos].appetite : 'no-read';
        return {
          team,
          appetite,
          bid: maxBid(team),
          threat: threatScore(team, appetite),
        };
      })
      .sort((a, b) => b.threat - a.threat);
  }, [teams, tendencies, selectedPos]);

  const maxThreat = Math.max(...ranked.map((r) => r.threat), 1);

  return (
    <div className="overflow-x-auto px-5 pb-10">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex gap-1" role="group" aria-label="Threat position">
          {APPETITE_POSITIONS.map((pos) => {
            const active = pos === selectedPos;
            return (
              <button
                key={pos}
                type="button"
                data-testid={`threat-pos-${pos}`}
                aria-pressed={active}
                onClick={() => setOverridePos(pos)}
                className={cn(
                  'font-label cursor-pointer rounded border px-3 py-1 text-[12px] font-semibold tracking-wide uppercase',
                  active
                    ? 'border-primary bg-accent text-foreground'
                    : 'border-border-subtle bg-background text-muted-foreground',
                )}
              >
                {pos}
              </button>
            );
          })}
        </div>
        {liveName && livePosition && (
          <span
            data-testid="threat-live-chip"
            className="font-label rounded border border-border-subtle bg-card px-2 py-1 text-[11px] tracking-wide text-secondary-fg uppercase"
          >
            {liveName} up · {livePosition}
          </span>
        )}
      </div>

      <Table>
        <TableHeader>
          <TableRow className="border-border hover:bg-transparent">
            {['#', 'Team', 'Max Bid', 'Appetite', 'Threat'].map((col) => (
              <TableHead
                key={col}
                className="font-label border-none py-2 text-[10px] font-semibold tracking-wide whitespace-nowrap text-muted-foreground uppercase"
                style={{ textAlign: col === 'Team' || col === 'Threat' ? 'left' : 'center' }}
              >
                {col}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {ranked.map((row, i) => {
            const isOwner = ownerHandle !== null && row.team.handle === ownerHandle;
            const width = maxThreat > 0 ? Math.max(0, (row.threat / maxThreat) * 100) : 0;
            return (
              <TableRow
                key={row.team.id}
                data-testid={`threat-row-${row.team.handle}`}
                className={cn(
                  'border-b-border-subtle hover:bg-transparent',
                  isOwner ? 'bg-accent' : i % 2 !== 0 ? 'bg-muted/20' : undefined,
                )}
                style={{ borderLeft: `3px solid ${isOwner ? 'var(--primary)' : 'var(--border)'}` }}
              >
                <TableCell className="text-center font-mono text-[11px] text-muted-foreground tabular-nums">
                  {i + 1}
                </TableCell>
                <TableCell className="text-left">
                  <span
                    className={cn(
                      'text-[13px]',
                      isOwner ? 'font-bold text-foreground' : 'font-medium text-secondary-fg',
                    )}
                  >
                    {row.team.displayName ?? row.team.handle}
                  </span>
                </TableCell>
                <TableCell className="text-center font-mono text-[13px] text-foreground tabular-nums">
                  ${row.bid}
                </TableCell>
                <TableCell
                  className="font-label text-center text-[11px] tracking-wide uppercase"
                  style={{ color: appetiteColor(row.appetite) }}
                >
                  {APPETITE_LABEL[row.appetite]}
                </TableCell>
                <TableCell className="min-w-[180px]">
                  <div className="flex items-center gap-2.5">
                    <span className="min-w-[48px] font-mono text-[13px] font-bold tabular-nums">
                      {Math.round(row.threat)}
                    </span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${width}%`, background: 'var(--primary)', opacity: 0.75 }}
                      />
                    </div>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
