'use client';

import type { Position } from '@/types';
import { POS_COLORS } from '@/lib/posColors';
import { Toggle } from '@/components/ui/toggle';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Input } from '@/components/ui/input';

export type PositionFilter = 'ALL' | Position;

const POSITIONS: PositionFilter[] = ['ALL', 'QB', 'RB', 'WR', 'TE', 'PICK', 'PKG'];

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
}: FilterControlsProps) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-2.5 border-b border-border-subtle bg-[#0d1018] px-5 py-3">
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
                className="font-label rounded-[5px] border border-border px-2.5 py-1 text-[11px] font-semibold tracking-wide text-muted-foreground"
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
          className="w-[180px]"
        />

        <Toggle
          pressed={showNotes}
          onPressedChange={onShowNotesChange}
          variant="outline"
          className="text-[11px]"
        >
          {showNotes ? 'Hide Notes' : 'Show Notes'}
        </Toggle>

        <Toggle
          pressed={availableOnly}
          onPressedChange={onAvailableOnlyChange}
          variant="outline"
          className="text-[11px]"
        >
          Available Only
        </Toggle>

        <div className="ml-auto text-[11px] text-muted-foreground">{resultCount} players shown</div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-[18px] border-b border-border-subtle bg-[#080a10] px-5 py-1.5 text-[10px] text-muted-foreground">
        <span>
          🔻 <b className="text-secondary-fg">Floor</b> = steal territory
        </span>
        <span>
          💰 <b className="text-secondary-fg">Target</b> = calibrated bid
        </span>
        <span>
          🔺 <b className="text-secondary-fg">Ceiling</b> = hard stop
        </span>
        <span className="border-l border-border-subtle pl-[18px]">
          Age: <span style={{ color: 'var(--age-young)' }}>≤24</span>{' '}
          <span style={{ color: 'var(--age-prime)' }}>25–27</span>{' '}
          <span style={{ color: 'var(--age-aging)' }}>28–30</span>{' '}
          <span style={{ color: 'var(--age-old)' }}>31+</span>
        </span>
        <span>
          <b style={{ color: 'var(--pos-wr)', fontSize: 9 }}>R</b> = Rookie ·{' '}
          <b style={{ color: 'var(--pos-pkg)', fontSize: 9 }}>PKG</b> = 2027 1st+2nd+3rd via kicker
          bid
        </span>
      </div>
    </>
  );
}
