import type { UseNumericField } from '@/lib/useNumericField';
import { inputStyle, labelStyle, sectionHeaderStyle } from './draftFormStyles';

interface RosterSettingsSectionProps {
  rosterSizeField: UseNumericField;
  targetRosterFields: Record<'QB' | 'RB' | 'WR' | 'TE', UseNumericField>;
}

export function RosterSettingsSection({
  rosterSizeField,
  targetRosterFields,
}: RosterSettingsSectionProps) {
  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        borderRadius: '6px',
        padding: '1.25rem',
        marginBottom: '1rem',
      }}
    >
      <div style={sectionHeaderStyle}>Roster Settings</div>
      <label style={{ ...labelStyle, maxWidth: '160px', marginBottom: '0.75rem' }}>
        Roster size
        <input
          data-testid="roster-size-input"
          type="number"
          min={10}
          max={60}
          value={rosterSizeField.value}
          onChange={rosterSizeField.onChange}
          style={inputStyle}
        />
      </label>
      <div style={sectionHeaderStyle}>Target roster slots</div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '0.5rem',
          marginTop: '0.4rem',
        }}
      >
        {(['QB', 'RB', 'WR', 'TE'] as const).map((position) => (
          <label key={position} style={labelStyle}>
            {position}
            <input
              data-testid={`target-roster-${position}`}
              type="number"
              min={0}
              value={targetRosterFields[position].value}
              onChange={targetRosterFields[position].onChange}
              style={inputStyle}
            />
          </label>
        ))}
      </div>
    </div>
  );
}
