import type { TeamStats, StartingSlot } from '@/types';
import { DEFAULT_BUDGET, DEFAULT_STARTING_LINEUP } from '@/types';
import type { ManagerTendency, AppetitePos } from '@/lib/tendencies';
import { formatLineupFormat } from '@/lib/describeDraftSettings';
import BudgetRefresher from './BudgetRefresher';
import ThreatBoard from './ThreatBoard';

interface BudgetPressureViewProps {
  teams: TeamStats[];
  tendencies: ManagerTendency[];
  livePosition: AppetitePos | null;
  liveName: string | null;
  ownerHandle: string | null;
  budget?: number;
  startingLineup?: StartingSlot[];
}

export default function BudgetPressureView({
  teams,
  tendencies,
  livePosition,
  liveName,
  ownerHandle,
  budget = DEFAULT_BUDGET,
  startingLineup = DEFAULT_STARTING_LINEUP,
}: BudgetPressureViewProps) {
  const roomLiquidity = teams.reduce((sum, team) => sum + team.buyingPower, 0);
  const lowPowerCount = teams.filter((team) => team.buyingPower < 50).length;
  const settingsCaption = [
    `${teams.length}-Team`,
    formatLineupFormat(startingLineup),
    `$${budget.toLocaleString()} Budget`,
    'Live Threat',
  ].join(' · ');

  return (
    <main id="main-content" tabIndex={-1} className="min-h-screen bg-background text-foreground">
      <div
        data-onboarding-target="budget-pressure"
        className="border-b border-border bg-background px-5 py-4"
      >
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-stretch">
          <section className="rounded-lg border border-border-subtle bg-card px-4 py-3">
            <div className="font-label mb-1 text-[10px] tracking-[2.5px] text-muted-foreground uppercase">
              {settingsCaption}
            </div>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="font-label m-0 text-2xl leading-none font-bold tracking-tight text-foreground">
                  Budget Pressure
                </h1>
                <div className="mt-1.5 text-[11px] text-secondary-fg">
                  Who can strike on the position up now — max bid weighted by revealed appetite.
                </div>
              </div>
              <BudgetRefresher intervalMs={20000} />
            </div>
          </section>

          <section className="grid min-w-full grid-cols-2 gap-2 xl:min-w-[360px]">
            <PressureMetric label="Room Liquidity" value={`$${roomLiquidity}`} />
            <PressureMetric label="Low Power" value={`${lowPowerCount} teams`} detail="Under $50" />
          </section>
        </div>
      </div>

      <ThreatBoard
        teams={teams}
        tendencies={tendencies}
        livePosition={livePosition}
        liveName={liveName}
        ownerHandle={ownerHandle}
      />
    </main>
  );
}

interface PressureMetricProps {
  label: string;
  value: number | string;
  detail?: string;
}

function PressureMetric({ label, value, detail }: PressureMetricProps) {
  return (
    <div className="rounded-lg border border-border-subtle bg-card px-3 py-3">
      <div className="font-label text-[10px] tracking-[1.7px] text-muted-foreground uppercase">
        {label}
      </div>
      <div className="mt-1 font-mono text-xl font-bold text-foreground tabular-nums">{value}</div>
      {detail && <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">{detail}</div>}
    </div>
  );
}
