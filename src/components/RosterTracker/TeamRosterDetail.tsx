import type { RosterEntry, Position } from '@/types';
import { POS_COLORS } from '@/lib/posColors';
import { APPETITE_POSITIONS } from '@/lib/tendencies.constants';

interface TeamRosterDetailProps {
  results: RosterEntry[];
}

// Appetite positions first (shared order with the dossier chips and threat board),
// then the non-appetite draft-capital buckets.
const GROUP_ORDER: Position[] = [...APPETITE_POSITIONS, 'PICK', 'PKG'];

export default function TeamRosterDetail({ results }: TeamRosterDetailProps) {
  if (results.length === 0) {
    return <div className="text-xs text-muted-foreground italic">No players won yet.</div>;
  }

  const groups = GROUP_ORDER.map((pos) => ({
    pos,
    entries: results.filter((r) => (r.position as Position) === pos),
  })).filter((g) => g.entries.length > 0);

  return (
    <div className="flex flex-col gap-2.5">
      {groups.map((group) => {
        const c = POS_COLORS[group.pos] ?? POS_COLORS.PICK;
        const subtotal = group.entries.reduce((s, r) => s + r.price, 0);
        const deltaTotal = group.entries.reduce((s, r) => s + (r.delta ?? 0), 0);
        return (
          <div key={group.pos} data-testid={`roster-group-${group.pos}`}>
            <div className="mb-1 flex items-center justify-between">
              <span
                className="font-label rounded text-center text-[9px] font-bold tracking-wide"
                style={{ background: c.badge, color: c.badgeText, padding: '2px 6px' }}
              >
                {group.pos}
              </span>
              <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                ${subtotal}
                {deltaTotal !== 0 && (
                  <span style={{ color: deltaTotal > 0 ? 'var(--age-old)' : 'var(--age-young)' }}>
                    {' '}
                    ({deltaTotal > 0 ? '+' : '-'}${Math.abs(deltaTotal)})
                  </span>
                )}
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              {group.entries.map((result) => {
                const { delta } = result;
                return (
                  <div
                    key={result.id}
                    className="flex items-center gap-2.5 rounded-r border border-l-0 border-border-subtle bg-card px-2 py-[5px]"
                    style={{ borderLeft: `3px solid ${c.accent}` }}
                  >
                    <span className="flex-1 text-[13px] font-semibold text-foreground">
                      {result.player}
                    </span>
                    <span className="min-w-[30px] text-[11px] text-muted-foreground">
                      {result.nflTeam}
                    </span>
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
          </div>
        );
      })}
    </div>
  );
}
