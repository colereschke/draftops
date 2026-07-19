'use client';

import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createDraft } from '@/lib/actions';
import { importFromSleeper } from '@/lib/sleeper-actions';
import { getRankingSummary, type RankingSummary } from '@/lib/rankings-actions';
import { reportClientError } from '@/lib/reportClientError';
import { useNumericField } from '@/lib/useNumericField';
import { draftInputSchema, MIN_TEAMS, MAX_TEAMS, type DraftInput } from '@/lib/draftInputSchema';
import type { DraftMutationCode } from '@/lib/draftMutation';
import type { SleeperImportResult } from '@/lib/sleeper';
import type { FuturePickAuctionMode, StartingSlot } from '@/types';
import { DEFAULT_STARTING_LINEUP, DEFAULT_TARGET_ROSTER, DEFAULT_SCORING_SETTINGS } from '@/types';

function describeCreateDraftError(code: DraftMutationCode): string {
  if (code === 'UNAUTHORIZED') return 'You must be signed in to create a draft.';
  if (code === 'NO_RANKING_SET') {
    return 'No custom ranking set found — upload one on the Rankings page first.';
  }
  if (code === 'DUPLICATE_TEAM') return 'Two teams share a handle or Sleeper roster ID.';
  return 'Something went wrong. Check your draft settings and try again.';
}

interface TeamRow {
  handle: string;
  displayName: string;
  isMine: boolean;
  sleeperRosterId?: number;
}

type ImportState =
  | { status: 'idle' }
  | { status: 'error'; message: string }
  | { status: 'success'; confirm: string; warning: string | null };

function defaultTeams(count: number): TeamRow[] {
  return Array.from({ length: count }, (_, i) => ({
    handle: `team-${i + 1}`,
    displayName: '',
    isMine: i === 0,
  }));
}

export default function NewDraftPage() {
  const [name, setName] = useState('');
  const teamCountField = useNumericField(12);
  const budgetField = useNumericField(1000);
  const rosterSizeField = useNumericField(30);
  const targetRosterQBField = useNumericField(DEFAULT_TARGET_ROSTER.QB ?? 4);
  const targetRosterRBField = useNumericField(DEFAULT_TARGET_ROSTER.RB ?? 9);
  const targetRosterWRField = useNumericField(DEFAULT_TARGET_ROSTER.WR ?? 11);
  const targetRosterTEField = useNumericField(DEFAULT_TARGET_ROSTER.TE ?? 3);
  const targetRosterFields = {
    QB: targetRosterQBField,
    RB: targetRosterRBField,
    WR: targetRosterWRField,
    TE: targetRosterTEField,
  } as const;
  const [teams, setTeams] = useState<TeamRow[]>(() => defaultTeams(12));
  const [syncedTeamCount, setSyncedTeamCount] = useState(12);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isImporting, startImportTransition] = useTransition();
  const [leagueId, setLeagueId] = useState('');
  const [importedLeagueId, setImportedLeagueId] = useState<string | null>(null);
  const [ownerUsername, setOwnerUsername] = useState('');
  const [importState, setImportState] = useState<ImportState>({ status: 'idle' });
  const [futurePickAuctionMode, setFuturePickAuctionMode] =
    useState<FuturePickAuctionMode>('packages');
  const [startingLineup, setStartingLineup] = useState<StartingSlot[]>([
    ...DEFAULT_STARTING_LINEUP,
  ]);
  const passYdsPerPointField = useNumericField(DEFAULT_SCORING_SETTINGS.passYdsPerPoint, {
    float: true,
  });
  const passTDField = useNumericField(DEFAULT_SCORING_SETTINGS.passTD, { float: true });
  const passIntField = useNumericField(DEFAULT_SCORING_SETTINGS.passInt, { float: true });
  const rushAttField = useNumericField(DEFAULT_SCORING_SETTINGS.rushAtt, { float: true });
  const rushFDField = useNumericField(DEFAULT_SCORING_SETTINGS.rushFD, { float: true });
  const pprRBField = useNumericField(DEFAULT_SCORING_SETTINGS.pprRB, { float: true });
  const pprWRField = useNumericField(DEFAULT_SCORING_SETTINGS.pprWR, { float: true });
  const pprTEField = useNumericField(DEFAULT_SCORING_SETTINGS.pprTE, { float: true });
  const recFDField = useNumericField(DEFAULT_SCORING_SETTINGS.recFD, { float: true });
  const rbFDBonusField = useNumericField(DEFAULT_SCORING_SETTINGS.rbFDBonus, { float: true });
  const wrFDBonusField = useNumericField(DEFAULT_SCORING_SETTINGS.wrFDBonus, { float: true });
  const teFDBonusField = useNumericField(DEFAULT_SCORING_SETTINGS.teFDBonus, { float: true });
  const pprFields = { pprRB: pprRBField, pprWR: pprWRField, pprTE: pprTEField } as const;
  const fdBonusFields = {
    recFD: recFDField,
    rbFDBonus: rbFDBonusField,
    wrFDBonus: wrFDBonusField,
    teFDBonus: teFDBonusField,
  } as const;
  const [rankingSummary, setRankingSummary] = useState<RankingSummary | null>(null);
  const [rankingSummaryError, setRankingSummaryError] = useState(false);
  const [playerSource, setPlayerSource] = useState<'etr' | 'custom'>('etr');
  const router = useRouter();

  useEffect(() => {
    getRankingSummary()
      .then(setRankingSummary)
      .catch((err) => {
        console.error('Failed to load ranking summary:', err);
        setRankingSummaryError(true);
      });
  }, []);

  // Resize the `teams` array to track the team count field, clamped to [2, 32] so an
  // unclamped negative or extreme value can't corrupt `Array.prototype.slice` behavior or
  // generate an absurd roster table. This intentionally adjusts state during render (the
  // React-documented pattern for "state derived from a changed value while preserving prior
  // state") rather than in a useEffect, since a synchronous setState in an effect body here
  // would trigger a needless extra commit/render pass.
  const safeTeamCount = Math.max(MIN_TEAMS, Math.min(MAX_TEAMS, teamCountField.numericValue));
  if (safeTeamCount !== syncedTeamCount) {
    setSyncedTeamCount(safeTeamCount);
    setTeams((prev) => {
      if (safeTeamCount > prev.length) {
        const added = Array.from({ length: safeTeamCount - prev.length }, (_, i) => ({
          handle: `team-${prev.length + i + 1}`,
          displayName: '',
          isMine: false,
        }));
        return [...prev, ...added];
      }
      return prev.slice(0, safeTeamCount);
    });
  }

  function setMine(index: number) {
    setTeams((prev) => prev.map((t, i) => ({ ...t, isMine: i === index })));
  }

  function updateTeam(index: number, field: 'handle' | 'displayName', value: string) {
    setTeams((prev) => prev.map((t, i) => (i === index ? { ...t, [field]: value } : t)));
  }

  const SLOT_OPTIONS: StartingSlot[] = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'SUPER_FLEX'];

  function sortSlots(slots: StartingSlot[]): StartingSlot[] {
    return [...slots].sort((a, b) => SLOT_OPTIONS.indexOf(a) - SLOT_OPTIONS.indexOf(b));
  }

  function addSlot() {
    setStartingLineup((prev) => sortSlots([...prev, 'FLEX']));
  }

  function removeSlot(index: number) {
    setStartingLineup((prev) => prev.filter((_, i) => i !== index));
  }

  function updateSlot(index: number, slot: StartingSlot) {
    setStartingLineup((prev) => sortSlots(prev.map((s, i) => (i === index ? slot : s))));
  }

  function handleImport() {
    if (!leagueId.trim()) return;
    setImportState({ status: 'idle' });
    const trimmedUsername = ownerUsername.trim();
    startImportTransition(async () => {
      const result = await importFromSleeper(leagueId.trim(), trimmedUsername || undefined);
      if (!result.ok) {
        setImportState({ status: 'error', message: result.error });
        return;
      }
      const { data } = result;
      if (data.leagueName) setName(data.leagueName);
      teamCountField.setNumericValue(data.teamCount);
      rosterSizeField.setNumericValue(data.rosterSize);
      setStartingLineup(data.startingLineup);
      passYdsPerPointField.setNumericValue(data.scoringSettings.passYdsPerPoint);
      passTDField.setNumericValue(data.scoringSettings.passTD);
      passIntField.setNumericValue(data.scoringSettings.passInt);
      rushAttField.setNumericValue(data.scoringSettings.rushAtt);
      rushFDField.setNumericValue(data.scoringSettings.rushFD);
      pprRBField.setNumericValue(data.scoringSettings.pprRB);
      pprWRField.setNumericValue(data.scoringSettings.pprWR);
      pprTEField.setNumericValue(data.scoringSettings.pprTE);
      recFDField.setNumericValue(data.scoringSettings.recFD);
      rbFDBonusField.setNumericValue(data.scoringSettings.rbFDBonus);
      wrFDBonusField.setNumericValue(data.scoringSettings.wrFDBonus);
      teFDBonusField.setNumericValue(data.scoringSettings.teFDBonus);
      setTeams(
        data.teams.map((t: SleeperImportResult['teams'][number], i: number) => ({
          handle: t.handle,
          displayName: t.displayName,
          isMine: data.ownerIndex !== null ? i === data.ownerIndex : i === 0,
          sleeperRosterId: t.sleeperRosterId,
        })),
      );
      setImportedLeagueId(leagueId.trim());
      const warning =
        trimmedUsername && data.ownerIndex === null
          ? `Couldn't match '${trimmedUsername}' to a team in this league — select yours manually.`
          : null;
      setImportState({
        status: 'success',
        confirm: `Imported from Sleeper · ${data.teamCount} teams · ${data.startingLineup.length} starting slots`,
        warning,
      });
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const requiredNumericFields = [
      { label: 'Team count', value: teamCountField.value },
      { label: 'Budget per team', value: budgetField.value },
      { label: 'Roster size', value: rosterSizeField.value },
      { label: 'Target roster QB', value: targetRosterFields.QB.value },
      { label: 'Target roster RB', value: targetRosterFields.RB.value },
      { label: 'Target roster WR', value: targetRosterFields.WR.value },
      { label: 'Target roster TE', value: targetRosterFields.TE.value },
      { label: 'Passing yards per point', value: passYdsPerPointField.value },
      { label: 'Passing TD', value: passTDField.value },
      { label: 'Interception', value: passIntField.value },
      { label: 'Rush attempt bonus', value: rushAttField.value },
      { label: 'Rush first-down bonus', value: rushFDField.value },
      { label: 'RB PPR', value: pprRBField.value },
      { label: 'WR PPR', value: pprWRField.value },
      { label: 'TE PPR', value: pprTEField.value },
      { label: 'Receiving first-down bonus', value: recFDField.value },
      { label: 'RB receiving first-down bonus', value: rbFDBonusField.value },
      { label: 'WR receiving first-down bonus', value: wrFDBonusField.value },
      { label: 'TE receiving first-down bonus', value: teFDBonusField.value },
    ];
    const blankNumericField = requiredNumericFields.find((field) => field.value.trim() === '');
    if (blankNumericField) {
      setError(`${blankNumericField.label} is required.`);
      return;
    }

    const candidate: DraftInput = {
      name,
      budgetPerTeam: budgetField.numericValue,
      rosterSize: rosterSizeField.numericValue,
      futurePickAuctionMode,
      targetRoster: {
        QB: targetRosterFields.QB.numericValue,
        RB: targetRosterFields.RB.numericValue,
        WR: targetRosterFields.WR.numericValue,
        TE: targetRosterFields.TE.numericValue,
      },
      startingLineup,
      scoringSettings: {
        passYdsPerPoint: passYdsPerPointField.numericValue,
        passTD: passTDField.numericValue,
        passInt: passIntField.numericValue,
        rushAtt: rushAttField.numericValue,
        rushFD: rushFDField.numericValue,
        pprRB: pprRBField.numericValue,
        pprWR: pprWRField.numericValue,
        pprTE: pprTEField.numericValue,
        recFD: recFDField.numericValue,
        rbFDBonus: rbFDBonusField.numericValue,
        wrFDBonus: wrFDBonusField.numericValue,
        teFDBonus: teFDBonusField.numericValue,
      },
      teams,
      playerSource,
      sleeperLeagueId: importedLeagueId ?? undefined,
    };

    const parsed = draftInputSchema.safeParse(candidate);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Invalid draft settings.');
      return;
    }

    startTransition(async () => {
      try {
        const result = await createDraft(parsed.data);
        if (!result.ok) {
          setError(describeCreateDraftError(result.code));
          return;
        }
        router.push(`/draft/${result.data.draftId}`);
      } catch (error) {
        const reportedError =
          error instanceof Error ? error : new Error('Unknown draft creation error');
        reportClientError(reportedError);
        setError('Draft creation failed. Please try again.');
      }
    });
  }

  return (
    <main style={{ padding: '2rem', maxWidth: '680px', margin: '0 auto' }}>
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
              onChange={(e) => {
                const nextLeagueId = e.target.value;
                setLeagueId(nextLeagueId);
                if (importedLeagueId && nextLeagueId.trim() !== importedLeagueId) {
                  setImportedLeagueId(null);
                  setTeams((prev) => prev.map(({ sleeperRosterId: _, ...team }) => team));
                  setImportState({ status: 'idle' });
                }
              }}
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
              color: '#e05050',
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
            {importState.warning && (
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
                {importState.warning}
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
                type="text"
                value={team.handle}
                onChange={(e) => updateTeam(i, 'handle', e.target.value)}
                required
                style={inputStyle}
              />
              <input
                type="text"
                value={team.displayName}
                onChange={(e) => updateTeam(i, 'displayName', e.target.value)}
                placeholder={team.handle || `team-${i + 1}`}
                style={inputStyle}
              />
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <input
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
              color: '#e05050',
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

const labelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.3rem',
  fontFamily: 'var(--font-barlow)',
  fontSize: '0.8rem',
  color: 'var(--text-secondary)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

const inputStyle: React.CSSProperties = {
  background: 'var(--bg-base)',
  border: '1px solid #2a2f3e',
  borderRadius: '4px',
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-mono)',
  fontSize: '0.875rem',
  padding: '0.35rem 0.6rem',
  width: '100%',
  boxSizing: 'border-box',
};

const colHeaderStyle: React.CSSProperties = {
  fontFamily: 'var(--font-barlow)',
  fontSize: '0.7rem',
  color: 'var(--text-secondary)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

const sectionHeaderStyle: React.CSSProperties = {
  fontFamily: 'var(--font-barlow)',
  fontSize: '0.8rem',
  color: 'var(--text-secondary)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  marginBottom: '0.75rem',
};

const subSectionStyle: React.CSSProperties = {
  fontFamily: 'var(--font-barlow)',
  fontSize: '0.72rem',
  color: 'var(--text-secondary)',
  textTransform: 'uppercase',
  letterSpacing: '0.03em',
  marginBottom: '0.4rem',
};

const cancelLinkStyle: React.CSSProperties = {
  color: 'var(--text-secondary)',
  fontFamily: 'var(--font-barlow)',
  fontSize: '0.875rem',
  fontWeight: 700,
  letterSpacing: '0.05em',
  textDecoration: 'none',
  textTransform: 'uppercase',
};
