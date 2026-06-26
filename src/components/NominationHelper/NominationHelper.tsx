'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import type { Position, TeamStats, AuctionResultEntry } from '@/types';
import { players } from '@/data/players';
import { computeNominationScores, type ScoredPlayer } from '@/lib/nominationScoring';
import { POS_COLORS } from '@/lib/posColors';

const MY_HANDLE = 'coreschke';

const POSITIONS: Array<'ALL' | Position> = ['ALL', 'QB', 'RB', 'WR', 'TE', 'PICK', 'PKG'];

interface NomData {
  teamStats: TeamStats[];
  auctionResults: AuctionResultEntry[];
  watchlist: string[];
  nominated: string[];
}

export default function NominationHelper() {
  const [data, setData] = useState<NomData | null>(null);
  const [posFilter, setPosFilter] = useState<'ALL' | Position>('ALL');
  const [watchlistSearch, setWatchlistSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch('/api/nomination-data');
        if (res.ok) setData(await res.json());
      } catch {
        // silent — show stale data
      }
    }
    void fetchData();
    const interval = setInterval(() => void fetchData(), 30_000);
    return () => clearInterval(interval);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        searchRef.current &&
        !searchRef.current.contains(e.target as Node) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const wonNames = useMemo(() => new Set(data?.auctionResults.map((r) => r.player) ?? []), [data]);

  const watchlistSet = useMemo(() => new Set(data?.watchlist ?? []), [data]);

  const nominatedSet = useMemo(() => new Set(data?.nominated ?? []), [data]);

  const scored = useMemo<ScoredPlayer[]>(() => {
    if (!data) return [];
    return computeNominationScores(
      players,
      data.teamStats,
      data.auctionResults,
      data.watchlist,
      data.nominated,
      MY_HANDLE,
    );
  }, [data]);

  const filtered = useMemo(
    () => (posFilter === 'ALL' ? scored : scored.filter((s) => s.player.pos === posFilter)),
    [scored, posFilter],
  );

  const searchResults = useMemo(() => {
    if (!watchlistSearch.trim()) return [];
    const q = watchlistSearch.toLowerCase();
    return players
      .filter(
        (p) =>
          !wonNames.has(p.player) && !watchlistSet.has(p.player) && !nominatedSet.has(p.player),
      )
      .filter((p) => p.player.toLowerCase().includes(q) || p.team.toLowerCase().includes(q))
      .slice(0, 8);
  }, [watchlistSearch, wonNames, watchlistSet, nominatedSet]);

  const addToWatchlist = async (playerName: string) => {
    setData((prev) => (prev ? { ...prev, watchlist: [...prev.watchlist, playerName] } : prev));
    setWatchlistSearch('');
    setShowDropdown(false);
    await fetch('/api/watchlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerName }),
    });
  };

  const removeFromWatchlist = async (playerName: string) => {
    setData((prev) =>
      prev ? { ...prev, watchlist: prev.watchlist.filter((n) => n !== playerName) } : prev,
    );
    await fetch('/api/watchlist', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerName }),
    });
  };

  const nominatePlayer = async (playerName: string) => {
    setData((prev) => (prev ? { ...prev, nominated: [...prev.nominated, playerName] } : prev));
    await fetch('/api/nominated', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerName }),
    });
  };

  const unNominatePlayer = async (playerName: string) => {
    setData((prev) =>
      prev ? { ...prev, nominated: prev.nominated.filter((n) => n !== playerName) } : prev,
    );
    await fetch('/api/nominated', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerName }),
    });
  };

  if (!data) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: 400,
          color: '#4a5168',
          fontFamily: 'var(--font-inter), sans-serif',
        }}
      >
        Loading nomination data...
      </div>
    );
  }

  const hasAuctionData = data.auctionResults.length > 0;

  return (
    <div
      style={{
        display: 'flex',
        minHeight: '100vh',
        fontFamily: 'var(--font-inter), sans-serif',
        background: 'var(--bg-base, #0a0d14)',
        color: '#e8eaf0',
      }}
    >
      {/* Zone 1: Watchlist sidebar */}
      <div
        style={{
          width: 240,
          minWidth: 240,
          background: 'var(--bg-surface, #141824)',
          borderRight: '1px solid #1e2434',
          padding: '16px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        {/* In Auction section */}
        <div>
          <div
            style={{
              fontSize: 10,
              letterSpacing: 2,
              color: '#40b0b0',
              textTransform: 'uppercase',
              fontFamily: 'var(--font-barlow), sans-serif',
              marginBottom: 6,
            }}
          >
            In Auction
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {data.nominated.length === 0 ? (
              <div style={{ fontSize: 11, color: '#2a3a3a', lineHeight: 1.5 }}>
                No players currently nominated
              </div>
            ) : (
              data.nominated.map((name) => {
                const p = players.find((pl) => pl.player === name);
                return (
                  <div
                    key={name}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '6px 8px',
                      background: '#0d2020',
                      borderRadius: 5,
                      borderLeft: '3px solid #40b0b0',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: '#e8eaf0',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {name}
                      </div>
                      {p && (
                        <div
                          style={{
                            fontSize: 10,
                            color: '#4a5168',
                            fontFamily: 'var(--font-mono), monospace',
                          }}
                        >
                          {p.pos} · ${p.budget}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => unNominatePlayer(name)}
                      title="Remove from in auction"
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#2a5a5a',
                        cursor: 'pointer',
                        fontSize: 16,
                        lineHeight: 1,
                        padding: '0 2px',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = '#40b0b0')}
                      onMouseLeave={(e) => (e.currentTarget.style.color = '#2a5a5a')}
                    >
                      ×
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div
          style={{
            borderTop: '1px solid #1e2434',
            marginTop: 4,
          }}
        />

        <div
          style={{
            fontSize: 10,
            letterSpacing: 2,
            color: '#4a5168',
            textTransform: 'uppercase',
            fontFamily: 'var(--font-barlow), sans-serif',
          }}
        >
          My Watchlist
        </div>

        {/* Search-to-add */}
        <div style={{ position: 'relative' }}>
          <input
            ref={searchRef}
            value={watchlistSearch}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              setWatchlistSearch(e.target.value);
              setShowDropdown(true);
            }}
            onFocus={() => setShowDropdown(true)}
            placeholder="Add player I want..."
            style={{
              width: '100%',
              background: '#1a1f2e',
              border: '1px solid #2a3048',
              borderRadius: 5,
              padding: '6px 10px',
              color: '#e8eaf0',
              fontSize: 12,
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
          {showDropdown && searchResults.length > 0 && (
            <div
              ref={dropdownRef}
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                background: '#1a1f2e',
                border: '1px solid #2a3048',
                borderRadius: 5,
                zIndex: 10,
                maxHeight: 220,
                overflowY: 'auto',
              }}
            >
              {searchResults.map((p) => (
                <button
                  key={p.player}
                  onClick={() => addToWatchlist(p.player)}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '7px 10px',
                    background: 'transparent',
                    border: 'none',
                    borderBottom: '1px solid #2a3048',
                    color: '#e8eaf0',
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#2a3048')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <span style={{ fontWeight: 600 }}>{p.player}</span>
                  <span
                    style={{
                      color: '#4a5168',
                      marginLeft: 6,
                      fontSize: 10,
                      fontFamily: 'var(--font-mono), monospace',
                    }}
                  >
                    {p.pos} · ${p.budget}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Watchlist entries */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, overflowY: 'auto' }}>
          {data.watchlist.length === 0 ? (
            <div style={{ fontSize: 11, color: '#4a5168', lineHeight: 1.5 }}>
              No players marked — add players you still want to win
            </div>
          ) : (
            data.watchlist.map((name) => {
              const p = players.find((pl) => pl.player === name);
              const accent = p ? POS_COLORS[p.pos].accent : '#4a5168';
              return (
                <div
                  key={name}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 8px',
                    background: '#1a1f2e',
                    borderRadius: 5,
                    borderLeft: `3px solid ${accent}`,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: '#e8eaf0',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {name}
                    </div>
                    {p && (
                      <div
                        style={{
                          fontSize: 10,
                          color: '#4a5168',
                          fontFamily: 'var(--font-mono), monospace',
                        }}
                      >
                        {p.pos} · ${p.budget}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => removeFromWatchlist(name)}
                    title="Remove from watchlist"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#4a5168',
                      cursor: 'pointer',
                      fontSize: 16,
                      lineHeight: 1,
                      padding: '0 2px',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = '#e05050')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = '#4a5168')}
                  >
                    ×
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Zone 2: Nomination targets */}
      <div style={{ flex: 1, padding: '16px 20px 40px', overflowX: 'auto' }}>
        {/* Page header */}
        <div style={{ marginBottom: 14 }}>
          <div
            style={{
              fontSize: 10,
              letterSpacing: 3,
              color: '#4a5168',
              textTransform: 'uppercase',
              fontFamily: 'var(--font-barlow), sans-serif',
              marginBottom: 2,
            }}
          >
            Nomination Helper
          </div>
          <div style={{ fontSize: 12, color: '#4a5168' }}>
            Players ranked by how much nominating them will drain rival budgets
          </div>
        </div>

        {!hasAuctionData ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: 300,
              color: '#4a5168',
              fontSize: 13,
            }}
          >
            No auction data yet — start logging bids to see nomination suggestions.
          </div>
        ) : (
          <>
            {/* Position filter */}
            <div
              style={{
                display: 'flex',
                gap: 3,
                flexWrap: 'wrap',
                marginBottom: 14,
                alignItems: 'center',
              }}
            >
              {POSITIONS.map((pos) => {
                const c = pos === 'ALL' ? null : POS_COLORS[pos];
                const active = posFilter === pos;
                return (
                  <button
                    key={pos}
                    onClick={() => setPosFilter(pos)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 5,
                      border: '1px solid',
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: 'pointer',
                      letterSpacing: 0.5,
                      fontFamily: 'var(--font-barlow), sans-serif',
                      borderColor: active ? (c?.accent ?? '#40b0b0') : '#2a3048',
                      background: active ? (c ? '#1a1f2e' : '#1a2a2a') : 'transparent',
                      color: active ? (c?.accent ?? '#40b0b0') : '#4a5168',
                    }}
                  >
                    {pos}
                  </button>
                );
              })}
              <div
                style={{ marginLeft: 'auto', fontSize: 11, color: '#4a5168', alignSelf: 'center' }}
              >
                {filtered.length} targets
              </div>
            </div>

            {/* Table */}
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #2a3048' }}>
                  {(
                    [
                      { label: '#', align: 'center' },
                      { label: 'Player', align: 'left' },
                      { label: 'Target / Ceil', align: 'center' },
                      { label: 'Score', align: 'center' },
                      { label: 'Rival Demand', align: 'left' },
                      { label: '', align: 'center' },
                      { label: '', align: 'center' },
                    ] as const
                  ).map((col, i) => (
                    <th
                      key={i}
                      style={{
                        padding: '8px 10px',
                        textAlign: col.align,
                        fontSize: 10,
                        fontWeight: 600,
                        letterSpacing: 1,
                        color: '#4a5168',
                        textTransform: 'uppercase',
                        fontFamily: 'var(--font-barlow), sans-serif',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((s, i) => {
                  const { player, nominationScore, rivalContributions } = s;
                  const c = POS_COLORS[player.pos];
                  const isRookie = player.notes.toLowerCase().includes('rookie');
                  const topRivals = rivalContributions.slice(0, 4);
                  return (
                    <tr
                      key={player.player}
                      style={{
                        borderBottom: '1px solid #141824',
                        background: i % 2 === 0 ? 'transparent' : '#0a0c10',
                        borderLeft: `3px solid ${c.accent}`,
                      }}
                      onMouseEnter={(e: React.MouseEvent<HTMLTableRowElement>) =>
                        (e.currentTarget.style.background = '#141824')
                      }
                      onMouseLeave={(e: React.MouseEvent<HTMLTableRowElement>) =>
                        (e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : '#0a0c10')
                      }
                    >
                      {/* Rank */}
                      <td
                        style={{
                          padding: '8px 10px',
                          textAlign: 'center',
                          fontSize: 11,
                          color: '#4a5168',
                          fontFamily: 'var(--font-mono), monospace',
                        }}
                      >
                        {i + 1}
                      </td>

                      {/* Player */}
                      <td style={{ padding: '8px 10px', textAlign: 'left' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: '#e8eaf0' }}>
                            {player.player}
                          </span>
                          <span
                            style={{
                              display: 'inline-block',
                              background: c.badge,
                              color: c.badgeText,
                              borderRadius: 4,
                              fontSize: 9,
                              fontWeight: 700,
                              padding: '2px 5px',
                              letterSpacing: 0.5,
                              fontFamily: 'var(--font-barlow), sans-serif',
                            }}
                          >
                            {player.pos}
                          </span>
                          {isRookie && (
                            <span
                              style={{
                                fontSize: 8,
                                fontWeight: 700,
                                letterSpacing: 1,
                                background: '#3a2800',
                                color: '#e8a030',
                                borderRadius: 3,
                                padding: '1px 4px',
                                textTransform: 'uppercase',
                              }}
                            >
                              R
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Target / Ceiling */}
                      <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                        <span
                          style={{
                            fontSize: 13,
                            fontWeight: 700,
                            color: c.accent,
                            fontFamily: 'var(--font-mono), monospace',
                          }}
                        >
                          ${player.budget}
                        </span>
                        <span
                          style={{
                            fontSize: 10,
                            color: '#4a5168',
                            fontFamily: 'var(--font-mono), monospace',
                          }}
                        >
                          {' '}
                          / ${player.ceiling}
                        </span>
                      </td>

                      {/* Nomination score */}
                      <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                        <span
                          style={{
                            fontSize: 13,
                            fontWeight: 700,
                            color: '#e8a030',
                            fontFamily: 'var(--font-mono), monospace',
                          }}
                        >
                          {Math.round(nominationScore).toLocaleString()}
                        </span>
                      </td>

                      {/* Rival demand bar */}
                      <td style={{ padding: '8px 14px', minWidth: 200 }}>
                        {topRivals.length === 0 ? (
                          <span style={{ fontSize: 10, color: '#2a3048' }}>—</span>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                            {topRivals.map((r) => (
                              <div
                                key={r.handle}
                                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                              >
                                <div
                                  style={{
                                    width: 70,
                                    fontSize: 9,
                                    color: '#8892a4',
                                    textAlign: 'right',
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    fontFamily: 'var(--font-mono), monospace',
                                  }}
                                >
                                  {r.handle}
                                </div>
                                <div
                                  style={{
                                    flex: 1,
                                    height: 4,
                                    background: '#1a1f2e',
                                    borderRadius: 2,
                                    overflow: 'hidden',
                                  }}
                                >
                                  <div
                                    style={{
                                      width: `${r.pct}%`,
                                      height: '100%',
                                      background: '#4f83e8',
                                      borderRadius: 2,
                                    }}
                                  />
                                </div>
                                <div
                                  style={{
                                    fontSize: 9,
                                    color: '#4a5168',
                                    fontFamily: 'var(--font-mono), monospace',
                                    width: 28,
                                  }}
                                >
                                  {Math.round(r.pct)}%
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>

                      {/* Watch button */}
                      <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                        <button
                          onClick={() => addToWatchlist(player.player)}
                          style={{
                            padding: '3px 10px',
                            borderRadius: 4,
                            border: '1px solid #2a3048',
                            background: 'transparent',
                            color: '#4caf6e',
                            fontSize: 10,
                            cursor: 'pointer',
                            fontWeight: 600,
                            letterSpacing: 0.5,
                            fontFamily: 'var(--font-barlow), sans-serif',
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#4caf6e')}
                          onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#2a3048')}
                        >
                          Watch
                        </button>
                      </td>

                      {/* Nom button */}
                      <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                        <button
                          onClick={() => nominatePlayer(player.player)}
                          style={{
                            padding: '3px 10px',
                            borderRadius: 4,
                            border: '1px solid #2a3048',
                            background: 'transparent',
                            color: '#40b0b0',
                            fontSize: 10,
                            cursor: 'pointer',
                            fontWeight: 600,
                            letterSpacing: 0.5,
                            fontFamily: 'var(--font-barlow), sans-serif',
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#40b0b0')}
                          onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#2a3048')}
                        >
                          Nom
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      style={{ padding: 40, textAlign: 'center', color: '#4a5168', fontSize: 12 }}
                    >
                      No nomination targets found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}
