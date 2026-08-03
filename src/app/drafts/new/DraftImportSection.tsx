import type { ImportState } from './draftFormTypes';
import { inputStyle, labelStyle, sectionHeaderStyle } from './draftFormStyles';

interface DraftImportSectionProps {
  leagueId: string;
  ownerUsername: string;
  importState: ImportState;
  isImporting: boolean;
  onLeagueIdChange: (leagueId: string) => void;
  onOwnerUsernameChange: (ownerUsername: string) => void;
  onImport: () => void;
}

export function DraftImportSection({
  leagueId,
  ownerUsername,
  importState,
  isImporting,
  onLeagueIdChange,
  onOwnerUsernameChange,
  onImport,
}: DraftImportSectionProps) {
  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        borderRadius: '6px',
        padding: '1.25rem',
        marginBottom: '1.5rem',
      }}
    >
      <div style={sectionHeaderStyle}>Import from Sleeper</div>
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.75rem' }}>
        <label style={{ ...labelStyle, flex: 1 }}>
          League ID
          <input
            data-testid="sleeper-league-id"
            type="text"
            value={leagueId}
            onChange={(event) => onLeagueIdChange(event.target.value)}
            placeholder="e.g. 1360707683916734464"
            style={inputStyle}
          />
        </label>
        <label style={{ ...labelStyle, flex: 1 }}>
          Your Sleeper username (optional)
          <input
            data-testid="sleeper-owner-username"
            type="text"
            value={ownerUsername}
            onChange={(event) => onOwnerUsernameChange(event.target.value)}
            placeholder="e.g. coreschke"
            style={inputStyle}
          />
        </label>
      </div>
      <button
        type="button"
        data-testid="sleeper-import-button"
        onClick={onImport}
        disabled={isImporting || !leagueId.trim()}
        style={{
          background: isImporting ? 'var(--text-secondary)' : 'var(--pos-te)',
          color: '#fff',
          border: 'none',
          borderRadius: '4px',
          padding: '0.4rem 1rem',
          fontFamily: 'var(--font-barlow)',
          fontSize: '0.875rem',
          cursor: isImporting || !leagueId.trim() ? 'not-allowed' : 'pointer',
        }}
      >
        {isImporting ? 'Importing…' : 'Import'}
      </button>
      {importState.status === 'error' && (
        <p
          data-testid="sleeper-import-error"
          style={{
            color: 'var(--destructive)',
            fontFamily: 'var(--font-barlow)',
            fontSize: '0.8rem',
            marginTop: '0.5rem',
            marginBottom: 0,
          }}
        >
          {importState.message}
        </p>
      )}
      {importState.status === 'success' && (
        <>
          <p
            data-testid="sleeper-import-confirm"
            style={{
              color: 'var(--pos-rb)',
              fontFamily: 'var(--font-barlow)',
              fontSize: '0.8rem',
              marginTop: '0.5rem',
              marginBottom: 0,
            }}
          >
            {importState.confirm}
          </p>
          {importState.warnings.length > 0 && (
            <p
              data-testid="sleeper-import-warning"
              style={{
                color: 'var(--age-aging)',
                fontFamily: 'var(--font-barlow)',
                fontSize: '0.8rem',
                marginTop: '0.25rem',
                marginBottom: 0,
              }}
            >
              {importState.warnings.join(' ')}
            </p>
          )}
        </>
      )}
    </div>
  );
}
