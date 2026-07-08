import type { RosterEntry, Position } from '@/types';
import { POS_COLORS } from '@/lib/posColors';

interface TeamRosterDetailProps {
  results: RosterEntry[];
}

export default function TeamRosterDetail({ results }: TeamRosterDetailProps) {
  if (results.length === 0) {
    return <div className="text-xs text-muted-foreground italic">No players won yet.</div>;
  }

  return (
    <div className="flex flex-col gap-0.5">
      {results.map((result) => {
        const pos = result.position as Position;
        const c = POS_COLORS[pos] ?? POS_COLORS.PICK;
        const { delta } = result;
        return (
          <div
            key={result.id}
            className="flex items-center gap-2.5 rounded-r border border-l-0 border-border-subtle bg-background px-2 py-[5px]"
            style={{ borderLeft: `3px solid ${c.accent}` }}
          >
            <span
              className="font-label min-w-8 rounded text-center text-[9px] font-bold tracking-wide"
              style={{ background: c.badge, color: c.badgeText, padding: '2px 6px' }}
            >
              {result.position}
            </span>
            <span className="flex-1 text-[13px] font-semibold text-foreground">
              {result.player}
            </span>
            <span className="min-w-[30px] text-[11px] text-muted-foreground">{result.nflTeam}</span>
            <span
              className="min-w-11 text-right font-mono text-[13px] font-bold tabular-nums"
              style={{ color: c.accent }}
            >
              ${result.price}
            </span>
            {delta !== null && delta !== 0 && (
              <span
                className="min-w-11 text-right font-mono text-[11px] tabular-nums"
                style={{ color: delta > 0 ? 'var(--age-old)' : 'var(--age-young)' }}
              >
                {delta > 0 ? `+$${delta}` : `-$${Math.abs(delta)}`}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
