'use client';

import { useRef, useState, useTransition } from 'react';
import { uploadRankingsCsv } from '@/lib/rankings-actions';

export interface RankingSummaryView {
  fileName: string | null;
  uploadedAt: string;
  totalCount: number;
  matchedCount: number;
  unmatchedCount: number;
}

interface RankingsUploadFormProps {
  summary: RankingSummaryView | null;
}

export default function RankingsUploadForm({ summary }: RankingsUploadFormProps) {
  const [errors, setErrors] = useState<string[] | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrors(null);
    startTransition(async () => {
      try {
        const text = await file.text();
        const result = await uploadRankingsCsv(file.name, text);
        if (!result.ok) {
          setErrors(result.errors);
        }
      } catch {
        setErrors(['Upload failed — please try again.']);
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    });
  }

  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        borderRadius: '6px',
        padding: '1.25rem',
        marginBottom: '1.5rem',
      }}
    >
      {summary ? (
        <div data-testid="rankings-summary">
          <p style={{ margin: 0, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
            {summary.totalCount} players · uploaded{' '}
            {new Date(summary.uploadedAt).toLocaleDateString()}
            {summary.fileName ? ` from ${summary.fileName}` : ''}
          </p>
          <p
            style={{
              margin: '0.25rem 0 0',
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-secondary)',
              fontSize: '0.8rem',
            }}
          >
            {summary.matchedCount} matched to Sleeper · {summary.unmatchedCount} unmatched
          </p>
        </div>
      ) : (
        <p
          style={{
            margin: '0 0 0.75rem',
            color: 'var(--text-secondary)',
            fontFamily: 'var(--font-barlow)',
            fontSize: '0.875rem',
          }}
        >
          Upload an ETR dynasty rankings export (CSV) to use your own player pool at draft creation.
          Required columns: Player, Team, Position, Age, 2QBAuction.
        </p>
      )}

      <label
        data-testid="rankings-upload-button"
        style={{
          display: 'inline-block',
          marginTop: '0.75rem',
          background: isPending ? 'var(--text-secondary)' : 'var(--pos-te)',
          color: '#fff',
          borderRadius: '4px',
          padding: '0.4rem 1rem',
          fontFamily: 'var(--font-barlow)',
          fontSize: '0.875rem',
          cursor: isPending ? 'not-allowed' : 'pointer',
        }}
      >
        {isPending ? 'Uploading…' : summary ? 'Re-upload CSV' : 'Upload CSV'}
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleFileSelected}
          disabled={isPending}
          style={{ display: 'none' }}
        />
      </label>

      {errors && (
        <ul
          data-testid="rankings-upload-errors"
          style={{
            color: '#e05050',
            fontFamily: 'var(--font-barlow)',
            fontSize: '0.8rem',
            marginTop: '0.5rem',
          }}
        >
          {errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
