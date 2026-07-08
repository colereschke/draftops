import type { RivalContribution } from '@/lib/nominationScoring';

interface RivalDemandBarProps {
  rivalContributions: RivalContribution[];
}

export default function RivalDemandBar({ rivalContributions }: RivalDemandBarProps) {
  const topRivals = rivalContributions.slice(0, 4);

  if (topRivals.length === 0) {
    return <span className="text-[10px] text-border">—</span>;
  }

  return (
    <div className="flex flex-col gap-[3px]">
      {topRivals.map((r) => (
        <div key={r.handle} className="flex items-center gap-1.5">
          <div className="w-[70px] overflow-hidden text-right font-mono text-[9px] text-nowrap text-ellipsis text-secondary-fg">
            {r.handle}
          </div>
          <div className="h-1 flex-1 overflow-hidden rounded-[2px] bg-muted">
            <div
              className="h-full rounded-[2px]"
              style={{ width: `${r.pct}%`, background: 'var(--pos-qb)' }}
            />
          </div>
          <div className="w-7 font-mono text-[9px] text-muted-foreground tabular-nums">
            {Math.round(r.pct)}%
          </div>
        </div>
      ))}
    </div>
  );
}
