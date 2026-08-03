'use client';

import Link from 'next/link';
import { DraftImportSection } from './DraftImportSection';
import { DraftSettingsSection } from './DraftSettingsSection';
import { FuturePicksSection } from './FuturePicksSection';
import { PlayerSourceSection } from './PlayerSourceSection';
import { RosterSettingsSection } from './RosterSettingsSection';
import { ScoringSection } from './ScoringSection';
import { StartingLineupSection } from './StartingLineupSection';
import { TeamRosterSection } from './TeamRosterSection';
import { cancelLinkStyle } from './draftFormStyles';
import { useDraftFormState } from './useDraftFormState';

export default function NewDraftPage() {
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

      <DraftImportSection
        leagueId={leagueId}
        ownerUsername={ownerUsername}
        importState={importState}
        isImporting={isImporting}
        onLeagueIdChange={handleLeagueIdChange}
        onOwnerUsernameChange={setOwnerUsername}
        onImport={handleImport}
      />

      <form data-testid="new-draft-form" onSubmit={handleSubmit}>
        <DraftSettingsSection
          name={name}
          teamCountField={teamCountField}
          budgetField={budgetField}
          onNameChange={setName}
        />

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

        <PlayerSourceSection
          rankingSummary={rankingSummary}
          playerSource={playerSource}
          onPlayerSourceChange={setPlayerSource}
        />
        <RosterSettingsSection
          rosterSizeField={rosterSizeField}
          targetRosterFields={targetRosterFields}
        />
        <StartingLineupSection
          startingLineup={startingLineup}
          onAddSlot={addSlot}
          onRemoveSlot={removeSlot}
          onUpdateSlot={updateSlot}
        />
        <ScoringSection
          pprFields={pprFields}
          fdBonusFields={fdBonusFields}
          passYdsPerPointField={passYdsPerPointField}
          passTDField={passTDField}
          passIntField={passIntField}
          rushAttField={rushAttField}
          rushFDField={rushFDField}
        />
        <FuturePicksSection
          futurePickAuctionMode={futurePickAuctionMode}
          onFuturePickAuctionModeChange={setFuturePickAuctionMode}
        />
        <TeamRosterSection teams={teams} onUpdateTeam={updateTeam} onSetMine={setMine} />

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
