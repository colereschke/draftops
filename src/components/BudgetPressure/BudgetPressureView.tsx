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
  if (bp > 150) return 'var(--age-young)';
  if (bp >= 50) return 'var(--primary)';
  return 'var(--age-old)';
}

interface BudgetPressureViewProps {
  teams: TeamStats[];
  ownerHandle: string | null;
}

const COLUMNS = ['#', 'Team', 'Spent', 'Remaining', 'Roster', 'Buying Power'] as const;

export default function BudgetPressureView({ teams, ownerHandle }: BudgetPressureViewProps) {
  const maxBp = Math.max(...teams.map((t) => t.buyingPower), 1);
  const mostDangerous = teams.reduce<TeamStats | null>(
    (best, team) => (!best || team.buyingPower > best.buyingPower ? team : best),
    null,
  );
  const ownerIndex = ownerHandle ? teams.findIndex((team) => team.handle === ownerHandle) : -1;
  const ownerTeam = ownerIndex >= 0 ? teams[ownerIndex] : null;
  const roomLiquidity = teams.reduce((sum, team) => sum + team.buyingPower, 0);
  const lowPowerCount = teams.filter((team) => team.buyingPower < 50).length;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="border-b border-border bg-background px-5 py-4">
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-stretch">
          <section className="rounded-lg border border-border-subtle bg-card px-4 py-3">
            <div className="font-label mb-1 text-[10px] tracking-[2.5px] text-muted-foreground uppercase">
              12-Team · Superflex · $1,000 Budget · 30-Man Rosters
            </div>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="font-label m-0 text-2xl leading-none font-bold tracking-tight text-foreground">
                  Budget Pressure
                </h1>
                <div className="mt-1.5 text-[11px] text-secondary-fg">
                  Teams ranked by live buying power after roster obligations.
                </div>
              </div>
              <BudgetRefresher intervalMs={20000} />
            </div>
            <div className="mt-2 text-[11px] text-muted-foreground">
              Buying power = remaining dollars minus open roster spots.
            </div>
          </section>

          <section className="grid min-w-full grid-cols-2 gap-2 sm:grid-cols-4 xl:min-w-[720px]">
            <PressureMetric
              label="Most Dangerous"
              value={mostDangerous?.handle ?? '—'}
              detail={mostDangerous ? `BP $${mostDangerous.buyingPower}` : undefined}
              tone="danger"
            />
            <PressureMetric
              label="Your Rank"
              value={ownerTeam ? `#${ownerIndex + 1}` : '—'}
              detail={ownerTeam ? `BP $${ownerTeam.buyingPower}` : undefined}
              tone="owner"
            />
            <PressureMetric label="Room Liquidity" value={`$${roomLiquidity}`} />
            <PressureMetric label="Low Power" value={`${lowPowerCount} teams`} detail="Under $50" />
          </section>
        </div>
      </div>

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
                    'border-b-border-subtle hover:bg-transparent',
                    isOwner ? 'bg-accent' : i % 2 !== 0 ? 'bg-muted/20' : undefined,
                  )}
                  style={{
                    borderLeft: `3px solid ${isOwner ? 'var(--primary)' : 'var(--border)'}`,
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

interface PressureMetricProps {
  label: string;
  value: number | string;
  detail?: string;
  tone?: 'danger' | 'owner';
}

function PressureMetric({ label, value, detail, tone }: PressureMetricProps) {
  const color =
    tone === 'danger' ? 'var(--age-old)' : tone === 'owner' ? 'var(--primary)' : undefined;

  return (
    <div className="rounded-lg border border-border-subtle bg-card px-3 py-3">
      <div className="font-label text-[10px] tracking-[1.7px] text-muted-foreground uppercase">
        {label}
      </div>
      <div
        className="mt-1 font-mono text-xl font-bold text-foreground tabular-nums"
        style={{ color }}
      >
        {value}
      </div>
      {detail && <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">{detail}</div>}
    </div>
  );
}
