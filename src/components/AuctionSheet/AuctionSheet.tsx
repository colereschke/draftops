'use client';

import { useState, useMemo, useOptimistic, useTransition } from 'react';
import type { Player, Position, ClaimedBid, LeagueTeam } from '@/types';
import { POS_COLORS } from '@/lib/posColors';
import { logBid, updateBid, deleteBid } from '@/lib/actions';
import BidModal from '@/components/BidModal';

type OptimisticAction =
  | { type: 'add'; bid: ClaimedBid }
  | { type: 'update'; bid: ClaimedBid }
  | { type: 'delete'; id: number };

interface AuctionSheetProps {
  players: Player[];
  claimedBids: ClaimedBid[];
  teams: LeagueTeam[];
  nominatedPlayers: string[];
  draftId: number;
  ownerHandle: string | null;
  ownerBudget: number;
}

const POSITIONS: Array<'ALL' | Position> = ['ALL', 'QB', 'RB', 'WR', 'TE', 'PICK', 'PKG'];

type SortKey = keyof Player;

function ageColor(age: number | null): string {
  if (age === null) return '#444';
  if (age <= 24) return '#4caf6e';
  if (age <= 27) return '#e8eaf0';
  if (age <= 30) return '#e8a030';
  return '#e05050';
}

export default function AuctionSheet({
  players,
  claimedBids,
  teams,
  nominatedPlayers,
  draftId,
  ownerHandle,
  ownerBudget,
}: AuctionSheetProps) {
  const [posFilter, setPosFilter] = useState<'ALL' | Position>('ALL');
  const [search, setSearch] = useState<string>('');
  const [sortBy, setSortBy] = useState<SortKey>('sfRank');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [showNotes, setShowNotes] = useState<boolean>(false);
  const [modalPlayer, setModalPlayer] = useState<Player | null>(null);
  const [modalError, setModalError] = useState<string>('');
  const [, startTransition] = useTransition();
  const [extraNominated, setExtraNominated] = useState<string[]>([]);

  const [optimisticBids, dispatchOptimistic] = useOptimistic<ClaimedBid[], OptimisticAction>(
    claimedBids,
    (state, action) => {
      if (action.type === 'add') return [...state, action.bid];
      if (action.type === 'update')
        return state.map((b) => (b.id === action.bid.id ? action.bid : b));
      if (action.type === 'delete') return state.filter((b) => b.id !== action.id);
      return state;
    },
  );

  const claimMap = useMemo(
    () => new Map(optimisticBids.map((b) => [b.player, b])),
    [optimisticBids],
  );

  const nominatedSet = useMemo(
    () => new Set([...nominatedPlayers, ...extraNominated]),
    [nominatedPlayers, extraNominated],
  );

  const mySpent = useMemo(() => {
    const myTeam = ownerHandle ? teams.find((t) => t.handle === ownerHandle) : null;
    if (!myTeam) return 0;
    return optimisticBids.filter((b) => b.teamId === myTeam.id).reduce((s, b) => s + b.price, 0);
  }, [teams, optimisticBids, ownerHandle]);

  const hasClaims = optimisticBids.length > 0;

  function handleModalSubmit({ price, teamId }: { price: number; teamId: number }) {
    if (!modalPlayer) return;
    const existingBid = claimMap.get(modalPlayer.player);
    const team = teams.find((t) => t.id === teamId);
    if (!team) return;
    setModalError('');

    if (existingBid) {
      const updated: ClaimedBid = { ...existingBid, price, teamId, teamHandle: team.handle };
      startTransition(async () => {
        dispatchOptimistic({ type: 'update', bid: updated });
        try {
          await updateBid({ id: existingBid.id, price, teamId, draftId });
          setModalPlayer(null);
        } catch (e) {
          if (e instanceof Error && e.message === 'Unauthorized') {
            window.location.href = '/sign-in';
          } else if (
            e instanceof Error &&
            (e.message === 'No draft found' || e.message === 'Team not found in draft')
          ) {
            setModalError('Draft not configured. Please check your setup.');
          } else {
            setModalError('Failed to save bid. Please try again.');
          }
        }
      });
    } else {
      const tempBid: ClaimedBid = {
        id: -Date.now(),
        player: modalPlayer.player,
        position: modalPlayer.pos,
        price,
        teamId,
        teamHandle: team.handle,
      };
      startTransition(async () => {
        dispatchOptimistic({ type: 'add', bid: tempBid });
        try {
          await logBid({
            player: modalPlayer.player,
            position: modalPlayer.pos,
            nflTeam: modalPlayer.team,
            price,
            sfRank: modalPlayer.sfRank,
            teamId,
            draftId,
          });
          setModalPlayer(null);
        } catch (e) {
          if (e instanceof Error && e.message === 'Unauthorized') {
            window.location.href = '/sign-in';
          } else if (
            e instanceof Error &&
            (e.message === 'No draft found' || e.message === 'Team not found in draft')
          ) {
            setModalError('Draft not configured. Please check your setup.');
          } else {
            setModalError('Failed to log bid. Please try again.');
          }
        }
      });
    }
  }

  function handleModalDelete() {
    if (!modalPlayer) return;
    const existingBid = claimMap.get(modalPlayer.player);
    if (!existingBid) return;
    setModalError('');
    startTransition(async () => {
      dispatchOptimistic({ type: 'delete', id: existingBid.id });
      try {
        await deleteBid({ id: existingBid.id, draftId });
        setModalPlayer(null);
      } catch (e) {
        if (e instanceof Error && e.message === 'Unauthorized') {
          window.location.href = '/sign-in';
        } else if (
          e instanceof Error &&
          (e.message === 'No draft found' || e.message === 'Team not found in draft')
        ) {
          setModalError('Draft not configured. Please check your setup.');
        } else {
          setModalError('Failed to remove bid. Please try again.');
        }
      }
    });
  }

  function handleNominate(playerName: string) {
    setExtraNominated((prev) => [...prev, playerName]);
    void fetch(`/api/draft/${draftId}/nominated`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerName }),
    }).then((res) => {
      if (res.status === 401) {
        window.location.href = '/sign-in';
        return;
      }
      if (!res.ok) {
        setExtraNominated((prev) => prev.filter((n) => n !== playerName));
      }
    });
  }

  const remaining = ownerBudget - mySpent;

  const filtered = useMemo<Player[]>(() => {
    let data = [...players];
    if (posFilter !== 'ALL') data = data.filter((p) => p.pos === posFilter);
    if (search) {
      const q = search.toLowerCase();
      data = data.filter(
        (p) => p.player.toLowerCase().includes(q) || p.team.toLowerCase().includes(q),
      );
    }
    data.sort((a, b) => {
      let aV: string | number | null = a[sortBy] as string | number | null;
      let bV: string | number | null = b[sortBy] as string | number | null;
      if (aV === null || aV === undefined) aV = 9999;
      if (bV === null || bV === undefined) bV = 9999;
      if (typeof aV === 'string') aV = aV.toLowerCase();
      if (typeof bV === 'string') bV = bV.toLowerCase();
      if (aV < bV) return sortDir === 'asc' ? -1 : 1;
      if (aV > bV) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return data;
  }, [posFilter, search, sortBy, sortDir]);

  const handleSort = (col: SortKey) => {
    if (sortBy === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(col);
      setSortDir(col === 'sfRank' || col === 'player' ? 'asc' : 'desc');
    }
  };

  const SortIcon = ({ col }: { col: SortKey }) =>
    sortBy !== col ? (
      <span style={{ color: '#444', marginLeft: 3 }}>↕</span>
    ) : (
      <span style={{ color: '#e8a030', marginLeft: 3 }}>{sortDir === 'asc' ? '↑' : '↓'}</span>
    );

  const posStats = useMemo(() => {
    const stats: Record<string, { count: number; total: number }> = {};
    (['QB', 'RB', 'WR', 'TE'] as Position[]).forEach((pos) => {
      const pp = players.filter((p) => p.pos === pos);
      stats[pos] = { count: pp.length, total: pp.reduce((s, p) => s + p.budget, 0) };
    });
    return stats;
  }, []);

  const grandTotal = Object.values(posStats).reduce((s, v) => s + v.total, 0);

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
          12-Team · Superflex · TE Premium · $1,000 Budget · 30-Man Rosters
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
          Startup Auction Value Sheet
        </h1>
        <div style={{ fontSize: 11, color: '#4a5168' }}>
          2QB rankings scaled 5× · TE PPR+1 / 1st Down+0.25 applied ·{' '}
          {players.filter((p) => !(['PKG', 'PICK'] as Position[]).includes(p.pos)).length} players +
          pick assets
        </div>

        {/* Budget tracker */}
        <div
          style={{
            display: 'flex',
            gap: 10,
            marginTop: 14,
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <div
            style={{
              background: '#1a1f2e',
              borderRadius: 8,
              padding: '8px 14px',
              display: 'flex',
              gap: 16,
              alignItems: 'center',
            }}
          >
            <div style={{ textAlign: 'center' }}>
              <div
                style={{
                  fontSize: 10,
                  color: '#4a5168',
                  letterSpacing: 1,
                  textTransform: 'uppercase',
                  fontFamily: 'var(--font-barlow), sans-serif',
                }}
              >
                Budget
              </div>
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  color: '#4f83e8',
                  fontFamily: 'var(--font-mono), monospace',
                }}
              >
                ${ownerBudget}
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div
                style={{
                  fontSize: 10,
                  color: '#4a5168',
                  letterSpacing: 1,
                  textTransform: 'uppercase',
                  fontFamily: 'var(--font-barlow), sans-serif',
                }}
              >
                Spent
              </div>
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  color: '#e8a030',
                  fontFamily: 'var(--font-mono), monospace',
                }}
              >
                ${mySpent}
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div
                style={{
                  fontSize: 10,
                  color: '#4a5168',
                  letterSpacing: 1,
                  textTransform: 'uppercase',
                  fontFamily: 'var(--font-barlow), sans-serif',
                }}
              >
                Remaining
              </div>
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  color: remaining < 100 ? '#e05050' : '#4caf6e',
                  fontFamily: 'var(--font-mono), monospace',
                }}
              >
                ${remaining}
              </div>
            </div>
          </div>
          <div style={{ fontSize: 11, color: '#4a5168', maxWidth: 200 }}>
            ↑ Track your spend to know who can still hurt you in the room
          </div>
        </div>

        {/* Budget bar by position */}
        <div
          style={{
            marginTop: 12,
            background: '#1a1f2e',
            borderRadius: 8,
            padding: '8px 12px',
          }}
        >
          <div
            style={{
              fontSize: 10,
              color: '#4a5168',
              marginBottom: 5,
              letterSpacing: 1,
              textTransform: 'uppercase',
              fontFamily: 'var(--font-barlow), sans-serif',
            }}
          >
            Market weight by position
          </div>
          <div
            style={{
              display: 'flex',
              height: 6,
              borderRadius: 3,
              overflow: 'hidden',
              gap: 1,
            }}
          >
            {(['QB', 'RB', 'WR', 'TE'] as Position[]).map((pos) => {
              const pct = ((posStats[pos].total / grandTotal) * 100).toFixed(1);
              return (
                <div
                  key={pos}
                  style={{
                    width: `${pct}%`,
                    background: POS_COLORS[pos].accent,
                    opacity: 0.8,
                  }}
                />
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 14, marginTop: 5 }}>
            {(['QB', 'RB', 'WR', 'TE'] as Position[]).map((pos) => {
              const pct = ((posStats[pos].total / grandTotal) * 100).toFixed(0);
              return (
                <div
                  key={pos}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10 }}
                >
                  <div
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: 2,
                      background: POS_COLORS[pos].accent,
                    }}
                  />
                  <span style={{ color: '#8892a4' }}>{pos}</span>
                  <span style={{ color: '#4a5168', fontFamily: 'var(--font-mono), monospace' }}>
                    {pct}% · ${posStats[pos].total}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Controls */}
      <div
        style={{
          padding: '12px 20px',
          background: '#0d1018',
          borderBottom: '1px solid #1e2434',
          display: 'flex',
          gap: 10,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
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
                  borderColor: active ? (c?.accent ?? POS_COLORS.PICK.accent) : '#2a3048',
                  background: active ? (c?.bg ?? POS_COLORS.PICK.bg) : 'transparent',
                  color: active ? (c?.accent ?? POS_COLORS.PICK.accent) : '#4a5168',
                }}
              >
                {pos}
              </button>
            );
          })}
        </div>
        <input
          value={search}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
          placeholder="Search player or team..."
          style={{
            background: '#1a1f2e',
            border: '1px solid #2a3048',
            borderRadius: 5,
            padding: '4px 10px',
            color: '#e8eaf0',
            fontSize: 12,
            outline: 'none',
            width: 180,
          }}
        />
        <button
          onClick={() => setShowNotes((n) => !n)}
          style={{
            padding: '4px 10px',
            borderRadius: 5,
            border: '1px solid #2a3048',
            background: showNotes ? '#2a3048' : 'transparent',
            color: showNotes ? '#e8eaf0' : '#4a5168',
            fontSize: 11,
            cursor: 'pointer',
          }}
        >
          {showNotes ? 'Hide Notes' : 'Show Notes'}
        </button>
        <div style={{ marginLeft: 'auto', fontSize: 11, color: '#4a5168' }}>
          {filtered.length} players shown
        </div>
      </div>

      {/* Legend */}
      <div
        style={{
          padding: '6px 20px',
          background: '#080a10',
          borderBottom: '1px solid #1a1f2e',
          display: 'flex',
          gap: 18,
          fontSize: 10,
          color: '#4a5168',
          flexWrap: 'wrap',
        }}
      >
        <span>
          🔻 <b style={{ color: '#8892a4' }}>Floor</b> = steal territory
        </span>
        <span>
          💰 <b style={{ color: '#8892a4' }}>Target</b> = calibrated bid
        </span>
        <span>
          🔺 <b style={{ color: '#8892a4' }}>Ceiling</b> = hard stop
        </span>
        <span style={{ borderLeft: '1px solid #1e2434', paddingLeft: 18 }}>
          Age: <span style={{ color: '#4caf6e' }}>≤24</span>{' '}
          <span style={{ color: '#e8eaf0' }}>25–27</span>{' '}
          <span style={{ color: '#e8a030' }}>28–30</span>{' '}
          <span style={{ color: '#e05050' }}>31+</span>
        </span>
        <span>
          <b style={{ color: '#e8a030', fontSize: 9 }}>R</b> = Rookie ·{' '}
          <b style={{ color: '#f0c040', fontSize: 9 }}>PKG</b> = 2027 1st+2nd+3rd via kicker bid
        </span>
      </div>

      {/* Table */}
      <div style={{ padding: '0 20px 40px', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 6 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #2a3048' }}>
              {(
                [
                  { key: 'sfRank' as SortKey, label: 'SF Rank' },
                  { key: 'player' as SortKey, label: 'Player' },
                  { key: 'pos' as SortKey, label: 'Pos' },
                  { key: 'team' as SortKey, label: 'Team' },
                  { key: 'age' as SortKey, label: 'Age' },
                  { key: 'floor' as SortKey, label: '🔻 Floor' },
                  { key: 'budget' as SortKey, label: '💰 Target' },
                  { key: 'ceiling' as SortKey, label: '🔺 Ceiling' },
                ] as Array<{ key: SortKey; label: string }>
              ).map((col) => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  style={{
                    padding: '9px 10px',
                    textAlign: col.key === 'player' ? 'left' : 'center',
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
                  <SortIcon col={col.key} />
                </th>
              ))}
              {showNotes && (
                <th
                  style={{
                    padding: '9px 10px',
                    textAlign: 'left',
                    fontSize: 10,
                    fontWeight: 600,
                    color: '#4a5168',
                    textTransform: 'uppercase',
                    letterSpacing: 1,
                    fontFamily: 'var(--font-barlow), sans-serif',
                  }}
                >
                  Notes
                </th>
              )}
              {hasClaims && (
                <th
                  style={{
                    padding: '9px 10px',
                    textAlign: 'left',
                    fontSize: 10,
                    fontWeight: 600,
                    color: '#4a5168',
                    textTransform: 'uppercase',
                    letterSpacing: 1,
                    fontFamily: 'var(--font-barlow), sans-serif',
                  }}
                >
                  Claimed
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {filtered.map((p, i) => {
              const c = POS_COLORS[p.pos];
              const isRookie = p.notes.toLowerCase().includes('rookie');
              const isPkg = p.pos === 'PKG';
              const isNominated = nominatedSet.has(p.player);
              const rowBg = isNominated ? '#0d1f1f' : i % 2 === 0 ? 'transparent' : '#0a0c10';
              return (
                <tr
                  key={p.player + i}
                  onClick={() => setModalPlayer(p)}
                  style={{
                    borderBottom: '1px solid #141824',
                    background: rowBg,
                    borderLeft: `3px solid ${isNominated ? '#40b0b0' : c.accent}`,
                    cursor: 'pointer',
                    opacity: claimMap.has(p.player) ? 0.5 : 1,
                  }}
                  onMouseEnter={(e: React.MouseEvent<HTMLTableRowElement>) =>
                    (e.currentTarget.style.background = '#141824')
                  }
                  onMouseLeave={(e: React.MouseEvent<HTMLTableRowElement>) =>
                    (e.currentTarget.style.background = rowBg)
                  }
                >
                  <td
                    style={{
                      padding: '8px 10px',
                      textAlign: 'center',
                      fontSize: 11,
                      color: '#4a5168',
                      fontVariantNumeric: 'tabular-nums',
                      fontFamily: 'var(--font-mono), monospace',
                    }}
                  >
                    {p.sfRank}
                  </td>
                  <td style={{ padding: '8px 10px', textAlign: 'left' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: isPkg ? 700 : 600,
                          color: isPkg ? '#f0c040' : '#e8eaf0',
                        }}
                      >
                        {p.player}
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
                      {isPkg && (
                        <span
                          style={{
                            fontSize: 8,
                            fontWeight: 700,
                            letterSpacing: 1,
                            background: '#3a2a00',
                            color: '#f0c040',
                            borderRadius: 3,
                            padding: '1px 4px',
                            textTransform: 'uppercase',
                          }}
                        >
                          PKG
                        </span>
                      )}
                      {isNominated && (
                        <span
                          style={{
                            fontSize: 8,
                            fontWeight: 700,
                            letterSpacing: 1,
                            background: '#0d2a2a',
                            color: '#40b0b0',
                            borderRadius: 3,
                            padding: '1px 4px',
                            textTransform: 'uppercase',
                          }}
                        >
                          LIVE
                        </span>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: '8px 10px', textAlign: 'center' }}>
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
                      }}
                    >
                      {p.pos}
                    </span>
                  </td>
                  <td
                    style={{
                      padding: '8px 10px',
                      textAlign: 'center',
                      fontSize: 11,
                      color: '#8892a4',
                    }}
                  >
                    {p.team}
                  </td>
                  <td
                    style={{
                      padding: '8px 10px',
                      textAlign: 'center',
                      fontSize: 11,
                      fontVariantNumeric: 'tabular-nums',
                      color: ageColor(p.age),
                      fontFamily: 'var(--font-mono), monospace',
                    }}
                  >
                    {p.age !== null ? p.age.toFixed(1) : '—'}
                  </td>
                  <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                    <span
                      style={{
                        fontSize: 12,
                        color: '#8892a4',
                        fontVariantNumeric: 'tabular-nums',
                        fontFamily: 'var(--font-mono), monospace',
                      }}
                    >
                      ${p.floor}
                    </span>
                  </td>
                  <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                    <span
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: c.accent,
                        fontVariantNumeric: 'tabular-nums',
                        fontFamily: 'var(--font-mono), monospace',
                      }}
                    >
                      ${p.budget}
                    </span>
                  </td>
                  <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                    <span
                      style={{
                        fontSize: 12,
                        color: '#e05050',
                        fontVariantNumeric: 'tabular-nums',
                        fontFamily: 'var(--font-mono), monospace',
                      }}
                    >
                      ${p.ceiling}
                    </span>
                  </td>
                  {showNotes && (
                    <td
                      style={{
                        padding: '8px 10px',
                        fontSize: 10,
                        color: '#4a5168',
                        maxWidth: 220,
                      }}
                    >
                      {p.notes || '—'}
                    </td>
                  )}
                  {hasClaims &&
                    (() => {
                      const claim = claimMap.get(p.player);
                      if (!claim) return <td key="claimed" style={{ padding: '8px 10px' }} />;
                      const diff = claim.price - p.budget;
                      const over = diff > 0;
                      const under = diff < 0;
                      return (
                        <td
                          key="claimed"
                          style={{ padding: '8px 10px', textAlign: 'left', whiteSpace: 'nowrap' }}
                        >
                          <span style={{ fontSize: 11, color: '#8892a4' }}>{claim.teamHandle}</span>
                          <span
                            style={{
                              fontSize: 11,
                              fontFamily: 'var(--font-mono), monospace',
                              color: '#8892a4',
                              marginLeft: 4,
                            }}
                          >
                            ${claim.price}
                          </span>
                          <span
                            style={{
                              fontSize: 10,
                              fontFamily: 'var(--font-mono), monospace',
                              color: over ? '#e05050' : under ? '#4caf6e' : '#4a5168',
                              marginLeft: 4,
                            }}
                          >
                            {over ? `▲$${diff}` : under ? `▼$${Math.abs(diff)}` : '='}
                          </span>
                        </td>
                      );
                    })()}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div
        style={{
          padding: '10px 20px',
          borderTop: '1px solid #1a1f2e',
          fontSize: 10,
          color: '#2a3048',
          display: 'flex',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <span>
          Source: 2QB auction values (FantasyCalc CSV) scaled 5× to $1,000 budget · TE premium ~18%
          applied
        </span>
        <span style={{ marginLeft: 'auto' }}>
          PKG target for 2027 kicker = $109 (1st+2nd+3rd bundled w/ SF speculative premium)
        </span>
      </div>
      {modalPlayer && (
        <BidModal
          player={modalPlayer}
          teams={teams}
          existingBid={claimMap.get(modalPlayer.player)}
          onClose={() => setModalPlayer(null)}
          onSubmit={handleModalSubmit}
          onDelete={claimMap.has(modalPlayer.player) ? handleModalDelete : undefined}
          serverError={modalError}
          isNominated={nominatedSet.has(modalPlayer.player)}
          onNominate={() => handleNominate(modalPlayer.player)}
        />
      )}
    </div>
  );
}
