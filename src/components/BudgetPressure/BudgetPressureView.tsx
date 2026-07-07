import type { TeamStats } from '@/types';
import { ROSTER_SIZE } from '@/lib/teams';
import { cn } from '@/lib/utils';
import BudgetRefresher from './BudgetRefresher';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';

function buyingPowerColor(bp: number): string {
  if (bp > 150) return '#4caf6e';
  if (bp >= 50) return '#e8a030';
  return '#e05050';
}

interface BudgetPressureViewProps {
  teams: TeamStats[];
  ownerHandle: string | null;
}

const COLUMNS = ['#', 'Team', 'Spent', 'Remaining', 'Roster', 'Buying Power'] as const;

export default function BudgetPressureView({ teams, ownerHandle }: BudgetPressureViewProps) {
  const maxBp = Math.max(...teams.map((t) => t.buyingPower), 1);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="border-b border-border bg-card px-5 pt-[18px] pb-3.5">
        <div className="font-label mb-1 text-[10px] tracking-[3px] text-muted-foreground uppercase">
          12-Team · Superflex · $1,000 Budget · 30-Man Rosters
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <h1 className="font-label m-0 text-xl font-bold tracking-tight text-white">
            Budget Pressure
          </h1>
          <BudgetRefresher intervalMs={20000} />
        </div>
        <div className="mt-0.5 text-[11px] text-muted-foreground">
          Buying power = remaining − remaining roster spots · sorted by most dangerous bidder
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto px-5 pb-10">
        <Table className="mt-1.5">
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              {COLUMNS.map((col) => (
                <TableHead
                  key={col}
                  className="font-label border-none py-2 text-[10px] font-semibold tracking-wide whitespace-nowrap text-muted-foreground uppercase"
                  style={{
                    textAlign: col === 'Team' || col === 'Buying Power' ? 'left' : 'center',
                  }}
                >
                  {col}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {teams.map((team, i) => {
              const isOwner = ownerHandle !== null && team.handle === ownerHandle;
              const bpColor = buyingPowerColor(team.buyingPower);
              const barWidth = maxBp > 0 ? Math.max(0, (team.buyingPower / maxBp) * 100) : 0;

              return (
                <TableRow
                  key={team.id}
                  data-testid={`row-${team.handle}`}
                  className={cn(
                    'border-b-[#141824] hover:bg-transparent',
                    !isOwner && i % 2 !== 0 ? 'bg-[#0a0c10]' : undefined,
                  )}
                  style={{
                    background: isOwner ? '#141e2e' : undefined,
                    borderLeft: `3px solid ${isOwner ? '#4f83e8' : 'var(--border)'}`,
                  }}
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
                      {team.displayName ?? team.handle}
                    </span>
                  </TableCell>
                  <TableCell className="text-center font-mono text-xs text-secondary-fg tabular-nums">
                    ${team.spent}
                  </TableCell>
                  <TableCell className="text-center font-mono text-xs text-foreground tabular-nums">
                    ${team.remaining}
                  </TableCell>
                  <TableCell className="text-center font-mono text-xs text-secondary-fg tabular-nums">
                    {team.rosterCount} / {ROSTER_SIZE}
                  </TableCell>
                  <TableCell className="min-w-[180px]">
                    <div className="flex items-center gap-2.5">
                      <span
                        data-testid={`bp-${i + 1}`}
                        className="min-w-[60px] font-mono text-[15px] font-bold tabular-nums"
                        style={{ color: bpColor }}
                      >
                        ${team.buyingPower}
                      </span>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${barWidth}%`, background: bpColor, opacity: 0.75 }}
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
    </div>
  );
}
