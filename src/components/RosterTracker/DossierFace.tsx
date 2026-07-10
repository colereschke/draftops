import type { TeamWithRoster } from '@/types';
import type { Appetite, AppetitePos, ManagerTendency } from '@/lib/tendencies';
import { appetiteColor } from '@/lib/tendencies';
import { ageColor } from '@/lib/ageColor';
import { APPETITE_POSITIONS } from '@/lib/tendencies.constants';
import { POS_COLORS } from '@/lib/posColors';
import { cn } from '@/lib/utils';

export interface DossierFaceProps {
  team: TeamWithRoster;
  tendency: ManagerTendency;
  isOwner: boolean;
  // Appended to every internal data-testid so the same team's face can render
  // twice in the DOM at once (list pane + detail pane) without colliding.
  testIdSuffix?: string;
}

const AGGRESSION_LABEL: Record<ManagerTendency['aggression'], string> = {
  aggressive: 'Aggressive',
  neutral: 'Neutral',
  disciplined: 'Disciplined',
};

const AGGRESSION_COLOR: Record<ManagerTendency['aggression'], string | undefined> = {
  aggressive: 'var(--age-old)',
  neutral: undefined,
  disciplined: 'var(--age-young)',
};

function leanLabel(lean: ManagerTendency['lean']): string {
  return lean === 'balanced' ? 'Balanced' : `${lean}-heavy`;
}

// Strongest habit = the position with a non-neutral, non-no-read appetite and the
// largest |overPct|. Used for the one-line headline; omitted when nothing qualifies.
function strongestHabit(
  tendency: ManagerTendency,
): { pos: AppetitePos; appetite: Appetite } | null {
  let best: { pos: AppetitePos; appetite: Appetite; mag: number } | null = null;
  for (const pos of APPETITE_POSITIONS) {
    const p = tendency.positions[pos];
    if ((p.appetite === 'overpays' || p.appetite === 'thrifty') && p.overPct !== null) {
      const mag = Math.abs(p.overPct);
      if (!best || mag > best.mag) best = { pos, appetite: p.appetite, mag };
    }
  }
  return best ? { pos: best.pos, appetite: best.appetite } : null;
}

export default function DossierFace({
  team,
  tendency,
  isOwner,
  testIdSuffix = '',
}: DossierFaceProps) {
  const habit = strongestHabit(tendency);
  const overPctLabel =
    tendency.overallOverPct === null
      ? null
      : `${tendency.overallOverPct > 0 ? '+' : ''}${Math.round(tendency.overallOverPct * 100)}% vs value`;

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 pr-6">
        <span
          className={cn('text-[14px]', isOwner ? 'font-bold' : 'font-semibold text-foreground')}
          style={isOwner ? { color: 'var(--primary)' } : undefined}
        >
          {team.handle}
        </span>
        {team.displayName && (
          <span className="text-[11px] text-muted-foreground">{team.displayName}</span>
        )}
        {team.pkgCount > 0 && (
          <span
            data-testid={`dossier-pkg-${team.id}${testIdSuffix}`}
            title={`Holds ${team.pkgCount} pick package${team.pkgCount > 1 ? 's' : ''}`}
            className="font-label rounded text-[9px] font-bold tracking-wide"
            style={{
              background: POS_COLORS.PKG.badge,
              color: POS_COLORS.PKG.badgeText,
              padding: '2px 5px',
            }}
          >
            {team.pkgCount}× PKG
          </span>
        )}
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
        <span
          data-testid={`dossier-lean-${team.id}${testIdSuffix}`}
          className="font-medium text-secondary-fg"
        >
          {leanLabel(tendency.lean)}
        </span>
        {habit && (
          <span
            data-testid={`dossier-habit-${team.id}${testIdSuffix}`}
            className="text-muted-foreground"
          >
            · {habit.appetite === 'overpays' ? 'overpays' : 'bargains'} {habit.pos}
          </span>
        )}
      </div>

      <div className="mt-1 flex items-center gap-2 text-[12px]">
        <span
          data-testid={`dossier-aggression-${team.id}${testIdSuffix}`}
          className="font-label text-[11px] tracking-wide uppercase"
          style={{ color: AGGRESSION_COLOR[tendency.aggression] }}
        >
          {AGGRESSION_LABEL[tendency.aggression]}
        </span>
        {overPctLabel && (
          <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
            {overPctLabel}
          </span>
        )}
      </div>

      <div className="mt-1.5 font-mono text-[11px] text-muted-foreground tabular-nums">
        {tendency.buys} buys · ${tendency.totalSpend} · top ${tendency.topBuy}
      </div>

      <div
        data-testid={`dossier-avg-age-${team.id}${testIdSuffix}`}
        className="mt-1 font-mono text-[11px] tabular-nums"
        style={{ color: team.avgAge !== null ? ageColor(team.avgAge) : 'var(--text-muted)' }}
      >
        Avg age: {team.avgAge !== null ? team.avgAge.toFixed(1) : '—'}
      </div>

      <div className="mt-2 flex gap-1.5">
        {APPETITE_POSITIONS.map((pos) => {
          const p = tendency.positions[pos];
          const color = appetiteColor(p.appetite);
          return (
            <span
              key={pos}
              data-testid={`dossier-chip-${pos}-${team.id}${testIdSuffix}`}
              title={`${pos}: ${p.appetite} (${p.buys} buys)`}
              className="font-label inline-flex items-center gap-1 rounded border border-border-subtle bg-background px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase"
              style={{ color }}
            >
              {pos}
              <span aria-hidden>{p.appetite === 'no-read' ? '·' : '●'}</span>
            </span>
          );
        })}
      </div>
    </>
  );
}
