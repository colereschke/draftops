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
  return (
    <div className="border-b border-border bg-card px-5 pt-[18px] pb-3.5">
      <div className="font-label mb-1 text-[10px] tracking-[3px] text-muted-foreground uppercase">
        12-Team · Superflex · TE Premium · $1,000 Budget · 30-Man Rosters
      </div>
      <h1 className="font-label m-0 mb-0.5 text-xl font-bold tracking-tight text-white">
        Startup Auction Value Sheet
      </h1>
      <div className="text-[11px] text-muted-foreground">
        2QB rankings scaled 5× · TE PPR+1 / 1st Down+0.25 applied · {totalPlayerCount} players +
        pick assets
      </div>

      {/* Budget tracker */}
      <div className="mt-3.5 flex flex-wrap items-center gap-2.5">
        <div className="flex items-center gap-4 rounded-lg bg-muted px-3.5 py-2">
          <div className="text-center">
            <div className="font-label text-[10px] tracking-wide text-muted-foreground uppercase">
              Budget
            </div>
            <div
              className="font-mono text-lg font-bold tabular-nums"
              style={{ color: 'var(--pos-qb)' }}
            >
              ${ownerBudget}
            </div>
          </div>
          <div className="text-center">
            <div className="font-label text-[10px] tracking-wide text-muted-foreground uppercase">
              Spent
            </div>
            <div
              className="font-mono text-lg font-bold tabular-nums"
              style={{ color: 'var(--pos-wr)' }}
            >
              ${mySpent}
            </div>
          </div>
          <div className="text-center">
            <div className="font-label text-[10px] tracking-wide text-muted-foreground uppercase">
              Remaining
            </div>
            <div
              className="font-mono text-lg font-bold tabular-nums"
              style={{ color: remaining < 100 ? 'var(--age-old)' : 'var(--age-young)' }}
            >
              ${remaining}
            </div>
          </div>
        </div>
        <div className="max-w-[200px] text-[11px] text-muted-foreground">
          ↑ Track your spend to know who can still hurt you in the room
        </div>
      </div>

      {/* Market weight by position */}
      <div className="mt-3 rounded-lg bg-muted px-3 py-2">
        <div className="font-label mb-[5px] text-[10px] tracking-wide text-muted-foreground uppercase">
          Market weight by position
        </div>
        <div className="flex h-1.5 gap-px overflow-hidden rounded-[3px]">
          {MARKET_POSITIONS.map((pos) => {
            const pct = ((posStats[pos].total / grandTotal) * 100).toFixed(1);
            return (
              <div
                key={pos}
                style={{ width: `${pct}%`, background: POS_COLORS[pos].accent, opacity: 0.8 }}
              />
            );
          })}
        </div>
        <div className="mt-[5px] flex gap-3.5">
          {MARKET_POSITIONS.map((pos) => {
            const pct = ((posStats[pos].total / grandTotal) * 100).toFixed(0);
            return (
              <div key={pos} className="flex items-center gap-1 text-[10px]">
                <div
                  className="h-[7px] w-[7px] rounded-sm"
                  style={{ background: POS_COLORS[pos].accent }}
                />
                <span className="text-secondary-fg">{pos}</span>
                <span className="font-mono text-muted-foreground tabular-nums">
                  {pct}% · ${posStats[pos].total}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
