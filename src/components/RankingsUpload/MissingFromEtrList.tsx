'use client';

import { useMemo, useState } from 'react';
import { normalizeName } from '@/lib/sleeperNormalize';

interface MissingFromEtrListProps {
  names: string[];
}

export default function MissingFromEtrList({ names }: MissingFromEtrListProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return names;
    const q = normalizeName(search);
    return names.filter((name) => normalizeName(name).includes(q));
  }, [names, search]);

  if (names.length === 0) return null;

  return (
    <div
      data-testid="missing-from-etr-list"
      style={{
        background: 'var(--bg-surface)',
        borderRadius: '6px',
        padding: '1.25rem',
        marginTop: '1rem',
      }}
    >
      <button
        type="button"
        data-testid="missing-from-etr-toggle"
        onClick={() => setOpen((prev) => !prev)}
        style={{
          background: 'none',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          fontFamily: 'var(--font-barlow)',
          fontSize: '0.8rem',
          color: 'var(--text-secondary)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        {open ? '▾' : '▸'} Missing from ETR pool ({names.length})
      </button>
      {open && (
        <div style={{ marginTop: '0.75rem' }}>
          <input
            type="text"
            data-testid="missing-from-etr-search"
            placeholder="Filter…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%',
              background: 'var(--bg-base)',
              border: '1px solid #2a2f3e',
              borderRadius: '4px',
              padding: '0.4rem 0.6rem',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.8rem',
              marginBottom: '0.5rem',
            }}
          />
          <ul
            data-testid="missing-from-etr-items"
            style={{
              listStyle: 'none',
              margin: 0,
              padding: 0,
              maxHeight: '240px',
              overflowY: 'auto',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.8rem',
              color: 'var(--text-primary)',
            }}
          >
            {filtered.map((name, i) => (
              <li key={`${name}-${i}`} style={{ padding: '0.2rem 0' }}>
                {name}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
