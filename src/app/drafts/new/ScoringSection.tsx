import type { UseNumericField } from '@/lib/useNumericField';
import { inputStyle, labelStyle, sectionHeaderStyle, subSectionStyle } from './draftFormStyles';

interface ScoringSectionProps {
  pprFields: Record<'pprRB' | 'pprWR' | 'pprTE', UseNumericField>;
  fdBonusFields: Record<'recFD' | 'rbFDBonus' | 'wrFDBonus' | 'teFDBonus', UseNumericField>;
  passYdsPerPointField: UseNumericField;
  passTDField: UseNumericField;
  passIntField: UseNumericField;
  rushAttField: UseNumericField;
  rushFDField: UseNumericField;
}

export function ScoringSection({
  pprFields,
  fdBonusFields,
  passYdsPerPointField,
  passTDField,
  passIntField,
  rushAttField,
  rushFDField,
}: ScoringSectionProps) {
  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        borderRadius: '6px',
        padding: '1.25rem',
        marginBottom: '1rem',
      }}
    >
      <div style={sectionHeaderStyle}>Scoring</div>

      <div style={{ marginBottom: '0.875rem' }}>
        <div style={subSectionStyle}>Passing</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
          <label style={labelStyle}>
            Yds / point
            <input
              data-testid="scoring-passYdsPerPoint"
              type="number"
              min={1}
              step="any"
              value={passYdsPerPointField.value}
              onChange={passYdsPerPointField.onChange}
              style={inputStyle}
            />
          </label>
          <label style={labelStyle}>
            Passing TD
            <input
              data-testid="scoring-passTD"
              type="number"
              min={0}
              step="any"
              value={passTDField.value}
              onChange={passTDField.onChange}
              style={inputStyle}
            />
          </label>
          <label style={labelStyle}>
            Interception
            <input
              data-testid="scoring-passInt"
              type="number"
              max={0}
              step="any"
              value={passIntField.value}
              onChange={passIntField.onChange}
              style={inputStyle}
            />
          </label>
        </div>
      </div>

      <div style={{ marginBottom: '0.875rem' }}>
        <div style={subSectionStyle}>Rushing (all positions)</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem' }}>
          <label style={labelStyle}>
            Rush attempt bonus
            <input
              data-testid="scoring-rushAtt"
              type="number"
              min={0}
              step="any"
              value={rushAttField.value}
              onChange={rushAttField.onChange}
              style={inputStyle}
            />
          </label>
          <label style={labelStyle}>
            Rush 1st down bonus
            <input
              data-testid="scoring-rushFD"
              type="number"
              min={0}
              step="any"
              value={rushFDField.value}
              onChange={rushFDField.onChange}
              style={inputStyle}
            />
          </label>
        </div>
      </div>

      <div style={{ marginBottom: '0.875rem' }}>
        <div style={subSectionStyle}>Reception (PPR)</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
          {(
            [
              { position: 'RB', key: 'pprRB' },
              { position: 'WR', key: 'pprWR' },
              { position: 'TE', key: 'pprTE' },
            ] as const
          ).map(({ position, key }) => (
            <label key={position} style={labelStyle}>
              {position}
              <input
                data-testid={`scoring-${key}`}
                type="number"
                min={0}
                step="any"
                value={pprFields[key].value}
                onChange={pprFields[key].onChange}
                style={inputStyle}
              />
            </label>
          ))}
        </div>
      </div>

      <div>
        <div style={subSectionStyle}>Receiving 1st down bonus</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}>
          {(
            [
              { label: 'All', key: 'recFD' },
              { label: 'RB', key: 'rbFDBonus' },
              { label: 'WR', key: 'wrFDBonus' },
              { label: 'TE', key: 'teFDBonus' },
            ] as const
          ).map(({ label, key }) => (
            <label key={key} style={labelStyle}>
              {label}
              <input
                data-testid={`scoring-${key}`}
                type="number"
                min={0}
                step="any"
                value={fdBonusFields[key].value}
                onChange={fdBonusFields[key].onChange}
                style={inputStyle}
              />
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
