'use client';

import { useState, useMemo, useCallback } from 'react';
import type { TeamWithRoster, Position } from '@/types';
import { POS_COLORS } from '@/lib/posColors';
import { LEAGUE_TEAMS, ROSTER_SIZE } from '@/lib/teams';

type SortKey = 'buyingPower' | 'spent' | 'remaining' | 'rosterCount';

function buyingPowerColor(bp: number): string {
  if (bp < 50) return '#e05050';
  if (bp < 150) return '#e8a030';
  return '#e8eaf0';
}

function SortIcon({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  if (!active) return <span style={{ color: '#444', marginLeft: 3 }}>↕</span>;
  return <span style={{ color: '#e8a030', marginLeft: 3 }}>{dir === 'asc' ? '↑' : '↓'}</span>;
}

interface Props {
  teams: TeamWithRoster[];
}

export default function RosterTracker({ teams }: Props) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [sortBy, setSortBy] = useState<SortKey>('buyingPower');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const toggle = useCallback((id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSort = (col: SortKey) => {
    if (sortBy === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(col);
      setSortDir('desc');
    }
  };

  const sorted = useMemo(
    () =>
      [...teams].sort((a, b) => {
        const aV = a[sortBy];
        const bV = b[sortBy];
        return sortDir === 'desc' ? bV - aV : aV - bV;
      }),
    [teams, sortBy, sortDir],
  );

  const tableRows = useMemo(
    () =>
      sorted.flatMap((team, i) => {
        const isExpanded = expanded.has(team.id);
        const isMe = team.handle === 'coreschke';
        const rowBg = isMe ? '#0a1020' : i % 2 === 0 ? 'transparent' : '#0a0c10';

        const rows = [
          <tr
            key={team.id}
            onClick={() => toggle(team.id)}
            style={{
              borderBottom: isExpanded ? 'none' : '1px solid #141824',
              background: rowBg,
              cursor: 'pointer',
              borderLeft: isMe ? '3px solid #4f83e8' : '3px solid transparent',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#141824')}
            onMouseLeave={(e) => (e.currentTarget.style.background = rowBg)}
          >
            <td style={{ padding: '10px 10px', textAlign: 'left' }}>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: isMe ? 700 : 400,
                  color: isMe ? '#4f83e8' : '#e8eaf0',
                }}
              >
                {team.handle}
              </span>
              {team.displayName && (
                <span style={{ fontSize: 11, color: '#4a5168', marginLeft: 6 }}>
                  {team.displayName}
                </span>
              )}
            </td>
            <td
              style={{
                padding: '10px 10px',
                textAlign: 'center',
                fontSize: 12,
                fontFamily: 'var(--font-mono), monospace',
                color: '#8892a4',
              }}
            >
              {team.rosterCount} / {ROSTER_SIZE}
            </td>
            <td style={{ padding: '10px 10px', textAlign: 'center' }}>
              {team.pkgCount > 0 && (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: '#f0c040',
                    fontFamily: 'var(--font-mono), monospace',
                    background: '#2a2010',
                    borderRadius: 4,
                    padding: '2px 6px',
                  }}
                >
                  {team.pkgCount}×
                </span>
              )}
            </td>
            <td
              style={{
                padding: '10px 10px',
                textAlign: 'center',
                fontSize: 13,
                fontFamily: 'var(--font-mono), monospace',
                color: '#8892a4',
              }}
            >
              ${team.spent}
            </td>
            <td
              style={{
                padding: '10px 10px',
                textAlign: 'center',
                fontSize: 13,
                fontFamily: 'var(--font-mono), monospace',
                color: '#e8eaf0',
              }}
            >
              ${team.remaining}
            </td>
            <td
              style={{
                padding: '10px 10px',
                textAlign: 'center',
                fontSize: 13,
                fontWeight: 700,
                fontFamily: 'var(--font-mono), monospace',
                color: buyingPowerColor(team.buyingPower),
              }}
            >
              ${team.buyingPower}
            </td>
            <td style={{ padding: '10px 10px', textAlign: 'right' }}>
              <span
                style={{
                  display: 'inline-block',
                  transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                  transition: 'transform 0.15s ease',
                  color: '#4a5168',
                  fontSize: 12,
                  lineHeight: 1,
                }}
              >
                ▶
              </span>
            </td>
          </tr>,
        ];

        if (isExpanded) {
          rows.push(
            <tr key={`${team.id}-roster`}>
              <td colSpan={7} style={{ padding: 0, borderBottom: '2px solid #2a3048' }}>
                <div style={{ background: '#080a10', padding: '10px 16px 14px' }}>
                  {team.results.length === 0 ? (
                    <div style={{ fontSize: 12, color: '#4a5168', fontStyle: 'italic' }}>
                      No players won yet.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {team.results.map((result) => {
                        const pos = result.position as Position;
                        const c = POS_COLORS[pos] ?? POS_COLORS.PICK;
                        const { delta } = result;
                        return (
                          <div
                            key={result.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 10,
                              padding: '5px 8px',
                              borderLeft: `3px solid ${c.accent}`,
                              background: '#0a0d14',
                              borderRadius: '0 4px 4px 0',
                            }}
                          >
                            <span
                              style={{
                                display: 'inline-block',
                                background: c.badge,
                                color: c.badgeText,
                                borderRadius: 4,
                                fontSize: 9,
                                fontWeight: 700,
                                padding: '2px 6px',
                                letterSpacing: 0.5,
                                fontFamily: 'var(--font-barlow), sans-serif',
                                minWidth: 32,
                                textAlign: 'center',
                              }}
                            >
                              {result.position}
                            </span>
                            <span
                              style={{
                                fontSize: 13,
                                fontWeight: 600,
                                color: '#e8eaf0',
                                flex: 1,
                              }}
                            >
                              {result.player}
                            </span>
                            <span style={{ fontSize: 11, color: '#4a5168', minWidth: 30 }}>
                              {result.nflTeam}
                            </span>
                            <span
                              style={{
                                fontSize: 13,
                                fontWeight: 700,
                                color: c.accent,
                                fontFamily: 'var(--font-mono), monospace',
                                minWidth: 44,
                                textAlign: 'right',
                              }}
                            >
                              ${result.price}
                            </span>
                            {delta !== null && delta !== 0 && (
                              <span
                                style={{
                                  fontSize: 11,
                                  fontFamily: 'var(--font-mono), monospace',
                                  color: delta > 0 ? '#e05050' : '#4caf6e',
                                  minWidth: 44,
                                  textAlign: 'right',
                                }}
                              >
                                {delta > 0 ? `+$${delta}` : `-$${Math.abs(delta)}`}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </td>
            </tr>,
          );
        }

        return rows;
      }),
    [sorted, expanded, toggle],
  );

  return (
    <div
      style={{
        fontFamily: 'var(--font-inter), "Inter", "Helvetica Neue", sans-serif',
        background: 'var(--bg-base, #0a0d14)',
        minHeight: '100vh',
        color: '#e8eaf0',
      }}
    >
      {/* Header */}
      <div
        style={{
          background: 'var(--bg-surface, #141824)',
          borderBottom: '1px solid #2a3048',
          padding: '18px 20px 14px',
        }}
      >
        <div
          style={{
            fontSize: 10,
            letterSpacing: 3,
            color: '#4a5168',
            textTransform: 'uppercase',
            marginBottom: 3,
            fontFamily: 'var(--font-barlow), sans-serif',
          }}
        >
          {LEAGUE_TEAMS.length}-Team · Superflex · TE Premium · $1,000 Budget · {ROSTER_SIZE}-Man
          Rosters
        </div>
        <h1
          style={{
            margin: '0 0 2px',
            fontSize: 20,
            fontWeight: 700,
            color: '#fff',
            letterSpacing: -0.5,
            fontFamily: 'var(--font-barlow), sans-serif',
          }}
        >
          Team Rosters
        </h1>
        <div
          style={{ fontSize: 11, color: '#4a5168', fontFamily: 'var(--font-barlow), sans-serif' }}
        >
          Click any row to expand · Multiple rows can be open simultaneously
        </div>
      </div>

      {/* Table */}
      <div style={{ padding: '0 20px 40px', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 6 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #2a3048' }}>
              <th
                style={{
                  padding: '9px 10px',
                  textAlign: 'left',
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: 1,
                  color: '#4a5168',
                  textTransform: 'uppercase',
                  fontFamily: 'var(--font-barlow), sans-serif',
                  userSelect: 'none',
                }}
              >
                Team
              </th>
              <th
                onClick={() => handleSort('rosterCount')}
                style={{
                  padding: '9px 10px',
                  textAlign: 'center',
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: 1,
                  color: sortBy === 'rosterCount' ? '#e8a030' : '#4a5168',
                  textTransform: 'uppercase',
                  fontFamily: 'var(--font-barlow), sans-serif',
                  cursor: 'pointer',
                  userSelect: 'none',
                }}
              >
                Roster <SortIcon active={sortBy === 'rosterCount'} dir={sortDir} />
              </th>
              <th
                style={{
                  padding: '9px 10px',
                  textAlign: 'center',
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: 1,
                  color: '#4a5168',
                  textTransform: 'uppercase',
                  fontFamily: 'var(--font-barlow), sans-serif',
                  userSelect: 'none',
                }}
              >
                PKG
              </th>
              {(
                [
                  { key: 'spent' as SortKey, label: 'Spent' },
                  { key: 'remaining' as SortKey, label: 'Remaining' },
                  { key: 'buyingPower' as SortKey, label: 'Buying Power' },
                ] as Array<{ key: SortKey; label: string }>
              ).map((col) => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  style={{
                    padding: '9px 10px',
                    textAlign: 'center',
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: 1,
                    color: sortBy === col.key ? '#e8a030' : '#4a5168',
                    textTransform: 'uppercase',
                    cursor: 'pointer',
                    userSelect: 'none',
                    whiteSpace: 'nowrap',
                    fontFamily: 'var(--font-barlow), sans-serif',
                  }}
                >
                  {col.label}
                  <SortIcon active={sortBy === col.key} dir={sortDir} />
                </th>
              ))}
              <th style={{ width: 32 }} />
            </tr>
          </thead>
          <tbody>{tableRows}</tbody>
        </table>
      </div>
    </div>
  );
}
