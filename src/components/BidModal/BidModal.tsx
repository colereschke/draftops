'use client';

import { useState, type FormEvent } from 'react';
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
import { formatSpread, ordinal, spreadColor, strategyTagReason } from '@/lib/valueSpread';

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
  isSubmitting?: boolean;
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
  isSubmitting = false,
}: BidModalProps) {
  const isEdit = !!existingBid;
  const [price, setPrice] = useState<string>(existingBid ? String(existingBid.price) : '');
  const [teamId, setTeamId] = useState<number>(existingBid?.teamId ?? teams[0]?.id ?? 0);
  const [error, setError] = useState<string>('');
  const [deleteArmed, setDeleteArmed] = useState<boolean>(false);
  const selectedTeam = teams.find((team) => team.id === teamId);
  const hasProjectionContext =
    player.projectionAuctionValue !== null && player.projectionAuctionValue !== undefined;

  function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;
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
      <DialogContent
        showCloseButton={false}
        className="flex flex-col"
        style={{
          width: '360px',
          maxWidth: 'calc(100vw - 32px)',
        }}
      >
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

        {hasProjectionContext && (
          <div
            data-testid="bid-price-context"
            className="rounded-md border border-border-subtle bg-card/45 p-2.5"
          >
            <div className="font-label mb-2 text-[10px] font-bold tracking-wide text-muted-foreground uppercase">
              Price context
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="font-label text-[9px] font-bold tracking-wide text-muted-foreground uppercase">
                  Dynasty
                </div>
                <div
                  data-testid="bid-price-context-dynasty"
                  className="font-mono text-xs font-bold tabular-nums"
                >
                  ${player.baseBudget ?? player.budget}
                </div>
              </div>
              <div>
                <div className="font-label text-[9px] font-bold tracking-wide text-muted-foreground uppercase">
                  Projection
                </div>
                <div
                  data-testid="bid-price-context-projection"
                  className="font-mono text-xs font-bold tabular-nums"
                >
                  ${player.projectionAuctionValue}
                </div>
              </div>
              <div>
                <div className="font-label text-[9px] font-bold tracking-wide text-muted-foreground uppercase">
                  Active
                </div>
                <div
                  data-testid="bid-price-context-active"
                  className="font-mono text-xs font-bold tabular-nums"
                >
                  ${player.budget}
                </div>
              </div>
            </div>

            {player.spread != null && (
              <div data-testid="bid-spread" className="mt-2.5 border-t border-border-subtle pt-2">
                <div className="font-mono text-[11px] tabular-nums text-secondary-fg">
                  Dyn {player.spreadDynPct != null ? ordinal(player.spreadDynPct) : '—'} (#
                  {player.spreadDynRank}) · Proj{' '}
                  {player.spreadProjPct != null ? ordinal(player.spreadProjPct) : '—'} (#
                  {player.spreadProjRank}) · Spread{' '}
                  <span
                    style={{
                      color: spreadColor(player.spread),
                    }}
                  >
                    {formatSpread(player.spread)}
                  </span>
                </div>
                <div className="mt-0.5 text-[9px] tracking-wide text-muted-foreground/70 uppercase">
                  percentile within position (rank)
                </div>
                {player.strategyTag && (
                  <div data-testid="bid-strategy-tag" className="mt-2 flex items-start gap-2">
                    <span
                      className="font-label rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wide uppercase"
                      style={{ background: 'var(--pos-pick)', color: 'var(--bg-base)' }}
                    >
                      {player.strategyTag}
                    </span>
                    <span className="text-[11px] leading-tight text-muted-foreground">
                      {strategyTagReason(player.strategyTag)}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <form onSubmit={handleFormSubmit} className="contents">
          {/* Price */}
          <div className="gap-xs flex flex-col">
            <Label
              htmlFor="bid-price"
              className="font-label text-label-xs text-muted-foreground font-bold tracking-wide uppercase"
            >
              Price
            </Label>
            <Input
              data-testid="bid-price"
              id="bid-price"
              aria-label="Price"
              type="number"
              min={1}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              autoFocus
              disabled={isSubmitting}
              className="font-mono text-body-lg rounded-md bg-background font-bold focus-visible:border-border focus-visible:ring-1 focus-visible:ring-border"
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
            <Select
              value={String(teamId)}
              onValueChange={(value) => value != null && setTeamId(Number(value))}
            >
              <SelectTrigger
                id="bid-team"
                aria-label="Won By"
                disabled={isSubmitting}
                className="w-full focus-visible:border-border focus-visible:ring-1 focus-visible:ring-border"
              >
                <SelectValue>
                  {selectedTeam
                    ? `${selectedTeam.displayName ?? selectedTeam.handle} (${selectedTeam.handle})`
                    : 'Select team'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {teams.map((t) => (
                  <SelectItem key={t.id} value={String(t.id)}>
                    {t.displayName ?? t.handle} ({t.handle})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {(error || serverError) && (
            <div
              data-testid="bid-server-error"
              className="text-body-sm"
              style={{ color: 'var(--age-old)' }}
            >
              {error || serverError}
            </div>
          )}

          {/* Actions */}
          <div className="gap-sm flex items-center justify-end">
            <div className="mr-auto flex items-center gap-sm">
              {isEdit && onDelete && !deleteArmed && (
                <Button
                  variant="destructive"
                  size="touch"
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setDeleteArmed(true)}
                >
                  Remove
                </Button>
              )}
              {isEdit && onDelete && deleteArmed && (
                <>
                  <Button
                    variant="ghost"
                    size="touch"
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => setDeleteArmed(false)}
                  >
                    Keep
                  </Button>
                  <Button
                    variant="destructive"
                    size="touch"
                    type="button"
                    disabled={isSubmitting}
                    onClick={onDelete}
                  >
                    Confirm Remove
                  </Button>
                </>
              )}
              {onNominate && !isNominated && (
                <Button
                  variant="outline"
                  size="touch"
                  type="button"
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

            <Button variant="outline" size="touch" type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button data-testid="bid-submit" size="touch" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : isEdit ? 'Update Bid' : 'Log Bid'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
