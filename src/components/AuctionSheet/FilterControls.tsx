'use client';

import type { Position, StrategyTag } from '@/types';
import { POS_COLORS } from '@/lib/posColors';
import { Button } from '@/components/ui/button';
import { Toggle } from '@/components/ui/toggle';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Input } from '@/components/ui/input';

export type PositionFilter = 'ALL' | Position;

const POSITIONS: PositionFilter[] = ['ALL', 'QB', 'RB', 'WR', 'TE', 'PICK', 'PKG'];

export type StrategyFilter = StrategyTag | 'ALL';

const STRATEGY_CHIPS: Array<{ value: StrategyFilter; label: string }> = [
  { value: 'ALL', label: 'All' },
  { value: 'WIN-NOW', label: 'Win-now' },
  { value: 'BARGAIN', label: 'Bargain' },
  { value: 'FUTURE', label: 'Future' },
  { value: 'FADE', label: 'Fade' },
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
  resultCount: number;
  futurePickYear?: number | null;
  strategyFilter: StrategyFilter;
  onStrategyFilterChange: (value: StrategyFilter) => void;
  showStrategyFilter?: boolean;
  onOpenSleeperSync?: () => void;
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
  resultCount,
  futurePickYear,
  strategyFilter,
  onStrategyFilterChange,
  showStrategyFilter = false,
  onOpenSleeperSync,
}: FilterControlsProps) {
  const packageLabel = futurePickYear ? `${futurePickYear} pick package` : 'pick package';

  return (
    <>
      <div className="flex flex-col gap-2.5 border-b border-border-subtle bg-card px-5 py-3 md:flex-row md:flex-wrap md:items-center">
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
          className="w-full rounded-md bg-background text-[12px] focus-visible:border-border focus-visible:ring-1 focus-visible:ring-border md:w-[210px]"
        />

        <div className="flex flex-wrap items-center gap-2.5 md:contents">
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
        </div>

        <div className="font-mono text-[11px] text-muted-foreground tabular-nums md:ml-auto">
          {resultCount} players shown
        </div>

        {onOpenSleeperSync && (
          <Button
            data-testid="open-sleeper-sync"
            variant="outline"
            size="sm"
            className="h-8 text-[11px]"
            onClick={onOpenSleeperSync}
          >
            Catch up from Sleeper
          </Button>
        )}

        {showStrategyFilter && (
          <ToggleGroup
            value={[strategyFilter]}
            onValueChange={(vals) =>
              onStrategyFilterChange((vals[0] as StrategyFilter | undefined) ?? 'ALL')
            }
            className="w-full flex-wrap gap-[3px] md:w-auto"
          >
            {STRATEGY_CHIPS.map((chip) => (
              <ToggleGroupItem
                key={chip.value}
                value={chip.value}
                data-testid={`strategy-chip-${chip.value}`}
                className="font-label h-8 rounded-md border border-border bg-background px-2.5 text-[11px] font-semibold tracking-wide text-muted-foreground hover:bg-accent hover:text-foreground data-[state=on]:border-[var(--pos-pick)] data-[state=on]:text-[var(--pos-pick)]"
              >
                {chip.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        )}
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
