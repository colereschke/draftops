import type { TeamRow } from './draftFormTypes';
import { colHeaderStyle, inputStyle } from './draftFormStyles';

interface TeamRosterSectionProps {
  teams: TeamRow[];
  onUpdateTeam: (index: number, field: 'handle' | 'displayName', value: string) => void;
  onSetMine: (index: number) => void;
}

export function TeamRosterSection({ teams, onUpdateTeam, onSetMine }: TeamRosterSectionProps) {
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
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 60px',
          gap: '0.5rem',
          marginBottom: '0.5rem',
        }}
      >
        <span style={colHeaderStyle}>Handle</span>
        <span style={colHeaderStyle}>Display name</span>
        <span style={{ ...colHeaderStyle, textAlign: 'center' }}>Mine</span>
      </div>

      {teams.map((team, index) => (
        <div
          key={index}
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 60px',
            gap: '0.5rem',
            marginBottom: '0.4rem',
            alignItems: 'center',
          }}
        >
          <input
            data-testid={`team-handle-${index}`}
            type="text"
            value={team.handle}
            onChange={(event) => onUpdateTeam(index, 'handle', event.target.value)}
            required
            style={inputStyle}
          />
          <input
            type="text"
            value={team.displayName}
            onChange={(event) => onUpdateTeam(index, 'displayName', event.target.value)}
            placeholder={team.handle || `team-${index + 1}`}
            style={inputStyle}
          />
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <input
              data-testid={`team-mine-${index}`}
              type="radio"
              name="mine"
              checked={team.isMine}
              onChange={() => onSetMine(index)}
              style={{ cursor: 'pointer' }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
