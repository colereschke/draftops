'use client';

import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';
import { createDraft } from '@/lib/actions';
import { importFromSleeper } from '@/lib/sleeper-actions';
import { getRankingSummary, type RankingSummary } from '@/lib/rankings-actions';
import type { SleeperImportResult } from '@/lib/sleeper';
import type { StartingSlot, ScoringSettings } from '@/types';
import { DEFAULT_STARTING_LINEUP, DEFAULT_TARGET_ROSTER, DEFAULT_SCORING_SETTINGS } from '@/types';

interface TeamRow {
  handle: string;
  displayName: string;
  isMine: boolean;
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
  const [teamCount, setTeamCount] = useState(12);
  const [budget, setBudget] = useState(1000);
  const [teams, setTeams] = useState<TeamRow[]>(() => defaultTeams(12));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isImporting, startImportTransition] = useTransition();
  const [leagueId, setLeagueId] = useState('');
  const [ownerUsername, setOwnerUsername] = useState('');
  const [importState, setImportState] = useState<ImportState>({ status: 'idle' });
  const [rosterSize, setRosterSize] = useState(30);
  const [targetRoster, setTargetRoster] = useState<Record<'QB' | 'RB' | 'WR' | 'TE', number>>({
    QB: DEFAULT_TARGET_ROSTER.QB ?? 4,
    RB: DEFAULT_TARGET_ROSTER.RB ?? 9,
    WR: DEFAULT_TARGET_ROSTER.WR ?? 11,
    TE: DEFAULT_TARGET_ROSTER.TE ?? 3,
  });
  const [startingLineup, setStartingLineup] = useState<StartingSlot[]>([
    ...DEFAULT_STARTING_LINEUP,
  ]);
  const [scoringSettings, setScoringSettings] = useState<ScoringSettings>({
    ...DEFAULT_SCORING_SETTINGS,
  });
  const [rankingSummary, setRankingSummary] = useState<RankingSummary | null>(null);
  const [playerSource, setPlayerSource] = useState<'etr' | 'custom'>('etr');

  useEffect(() => {
    getRankingSummary().then(setRankingSummary);
  }, []);

  function updateScoring<K extends keyof ScoringSettings>(key: K, value: ScoringSettings[K]) {
    setScoringSettings((prev) => ({ ...prev, [key]: value }));
  }

  function handleTeamCountChange(newCount: number) {
    const clamped = Math.max(2, Math.min(32, newCount));
    setTeamCount(clamped);
    setTeams((prev) => {
      if (clamped > prev.length) {
        const added = Array.from({ length: clamped - prev.length }, (_, i) => ({
          handle: `team-${prev.length + i + 1}`,
          displayName: '',
          isMine: false,
        }));
        return [...prev, ...added];
      }
      return prev.slice(0, clamped);
    });
  }

  function setMine(index: number) {
    setTeams((prev) => prev.map((t, i) => ({ ...t, isMine: i === index })));
  }

  function updateTeam(index: number, field: 'handle' | 'displayName', value: string) {
    setTeams((prev) => prev.map((t, i) => (i === index ? { ...t, [field]: value } : t)));
  }

  const SLOT_OPTIONS: StartingSlot[] = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'SUPER_FLEX'];

  function addSlot() {
    setStartingLineup((prev) => [...prev, 'FLEX']);
  }

  function removeSlot(index: number) {
    setStartingLineup((prev) => prev.filter((_, i) => i !== index));
  }

  function updateSlot(index: number, slot: StartingSlot) {
    setStartingLineup((prev) => prev.map((s, i) => (i === index ? slot : s)));
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
      setTeamCount(data.teamCount);
      setRosterSize(data.rosterSize);
      setStartingLineup(data.startingLineup);
      setScoringSettings(data.scoringSettings);
      setTeams(
        data.teams.map((t: SleeperImportResult['teams'][number], i: number) => ({
          handle: t.handle,
          displayName: t.displayName,
          isMine: data.ownerIndex !== null ? i === data.ownerIndex : i === 0,
        })),
      );
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

    const handles = teams.map((t) => t.handle.trim());
    if (!name.trim()) {
      setError('Draft name is required.');
      return;
    }
    if (handles.some((h) => !h)) {
      setError('All team handles are required.');
      return;
    }
    if (new Set(handles).size !== handles.length) {
      setError('Team handles must be unique.');
      return;
    }

    if (!startingLineup.some((s) => s === 'QB' || s === 'SUPER_FLEX')) {
      setError('Starting lineup must include at least one QB or SUPER_FLEX slot.');
      return;
    }

    startTransition(async () => {
      try {
        await createDraft({
          name: name.trim(),
          budgetPerTeam: budget,
          rosterSize,
          targetRoster,
          startingLineup,
          scoringSettings,
          teams,
          playerSource,
        });
      } catch (err) {
        setError((err as Error).message ?? 'Something went wrong.');
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
              onChange={(e) => setLeagueId(e.target.value)}
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
                type="number"
                min={2}
                max={32}
                value={teamCount}
                onChange={(e) => handleTeamCountChange(parseInt(e.target.value, 10) || 2)}
                style={inputStyle}
              />
            </label>
            <label style={{ ...labelStyle, flex: 1 }}>
              Budget per team ($)
              <input
                type="number"
                min={1}
                value={budget}
                onChange={(e) => setBudget(parseInt(e.target.value, 10) || 1000)}
                style={inputStyle}
              />
            </label>
          </div>
        </div>

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
              value={rosterSize}
              onChange={(e) => setRosterSize(parseInt(e.target.value, 10) || 30)}
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
                  value={targetRoster[pos]}
                  onChange={(e) =>
                    setTargetRoster((prev) => ({
                      ...prev,
                      [pos]: parseInt(e.target.value, 10) || 0,
                    }))
                  }
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
                  value={scoringSettings.passYdsPerPoint}
                  onChange={(e) =>
                    updateScoring('passYdsPerPoint', parseFloat(e.target.value) || 25)
                  }
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
                  value={scoringSettings.passTD}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    updateScoring('passTD', Number.isNaN(v) ? 4 : v);
                  }}
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
                  value={scoringSettings.passInt}
                  onChange={(e) => updateScoring('passInt', parseFloat(e.target.value) || -2)}
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
                  value={scoringSettings.rushAtt}
                  onChange={(e) => updateScoring('rushAtt', parseFloat(e.target.value) || 0)}
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
                  value={scoringSettings.rushFD}
                  onChange={(e) => updateScoring('rushFD', parseFloat(e.target.value) || 0)}
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
                    value={scoringSettings[key]}
                    onChange={(e) => updateScoring(key, parseFloat(e.target.value) || 0)}
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
                    value={scoringSettings[key]}
                    onChange={(e) => updateScoring(key, parseFloat(e.target.value) || 0)}
                    style={inputStyle}
                  />
                </label>
              ))}
            </div>
          </div>
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
