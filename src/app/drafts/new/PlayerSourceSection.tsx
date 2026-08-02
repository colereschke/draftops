import type { RankingSummary } from '@/lib/rankings-actions';
import { labelStyle, sectionHeaderStyle } from './draftFormStyles';

interface PlayerSourceSectionProps {
  rankingSummary: RankingSummary | null;
  playerSource: 'etr' | 'custom';
  onPlayerSourceChange: (source: 'etr' | 'custom') => void;
}

export function PlayerSourceSection({
  rankingSummary,
  playerSource,
  onPlayerSourceChange,
}: PlayerSourceSectionProps) {
  if (!rankingSummary) return null;

  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        borderRadius: '6px',
        padding: '1.25rem',
        marginBottom: '1rem',
      }}
    >
      <div style={sectionHeaderStyle}>Player Pool</div>
      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          marginBottom: '0.5rem',
        }}
      >
        <input
          data-testid="player-source-etr"
          type="radio"
          name="playerSource"
          checked={playerSource === 'etr'}
          onChange={() => onPlayerSourceChange('etr')}
        />
        <span style={labelStyle}>ETR Default</span>
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <input
          data-testid="player-source-custom"
          type="radio"
          name="playerSource"
          checked={playerSource === 'custom'}
          onChange={() => onPlayerSourceChange('custom')}
        />
        <span style={labelStyle}>
          My Custom Rankings ({rankingSummary.totalCount} players, uploaded{' '}
          {rankingSummary.uploadedAt.toLocaleDateString()})
        </span>
      </label>
    </div>
  );
}
