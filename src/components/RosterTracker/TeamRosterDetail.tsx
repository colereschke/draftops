import type { RosterEntry, Position } from '@/types';
import type { CurrentPickHolding } from '@/lib/pickOwnership';
import { POS_COLORS } from '@/lib/posColors';
import { APPETITE_POSITIONS } from '@/lib/tendencies.constants';

interface TeamRosterDetailProps {
  results: RosterEntry[];
  pickHoldings?: CurrentPickHolding[];
}

const GROUP_ORDER: Position[] = [...APPETITE_POSITIONS];

function formatRound(round: 1 | 2 | 3): string {
  return `${round}${round === 1 ? 'st' : round === 2 ? 'nd' : 'rd'}`;
}

export default function TeamRosterDetail({ results, pickHoldings = [] }: TeamRosterDetailProps) {
  const playerResults = results.filter(
    (result) => result.position !== 'PICK' && result.position !== 'PKG',
  );

  if (playerResults.length === 0 && pickHoldings.length === 0) {
    return <div className="text-xs text-muted-foreground italic">No players won yet.</div>;
  }

  const groups = GROUP_ORDER.map((pos) => ({
    pos,
    entries: playerResults.filter((result) => (result.position as Position) === pos),
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
              <span className="min-w-[80px] text-right font-mono text-[11px] text-muted-foreground tabular-nums">
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
                    <span
                      className="min-w-11 text-right font-mono text-[11px] tabular-nums"
                      style={{
                        color:
                          delta !== null && delta !== 0
                            ? delta > 0
                              ? 'var(--age-old)'
                              : 'var(--age-young)'
                            : 'var(--text-muted)',
                      }}
                    >
                      {delta !== null && delta !== 0
                        ? delta > 0
                          ? `+$${delta}`
                          : `-$${Math.abs(delta)}`
                        : '—'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      {pickHoldings.length > 0 ? (
        <section data-testid="draft-capital" className="border-t border-border-subtle pt-2.5">
          <h3 className="font-label text-[10px] font-bold tracking-[1.5px] text-muted-foreground uppercase">
            Draft Capital
          </h3>
          <div className="mt-1.5 flex flex-col gap-1">
            {pickHoldings.map((holding) => {
              const roundsKey = holding.rounds.join('-');
              const label = holding.isIntactPackage
                ? 'package'
                : holding.rounds.map(formatRound).join(' + ');
              return (
                <div
                  key={`${holding.originTeamId}:${holding.futurePickYear}:${roundsKey}`}
                  data-testid={`draft-capital-${holding.originTeamId}-${holding.futurePickYear}-${roundsKey}`}
                  className="rounded-r border border-l-0 border-border-subtle bg-card px-2 py-[5px] text-[13px] font-semibold text-foreground"
                  style={{ borderLeft: `3px solid ${POS_COLORS.PICK.accent}` }}
                >
                  {holding.futurePickYear} {holding.originHandle} {label}
                </div>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}
