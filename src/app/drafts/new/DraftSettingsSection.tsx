import { MAX_TEAMS, MIN_TEAMS } from '@/lib/draftInputSchema';
import type { UseNumericField } from '@/lib/useNumericField';
import { inputStyle, labelStyle } from './draftFormStyles';

interface DraftSettingsSectionProps {
  name: string;
  teamCountField: UseNumericField;
  budgetField: UseNumericField;
  onNameChange: (name: string) => void;
}

export function DraftSettingsSection({
  name,
  teamCountField,
  budgetField,
  onNameChange,
}: DraftSettingsSectionProps) {
  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        borderRadius: '6px',
        padding: '1.25rem',
        marginBottom: '1rem',
      }}
    >
      <label style={labelStyle}>
        Draft name
        <input
          data-testid="draft-name-input"
          type="text"
          value={name}
          onChange={(event) => onNameChange(event.target.value)}
          placeholder="e.g. Dynasty 2025"
          required
          style={inputStyle}
        />
      </label>

      <div style={{ display: 'flex', gap: '1rem', marginTop: '0.75rem' }}>
        <label style={{ ...labelStyle, flex: 1 }}>
          Teams
          <input
            data-testid="team-count-input"
            type="number"
            min={MIN_TEAMS}
            max={MAX_TEAMS}
            value={teamCountField.value}
            onChange={teamCountField.onChange}
            style={inputStyle}
          />
        </label>
        <label style={{ ...labelStyle, flex: 1 }}>
          Budget per team ($)
          <input
            data-testid="budget-input"
            type="number"
            min={1}
            value={budgetField.value}
            onChange={budgetField.onChange}
            style={inputStyle}
          />
        </label>
      </div>
    </div>
  );
}
