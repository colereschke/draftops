'use client';

import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';

interface DraftInfo {
  id: number;
  name: string;
}

export default function NavLinks() {
  const pathname = usePathname();
  const params = useParams();
  const draftIdParam = params?.draftId;
  const draftId = typeof draftIdParam === 'string' ? parseInt(draftIdParam, 10) : null;
  const hasDraftId = draftId !== null && !isNaN(draftId);

  const [activeDrafts, setActiveDrafts] = useState<DraftInfo[]>([]);
  const [currentDraftName, setCurrentDraftName] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hasDraftId) return;
    void (async () => {
      const r = await fetch('/api/drafts');
      if (!r.ok) return;
      const drafts: DraftInfo[] = await r.json();
      setActiveDrafts(drafts);
      const current = drafts.find((d) => d.id === draftId);
      if (current) {
        setCurrentDraftName(current.name);
      } else {
        // Current draft not in active list (e.g. COMPLETE) — fetch its name directly.
        const r2 = await fetch(`/api/draft/${draftId}/info`);
        if (!r2.ok) return;
        const info: { name: string } = await r2.json();
        setCurrentDraftName(info.name);
      }
    })();
  }, [draftId, hasDraftId]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const LINKS = hasDraftId
    ? [
        { href: `/draft/${draftId}`, label: 'Value Sheet' },
        { href: `/draft/${draftId}/teams`, label: 'Team Rosters' },
        { href: `/draft/${draftId}/budget`, label: 'Budget Pressure' },
        { href: `/draft/${draftId}/nominate`, label: 'Nominate' },
      ]
    : [];

  const otherDrafts = activeDrafts.filter((d) => d.id !== draftId);

  return (
    <nav style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>
      {LINKS.map(({ href, label }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            className="nav-link"
            style={{
              padding: '0 4px',
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: 1,
              textTransform: 'uppercase',
              fontFamily: 'var(--font-barlow), sans-serif',
              textDecoration: 'none',
              color: active ? '#e8eaf0' : '#4a5168',
            }}
          >
            {label}
          </Link>
        );
      })}

      {hasDraftId && currentDraftName && (
        <div ref={dropdownRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setDropdownOpen((o) => !o)}
            style={{
              background: '#1e2433',
              border: '1px solid #2a2f3e',
              borderRadius: '4px',
              color: '#e8eaf0',
              fontFamily: 'var(--font-barlow), sans-serif',
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: 1,
              textTransform: 'uppercase',
              padding: '2px 8px',
              cursor: 'pointer',
            }}
          >
            <span>{currentDraftName}</span> ▾
          </button>

          {dropdownOpen && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: 4,
                background: '#1e2433',
                border: '1px solid #2a2f3e',
                borderRadius: '4px',
                minWidth: 160,
                zIndex: 100,
              }}
            >
              {otherDrafts.map((d) => (
                <Link
                  key={d.id}
                  href={`/draft/${d.id}`}
                  onClick={() => setDropdownOpen(false)}
                  style={{
                    display: 'block',
                    padding: '6px 12px',
                    color: '#e8eaf0',
                    fontFamily: 'var(--font-barlow), sans-serif',
                    fontSize: 12,
                    textDecoration: 'none',
                  }}
                >
                  {d.name}
                </Link>
              ))}
              <Link
                href="/drafts"
                onClick={() => setDropdownOpen(false)}
                style={{
                  display: 'block',
                  padding: '6px 12px',
                  color: '#4a5168',
                  fontFamily: 'var(--font-barlow), sans-serif',
                  fontSize: 12,
                  textDecoration: 'none',
                  borderTop: '1px solid #2a2f3e',
                }}
              >
                All Drafts
              </Link>
            </div>
          )}
        </div>
      )}
    </nav>
  );
}
