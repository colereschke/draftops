'use client';

import { useState } from 'react';
import type { Player, ClaimedBid, LeagueTeam } from '@/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface BidModalProps {
  player: Player;
  teams: LeagueTeam[];
  existingBid?: ClaimedBid;
  onClose: () => void;
  onSubmit: (data: { price: number; teamId: number }) => void;
  onDelete?: () => void;
  onNominate?: () => void;
  isNominated?: boolean;
  serverError?: string;
}

export default function BidModal({
  player,
  teams,
  existingBid,
  onClose,
  onSubmit,
  onDelete,
  onNominate,
  isNominated,
  serverError,
}: BidModalProps) {
  const isEdit = !!existingBid;
  const [price, setPrice] = useState<string>(existingBid ? String(existingBid.price) : '');
  const [teamId, setTeamId] = useState<number>(existingBid?.teamId ?? teams[0]?.id ?? 0);
  const [error, setError] = useState<string>('');

  function handleSubmit() {
    const p = Number(price);
    if (!price || isNaN(p) || p <= 0) {
      setError('Enter a valid price.');
      return;
    }
    if (teams.length === 0) {
      setError('No teams available.');
      return;
    }
    setError('');
    onSubmit({ price: p, teamId });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent showCloseButton={false} className="w-[360px] flex flex-col">
        <DialogTitle className="sr-only">{isEdit ? 'Edit Bid' : 'Log Bid'}</DialogTitle>

        {/* Header */}
        <div>
          <div className="font-label text-label-xs text-muted-foreground mb-1 font-bold tracking-wide uppercase">
            {isEdit ? 'Edit Bid' : 'Log Bid'}
          </div>
          <div className="text-body-lg text-foreground font-bold">{player.player}</div>
          <div className="text-body-sm text-muted-foreground mt-0.5">
            <span style={{ color: 'var(--text-secondary)' }}>{player.pos}</span>
            {' · '}
            {player.team}
            {' · '}
            Target: <span className="font-mono">${player.budget}</span>
          </div>
        </div>

        {/* Price */}
        <div className="gap-xs flex flex-col">
          <Label
            htmlFor="bid-price"
            className="font-label text-label-xs text-muted-foreground font-bold tracking-wide uppercase"
          >
            Price
          </Label>
          <Input
            id="bid-price"
            aria-label="Price"
            type="number"
            min={1}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            autoFocus
            className="font-mono text-body-lg font-bold"
          />
        </div>

        {/* Won By */}
        <div className="gap-xs flex flex-col">
          <Label
            htmlFor="bid-team"
            className="font-label text-label-xs text-muted-foreground font-bold tracking-wide uppercase"
          >
            Won By
          </Label>
          <Select value={teamId} onValueChange={(value) => value != null && setTeamId(value)}>
            <SelectTrigger id="bid-team" aria-label="Won By" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {teams.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.displayName ?? t.handle} ({t.handle})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {(error || serverError) && (
          <div className="text-body-sm" style={{ color: 'var(--age-old)' }}>
            {error || serverError}
          </div>
        )}

        {/* Actions */}
        <div className="gap-sm flex items-center justify-end">
          <div className="mr-auto flex items-center gap-2">
            {isEdit && onDelete && (
              <Button variant="destructive" size="sm" onClick={onDelete}>
                Remove
              </Button>
            )}
            {onNominate && !isNominated && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  onNominate();
                  onClose();
                }}
                style={{ borderColor: 'var(--pos-pick)', color: 'var(--pos-pick)' }}
              >
                Nom
              </Button>
            )}
            {onNominate && isNominated && (
              <span className="text-body-sm" style={{ color: 'var(--pos-pick)' }}>
                In Auction
              </span>
            )}
          </div>

          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSubmit}>
            {isEdit ? 'Update Bid' : 'Log Bid'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
