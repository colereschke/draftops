import { POS_COLORS } from '@/lib/posColors';

interface AuctionHeaderProps {
  ownerBudget: number;
  mySpent: number;
  remaining: number;
  posStats: Record<'QB' | 'RB' | 'WR' | 'TE', { count: number; total: number }>;
  grandTotal: number;
  totalPlayerCount: number;
}

const MARKET_POSITIONS = ['QB', 'RB', 'WR', 'TE'] as const;

export default function AuctionHeader({
  ownerBudget,
  mySpent,
  remaining,
  posStats,
  grandTotal,
  totalPlayerCount,
}: AuctionHeaderProps) {
  const safeGrandTotal = grandTotal || 1;

  return (
    <div className="border-b border-border bg-background px-5 py-4">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-stretch">
        <section className="rounded-lg border border-border-subtle bg-card px-4 py-3">
          <div className="font-label mb-1 text-[10px] tracking-[2.5px] text-muted-foreground uppercase">
            12-Team · Superflex · TE Premium · $1,000 Budget · 30-Man Rosters
          </div>
          <h1 className="font-label m-0 text-2xl leading-none font-bold tracking-tight text-foreground">
            Startup Auction Value Sheet
          </h1>
          <div className="mt-1.5 text-[11px] text-secondary-fg">
            2QB rankings scaled 5× · TE PPR+1 / 1st Down+0.25 applied · {totalPlayerCount} players +
            pick assets
          </div>
        </section>

        <section className="grid min-w-full grid-cols-3 gap-2 lg:min-w-[420px]">
          <MetricCard label="Budget" value={ownerBudget} tone="var(--text-primary)" />
          <MetricCard label="Spent" value={mySpent} tone="var(--pos-wr)" />
          <MetricCard
            label="Remaining"
            value={remaining}
            tone={remaining < 100 ? 'var(--age-old)' : 'var(--age-young)'}
          />
        </section>
      </div>

      <section className="mt-3 rounded-lg border border-border-subtle bg-card px-4 py-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="font-label text-[10px] tracking-[2px] text-muted-foreground uppercase">
              Open value mix
            </div>
            <div className="mt-0.5 text-[11px] text-secondary-fg">
              Unclaimed player target value by position, excluding pick assets
            </div>
          </div>
          <div className="font-mono text-[11px] text-muted-foreground tabular-nums">
            Open value ${grandTotal}
          </div>
        </div>
        <div className="flex h-2.5 gap-px overflow-hidden rounded-full bg-background">
          {MARKET_POSITIONS.map((pos) => {
            const pct = ((posStats[pos].total / safeGrandTotal) * 100).toFixed(1);
            return (
              <div
                key={pos}
                style={{ width: `${pct}%`, background: POS_COLORS[pos].accent, opacity: 0.82 }}
              />
            );
          })}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5">
          {MARKET_POSITIONS.map((pos) => {
            const pct = ((posStats[pos].total / safeGrandTotal) * 100).toFixed(0);
            return (
              <div key={pos} className="flex items-center gap-1.5 text-[10px]">
                <div
                  className="h-2 w-2 rounded-sm"
                  style={{ background: POS_COLORS[pos].accent }}
                />
                <span className="font-label font-bold tracking-wide text-secondary-fg">{pos}</span>
                <span className="font-mono text-muted-foreground tabular-nums">
                  {pct}% · {posStats[pos].count} · ${posStats[pos].total}
                </span>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

interface MetricCardProps {
  label: string;
  value: number;
  tone: string;
}

function MetricCard({ label, value, tone }: MetricCardProps) {
  return (
    <div className="rounded-lg border border-border-subtle bg-card px-3 py-3">
      <div className="font-label text-[10px] tracking-[1.7px] text-muted-foreground uppercase">
        {label}
      </div>
      <div className="mt-1 font-mono text-2xl font-bold tabular-nums" style={{ color: tone }}>
        ${value}
      </div>
    </div>
  );
}
