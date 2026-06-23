'use client';

import { useState, useEffect } from 'react';
import type { Player, ClaimedBid, LeagueTeam } from '@/types';

interface BidModalProps {
  player: Player;
  teams: LeagueTeam[];
  existingBid?: ClaimedBid;
  onClose: () => void;
  onSubmit: (data: { price: number; teamId: number }) => void;
  onDelete?: () => void;
}

export default function BidModal({
  player,
  teams,
  existingBid,
  onClose,
  onSubmit,
  onDelete,
}: BidModalProps) {
  const isEdit = !!existingBid;
  const [price, setPrice] = useState<string>(existingBid ? String(existingBid.price) : '');
  const [teamId, setTeamId] = useState<number>(existingBid?.teamId ?? teams[0]?.id ?? 0);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  function handleSubmit() {
    const p = Number(price);
    if (!price || isNaN(p) || p <= 0) {
      setError('Enter a valid price.');
      return;
    }
    if (!teamId) {
      setError('Select a team.');
      return;
    }
    setError('');
    onSubmit({ price: p, teamId });
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#141824',
          border: '1px solid #2a3048',
          borderRadius: 10,
          padding: '24px 28px',
          width: 360,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        {/* Header */}
        <div>
          <div
            style={{
              fontSize: 10,
              letterSpacing: 2,
              color: '#4a5168',
              textTransform: 'uppercase',
              fontFamily: 'var(--font-barlow), sans-serif',
              marginBottom: 4,
            }}
          >
            {isEdit ? 'Edit Bid' : 'Log Bid'}
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#e8eaf0' }}>{player.player}</div>
          <div style={{ fontSize: 12, color: '#4a5168', marginTop: 2 }}>
            <span style={{ color: '#8892a4' }}>{player.pos}</span>
            {' · '}
            {player.team}
            {' · '}
            Target:{' '}
            <span style={{ fontFamily: 'var(--font-mono), monospace' }}>${player.budget}</span>
          </div>
        </div>

        {/* Price */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label
            htmlFor="bid-price"
            style={{
              fontSize: 10,
              letterSpacing: 1,
              color: '#4a5168',
              textTransform: 'uppercase',
              fontFamily: 'var(--font-barlow), sans-serif',
            }}
          >
            Price
          </label>
          <input
            id="bid-price"
            aria-label="Price"
            type="number"
            min={1}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            autoFocus
            style={{
              background: '#1a1f2e',
              border: '1px solid #2a3048',
              borderRadius: 6,
              padding: '8px 12px',
              fontSize: 16,
              fontWeight: 700,
              color: '#e8eaf0',
              outline: 'none',
              fontFamily: 'var(--font-mono), monospace',
              width: '100%',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Won By */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label
            htmlFor="bid-team"
            style={{
              fontSize: 10,
              letterSpacing: 1,
              color: '#4a5168',
              textTransform: 'uppercase',
              fontFamily: 'var(--font-barlow), sans-serif',
            }}
          >
            Won By
          </label>
          <select
            id="bid-team"
            aria-label="Won By"
            value={teamId}
            onChange={(e) => setTeamId(Number(e.target.value))}
            style={{
              background: '#1a1f2e',
              border: '1px solid #2a3048',
              borderRadius: 6,
              padding: '8px 12px',
              fontSize: 13,
              color: '#e8eaf0',
              outline: 'none',
              width: '100%',
              cursor: 'pointer',
            }}
          >
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.displayName ?? t.handle} ({t.handle})
              </option>
            ))}
          </select>
        </div>

        {error && <div style={{ fontSize: 11, color: '#e05050' }}>{error}</div>}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
          {isEdit && onDelete && (
            <button
              onClick={onDelete}
              style={{
                marginRight: 'auto',
                padding: '7px 14px',
                borderRadius: 6,
                border: '1px solid #e05050',
                background: 'transparent',
                color: '#e05050',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Remove
            </button>
          )}
          <button
            onClick={onClose}
            style={{
              padding: '7px 14px',
              borderRadius: 6,
              border: '1px solid #2a3048',
              background: 'transparent',
              color: '#4a5168',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            style={{
              padding: '7px 16px',
              borderRadius: 6,
              border: 'none',
              background: '#4f83e8',
              color: '#fff',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {isEdit ? 'Update Bid' : 'Log Bid'}
          </button>
        </div>
      </div>
    </div>
  );
}
