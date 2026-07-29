'use client';

import Link from 'next/link';
import type { FuturePickAuctionMode, StartingSlot } from '@/types';
import { MIN_TEAMS, MAX_TEAMS } from '@/lib/draftInputSchema';
import {
  cancelLinkStyle,
  colHeaderStyle,
  inputStyle,
  labelStyle,
  sectionHeaderStyle,
  subSectionStyle,
} from './draftFormStyles';
import { useDraftFormState } from './useDraftFormState';

export default function NewDraftPage() {
  const SLOT_OPTIONS: StartingSlot[] = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'SUPER_FLEX'];
  const {
    name,
    setName,
    teamCountField,
    budgetField,
    rosterSizeField,
    targetRosterFields,
    teams,
    error,
    isPending,
    leagueId,
    ownerUsername,
    importState,
    isImporting,
    futurePickAuctionMode,
    setFuturePickAuctionMode,
    startingLineup,
    pprFields,
    fdBonusFields,
    passYdsPerPointField,
    passTDField,
    passIntField,
    rushAttField,
    rushFDField,
    rankingSummary,
    rankingSummaryError,
    playerSource,
    setPlayerSource,
    handleLeagueIdChange,
    setOwnerUsername,
    setMine,
    updateTeam,
    addSlot,
    removeSlot,
    updateSlot,
    handleImport,
    handleSubmit,
  } = useDraftFormState();

  return (
    <main
      id="main-content"
      tabIndex={-1}
      style={{ padding: '2rem', maxWidth: '680px', margin: '0 auto' }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '1.5rem',
        }}
      >
        <h1
          style={{
            fontFamily: 'var(--font-barlow)',
            fontSize: '1.5rem',
            color: 'var(--text-primary)',
            margin: 0,
          }}
        >
          New Draft
        </h1>
        <Link href="/drafts" style={cancelLinkStyle}>
          Cancel
        </Link>
      </div>

      {/* --- Import from Sleeper --- */}
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
              onChange={(e) => handleLeagueIdChange(e.target.value)}
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
              onChange={(e) => setOwnerUsername(e.target.value)}
              placeholder="e.g. coreschke"
              style={inputStyle}
            />
          </label>
        </div>
        <button
          type="button"
          data-testid="sleeper-import-button"
          onClick={handleImport}
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

      <form data-testid="new-draft-form" onSubmit={handleSubmit}>
        {/* --- Draft Settings --- */}
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
              onChange={(e) => setName(e.target.value)}
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

        {rankingSummaryError && (
          <p
            data-testid="ranking-summary-error"
            style={{
              color: 'var(--age-aging)',
              fontFamily: 'var(--font-barlow)',
              fontSize: '0.8rem',
              marginTop: '-0.5rem',
              marginBottom: '1rem',
            }}
          >
            Couldn&apos;t check for a custom ranking set — you can still create a draft with the ETR
            default pool.
          </p>
        )}

        {rankingSummary && (
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
                onChange={() => setPlayerSource('etr')}
              />
              <span style={labelStyle}>ETR Default</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                data-testid="player-source-custom"
                type="radio"
                name="playerSource"
                checked={playerSource === 'custom'}
                onChange={() => setPlayerSource('custom')}
              />
              <span style={labelStyle}>
                My Custom Rankings ({rankingSummary.totalCount} players, uploaded{' '}
                {rankingSummary.uploadedAt.toLocaleDateString()})
              </span>
            </label>
          </div>
        )}

        {/* --- Roster Settings --- */}
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
            {(['QB', 'RB', 'WR', 'TE'] as const).map((pos) => (
              <label key={pos} style={labelStyle}>
                {pos}
                <input
                  data-testid={`target-roster-${pos}`}
                  type="number"
                  min={0}
                  value={targetRosterFields[pos].value}
                  onChange={targetRosterFields[pos].onChange}
                  style={inputStyle}
                />
              </label>
            ))}
          </div>
        </div>

        {/* --- Starting Lineup --- */}
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

          {startingLineup.map((slot, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                gap: '0.5rem',
                marginBottom: '0.4rem',
                alignItems: 'center',
              }}
            >
              <select
                data-testid={`lineup-slot-${i}`}
                value={slot}
                onChange={(e) => updateSlot(i, e.target.value as StartingSlot)}
                style={{ ...inputStyle, flex: 1 }}
              >
                {SLOT_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
              <button
                type="button"
                data-testid={`remove-lineup-slot-${i}`}
                onClick={() => removeSlot(i)}
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
            onClick={addSlot}
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

        {/* --- Scoring --- */}
        <div
          style={{
            background: 'var(--bg-surface)',
            borderRadius: '6px',
            padding: '1.25rem',
            marginBottom: '1rem',
          }}
        >
          <div style={sectionHeaderStyle}>Scoring</div>

          {/* Passing */}
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

          {/* Rushing */}
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

          {/* Reception (PPR) */}
          <div style={{ marginBottom: '0.875rem' }}>
            <div style={subSectionStyle}>Reception (PPR)</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
              {(
                [
                  { pos: 'RB', key: 'pprRB' },
                  { pos: 'WR', key: 'pprWR' },
                  { pos: 'TE', key: 'pprTE' },
                ] as const
              ).map(({ pos, key }) => (
                <label key={pos} style={labelStyle}>
                  {pos}
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

          {/* First down bonuses */}
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

        {/* --- Future Picks --- */}
        <div
          style={{
            background: 'var(--bg-surface)',
            borderRadius: '6px',
            padding: '1.25rem',
            marginBottom: '1rem',
          }}
        >
          <div style={sectionHeaderStyle}>Future Picks</div>
          <label style={labelStyle}>
            Next-year pick auction mode
            <select
              data-testid="future-pick-auction-mode"
              value={futurePickAuctionMode}
              onChange={(e) => setFuturePickAuctionMode(e.target.value as FuturePickAuctionMode)}
              style={inputStyle}
            >
              <option value="packages">Team packages</option>
              <option value="individual">Individual team picks</option>
              <option value="none">Not auctioned</option>
            </select>
          </label>
        </div>

        {/* --- Team Roster Table --- */}
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

          {teams.map((team, i) => (
            <div
              key={i}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 60px',
                gap: '0.5rem',
                marginBottom: '0.4rem',
                alignItems: 'center',
              }}
            >
              <input
                data-testid={`team-handle-${i}`}
                type="text"
                value={team.handle}
                onChange={(e) => updateTeam(i, 'handle', e.target.value)}
                required
                style={inputStyle}
              />
              <input
                data-testid={`team-display-name-${i}`}
                type="text"
                value={team.displayName}
                onChange={(e) => updateTeam(i, 'displayName', e.target.value)}
                placeholder={team.handle || `team-${i + 1}`}
                style={inputStyle}
              />
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <input
                  data-testid={`team-mine-${i}`}
                  type="radio"
                  name="mine"
                  checked={team.isMine}
                  onChange={() => setMine(i)}
                  style={{ cursor: 'pointer' }}
                />
              </div>
            </div>
          ))}
        </div>

        {error && (
          <p
            data-testid="draft-form-error"
            style={{
              color: 'var(--destructive)',
              fontFamily: 'var(--font-barlow)',
              fontSize: '0.875rem',
              marginBottom: '0.75rem',
            }}
          >
            {error}
          </p>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button
            type="submit"
            disabled={isPending}
            style={{
              background: isPending ? 'var(--text-secondary)' : 'var(--pos-qb)',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              padding: '0.5rem 1.5rem',
              fontFamily: 'var(--font-barlow)',
              fontSize: '1rem',
              cursor: isPending ? 'not-allowed' : 'pointer',
            }}
          >
            {isPending ? 'Creating…' : 'Create Draft'}
          </button>
          <Link href="/drafts" style={cancelLinkStyle}>
            Cancel
          </Link>
        </div>
      </form>
    </main>
  );
}
