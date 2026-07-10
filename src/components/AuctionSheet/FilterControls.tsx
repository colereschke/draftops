'use client';

import type { Position } from '@/types';
import { POS_COLORS } from '@/lib/posColors';
import type { StrategyLens } from '@/lib/strategyValue';
import { Toggle } from '@/components/ui/toggle';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Input } from '@/components/ui/input';

export type PositionFilter = 'ALL' | Position;

const POSITIONS: PositionFilter[] = ['ALL', 'QB', 'RB', 'WR', 'TE', 'PICK', 'PKG'];
const STRATEGY_LENSES: Array<{ value: StrategyLens; label: string }> = [
  { value: 'rebuild', label: 'Rebuild' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'contend', label: 'Contend' },
];

interface FilterControlsProps {
  posFilter: PositionFilter;
  onPosFilterChange: (pos: PositionFilter) => void;
  search: string;
  onSearchChange: (value: string) => void;
  showNotes: boolean;
  onShowNotesChange: (value: boolean) => void;
  availableOnly: boolean;
  onAvailableOnlyChange: (value: boolean) => void;
  strategyLens: StrategyLens;
  onStrategyLensChange: (value: StrategyLens) => void;
  resultCount: number;
  futurePickYear?: number | null;
}

export default function FilterControls({
  posFilter,
  onPosFilterChange,
  search,
  onSearchChange,
  showNotes,
  onShowNotesChange,
  availableOnly,
  onAvailableOnlyChange,
  strategyLens,
  onStrategyLensChange,
  resultCount,
  futurePickYear,
}: FilterControlsProps) {
  const packageLabel = futurePickYear ? `${futurePickYear} pick package` : 'pick package';

  return (
    <>
      <div className="flex flex-wrap items-center gap-2.5 border-b border-border-subtle bg-card px-5 py-3">
        <ToggleGroup
          value={[posFilter]}
          onValueChange={(vals) =>
            onPosFilterChange((vals[0] as PositionFilter | undefined) ?? 'ALL')
          }
          className="flex-wrap gap-[3px]"
        >
          {POSITIONS.map((pos) => {
            const active = pos === posFilter;
            const c = pos === 'ALL' ? null : POS_COLORS[pos];
            return (
              <ToggleGroupItem
                key={pos}
                value={pos}
                className="font-label h-8 rounded-md border border-border bg-background px-2.5 text-[11px] font-semibold tracking-wide text-muted-foreground hover:bg-accent hover:text-foreground"
                style={
                  active
                    ? {
                        borderColor: c?.accent ?? POS_COLORS.PICK.accent,
                        background: c?.bg ?? POS_COLORS.PICK.bg,
                        color: c?.accent ?? POS_COLORS.PICK.accent,
                      }
                    : undefined
                }
              >
                {pos}
              </ToggleGroupItem>
            );
          })}
        </ToggleGroup>

        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search player or team..."
          className="w-[210px] rounded-md bg-background text-[12px] focus-visible:border-border focus-visible:ring-1 focus-visible:ring-border"
        />

        <div className="flex items-center gap-1.5">
          <span className="font-label text-[10px] tracking-[1.5px] text-muted-foreground uppercase">
            Strategy
          </span>
          <ToggleGroup
            value={[strategyLens]}
            onValueChange={(vals) =>
              onStrategyLensChange((vals[0] as StrategyLens | undefined) ?? 'rebuild')
            }
            className="gap-[3px]"
          >
            {STRATEGY_LENSES.map((lens) => {
              const active = lens.value === strategyLens;
              return (
                <ToggleGroupItem
                  key={lens.value}
                  value={lens.value}
                  className="font-label h-8 rounded-md border border-border bg-background px-2.5 text-[11px] font-semibold tracking-wide text-muted-foreground hover:bg-accent hover:text-foreground"
                  style={
                    active
                      ? {
                          borderColor: 'var(--text-secondary)',
                          background: 'var(--accent)',
                          color: 'var(--text-primary)',
                        }
                      : undefined
                  }
                >
                  {lens.label}
                </ToggleGroupItem>
              );
            })}
          </ToggleGroup>
        </div>

        <Toggle
          pressed={showNotes}
          onPressedChange={onShowNotesChange}
          variant="outline"
          className="font-label h-8 rounded-md bg-background text-[11px] font-bold tracking-wide uppercase"
        >
          {showNotes ? 'Hide notes' : 'Show notes'}
        </Toggle>

        <Toggle
          pressed={availableOnly}
          onPressedChange={onAvailableOnlyChange}
          variant="outline"
          className="font-label h-8 rounded-md bg-background text-[11px] font-bold tracking-wide uppercase"
        >
          Available only
        </Toggle>

        <div className="ml-auto font-mono text-[11px] text-muted-foreground tabular-nums">
          {resultCount} players shown
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-[18px] border-b border-border-subtle bg-background px-5 py-2 text-[10px] text-muted-foreground">
        <span>
          <b className="text-secondary-fg">Floor</b> = steal territory
        </span>
        <span>
          <b style={{ color: 'var(--primary)' }}>Target</b> = calibrated bid
        </span>
        <span>
          <b style={{ color: 'var(--age-old)' }}>Ceiling</b> = hard stop
        </span>
        <span className="border-l border-border-subtle pl-[18px]">
          Age: <span style={{ color: 'var(--age-young)' }}>≤24</span>{' '}
          <span style={{ color: 'var(--age-prime)' }}>25-27</span>{' '}
          <span style={{ color: 'var(--age-aging)' }}>28-30</span>{' '}
          <span style={{ color: 'var(--age-old)' }}>31+</span>
        </span>
        <span data-testid="pkg-legend">
          <b style={{ color: 'var(--pos-wr)', fontSize: 9 }}>R</b> = Rookie ·{' '}
          <b style={{ color: 'var(--pos-pkg)', fontSize: 9 }}>PKG</b> = {packageLabel}
        </span>
      </div>
    </>
  );
}
