import type { StartingSlot } from '@/types';
import { inputStyle, sectionHeaderStyle } from './draftFormStyles';

interface StartingLineupSectionProps {
  startingLineup: StartingSlot[];
  onAddSlot: () => void;
  onRemoveSlot: (index: number) => void;
  onUpdateSlot: (index: number, slot: StartingSlot) => void;
}

const SLOT_OPTIONS: StartingSlot[] = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'SUPER_FLEX'];

export function StartingLineupSection({
  startingLineup,
  onAddSlot,
  onRemoveSlot,
  onUpdateSlot,
}: StartingLineupSectionProps) {
  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        borderRadius: '6px',
        padding: '1.25rem',
        marginBottom: '1rem',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '0.5rem',
        }}
      >
        <div style={sectionHeaderStyle}>Starting Lineup</div>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.75rem',
            color: 'var(--text-secondary)',
          }}
        >
          {startingLineup.length} slots
        </span>
      </div>

      {startingLineup.map((slot, index) => (
        <div
          key={index}
          style={{
            display: 'flex',
            gap: '0.5rem',
            marginBottom: '0.4rem',
            alignItems: 'center',
          }}
        >
          <select
            data-testid={`lineup-slot-${index}`}
            value={slot}
            onChange={(event) => onUpdateSlot(index, event.target.value as StartingSlot)}
            style={{ ...inputStyle, flex: 1 }}
          >
            {SLOT_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <button
            type="button"
            data-testid={`remove-lineup-slot-${index}`}
            onClick={() => onRemoveSlot(index)}
            disabled={startingLineup.length <= 1}
            style={{
              background: 'none',
              border: '1px solid #3a3f50',
              color: 'var(--text-secondary)',
              borderRadius: '4px',
              padding: '0.2rem 0.5rem',
              cursor: startingLineup.length <= 1 ? 'not-allowed' : 'pointer',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.875rem',
            }}
          >
            ×
          </button>
        </div>
      ))}

      <button
        type="button"
        data-testid="add-lineup-slot"
        onClick={onAddSlot}
        style={{
          marginTop: '0.4rem',
          background: 'none',
          border: '1px solid #3a3f50',
          color: 'var(--text-secondary)',
          borderRadius: '4px',
          padding: '0.3rem 0.75rem',
          fontFamily: 'var(--font-barlow)',
          fontSize: '0.8rem',
          cursor: 'pointer',
        }}
      >
        + Add slot
      </button>
    </div>
  );
}
