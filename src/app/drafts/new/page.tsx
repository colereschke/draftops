'use client';

import { useState, useTransition } from 'react';
import { createDraft } from '@/lib/actions';

interface TeamRow {
  handle: string;
  displayName: string;
  isMine: boolean;
}

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

    startTransition(async () => {
      try {
        await createDraft({ name: name.trim(), budgetPerTeam: budget, teams });
      } catch (err) {
        setError((err as Error).message ?? 'Something went wrong.');
      }
    });
  }

  return (
    <main style={{ padding: '2rem', maxWidth: '680px', margin: '0 auto' }}>
      <h1
        style={{
          fontFamily: 'var(--font-barlow)',
          fontSize: '1.5rem',
          color: 'var(--text-primary)',
          marginBottom: '1.5rem',
        }}
      >
        New Draft
      </h1>

      <form onSubmit={handleSubmit}>
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
