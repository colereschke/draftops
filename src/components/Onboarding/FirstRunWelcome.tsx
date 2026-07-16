'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { beginOnboarding, completeOnboarding } from '@/lib/onboarding-actions';

interface FirstRunWelcomeProps {
  eligible: boolean;
}

type WelcomeAction = 'create' | 'skip' | null;

export default function FirstRunWelcome({ eligible }: FirstRunWelcomeProps) {
  const router = useRouter();
  const [visible, setVisible] = useState(eligible);
  const [pendingAction, setPendingAction] = useState<WelcomeAction>(null);
  const [error, setError] = useState<string | null>(null);

  if (!visible) return null;

  async function handleCreate() {
    setPendingAction('create');
    setError(null);

    try {
      await beginOnboarding();
      router.push('/drafts/new');
    } catch {
      setError('Could not start setup. Please try again.');
    } finally {
      setPendingAction(null);
    }
  }

  async function handleSkip() {
    setPendingAction('skip');
    setError(null);

    try {
      await completeOnboarding();
      setVisible(false);
    } catch {
      setError('Could not skip setup. Please try again.');
    } finally {
      setPendingAction(null);
    }
  }

  const isPending = pendingAction !== null;

  return (
    <section
      data-testid="first-run-welcome"
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-default)',
        borderLeft: '3px solid var(--pos-qb)',
        borderRadius: '6px',
        marginBottom: '1.5rem',
        padding: '1.25rem',
      }}
    >
      <p
        style={{
          color: 'var(--pos-qb)',
          fontFamily: 'var(--font-barlow)',
          fontSize: '0.75rem',
          letterSpacing: '0.08em',
          margin: '0 0 0.35rem',
          textTransform: 'uppercase',
        }}
      >
        First draft
      </p>
      <h2
        style={{
          color: 'var(--text-primary)',
          fontFamily: 'var(--font-barlow)',
          fontSize: '1.25rem',
          margin: 0,
        }}
      >
        Set up your league
      </h2>
      <p style={{ color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0.5rem 0 1rem' }}>
        Create your first draft to tailor the auction board to your league. You can also start on
        your own from the standard draft form.
      </p>
      {error && (
        <p
          data-testid="first-run-welcome-error"
          role="alert"
          style={{ color: 'var(--age-old)', margin: '0 0 0.75rem' }}
        >
          {error}
        </p>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
        <button
          data-testid="first-run-create-draft"
          disabled={isPending}
          onClick={handleCreate}
          style={{
            background: 'var(--pos-qb)',
            border: 0,
            borderRadius: '4px',
            color: '#fff',
            cursor: isPending ? 'wait' : 'pointer',
            fontFamily: 'var(--font-barlow)',
            padding: '0.45rem 1rem',
          }}
          type="button"
        >
          {pendingAction === 'create' ? 'Starting…' : 'Set up draft'}
        </button>
        <button
          data-testid="first-run-skip"
          disabled={isPending}
          onClick={handleSkip}
          style={{
            background: 'transparent',
            border: '1px solid var(--border-default)',
            borderRadius: '4px',
            color: 'var(--text-secondary)',
            cursor: isPending ? 'wait' : 'pointer',
            fontFamily: 'var(--font-barlow)',
            padding: '0.45rem 1rem',
          }}
          type="button"
        >
          {pendingAction === 'skip' ? 'Skipping…' : 'Skip for now'}
        </button>
      </div>
    </section>
  );
}
