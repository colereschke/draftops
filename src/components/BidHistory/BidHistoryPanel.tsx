'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { restoreBid } from '@/lib/actions';
import { Button } from '@/components/ui/button';

const RESTORE_WINDOW_MS = 30 * 60 * 1000;

export interface DeletedBid {
  id: number;
  player: string;
  position: string;
  price: number;
  teamHandle: string;
  deletedAt: string;
  supersededAt: string | null;
}

export type BidRecoveryState =
  { kind: 'restorable'; remainingMs: number } | { kind: 'expired' } | { kind: 'superseded' };

export interface BidHistoryPanelProps {
  draftId: number;
  deletedBids: DeletedBid[];
  isReadOnly: boolean;
}

export function getBidRecoveryState(bid: DeletedBid, now: Date): BidRecoveryState {
  if (bid.supersededAt !== null) return { kind: 'superseded' };

  const remainingMs = new Date(bid.deletedAt).getTime() + RESTORE_WINDOW_MS - now.getTime();
  if (remainingMs <= 0) return { kind: 'expired' };
  return { kind: 'restorable', remainingMs };
}

function formatRemainingTime(remainingMs: number): string {
  const totalSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function getRestoreFailureMessage(code: string): string {
  const messages: Record<string, string> = {
    DRAFT_COMPLETE: 'This draft is complete and cannot be changed.',
    BID_SUPERSEDED: 'A replacement bid was recorded, so this bid cannot be restored.',
    RESTORE_WINDOW_EXPIRED: 'The 30-minute recovery window expired. Use the recovery runbook.',
    PLAYER_ALREADY_CLAIMED: 'This player has already been claimed by a replacement bid.',
    BID_NOT_DELETED: 'This bid is already active. Refresh to see the current board.',
  };
  return messages[code] ?? 'Unable to restore this bid. Refresh and try again.';
}

export default function BidHistoryPanel({
  draftId,
  deletedBids,
  isReadOnly,
}: BidHistoryPanelProps) {
  const router = useRouter();
  const [now, setNow] = useState(() => new Date());
  const [status, setStatus] = useState<string>('');
  const [restoringBidId, setRestoringBidId] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  function handleRestore(bidId: number) {
    if (isReadOnly || isPending) return;
    setStatus('');
    setRestoringBidId(bidId);
    startTransition(async () => {
      try {
        const result = await restoreBid({ id: bidId, draftId });
        if (!result.ok) {
          setStatus(getRestoreFailureMessage(result.code));
          router.refresh();
          return;
        }
        setStatus('Bid restored.');
        router.refresh();
      } catch {
        setStatus('Unable to restore this bid. Refresh and try again.');
        router.refresh();
      } finally {
        setRestoringBidId(null);
      }
    });
  }

  return (
    <section
      data-testid="bid-history-panel"
      className="border-t border-border-subtle bg-card/20 px-5 py-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-label text-sm font-bold tracking-wide uppercase">Bid recovery</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Deleted bids can be restored for 30 minutes unless a replacement bid claims the player.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <a
            data-testid="export-draft-csv"
            href={`/api/draft/${draftId}/export/csv`}
            className="rounded border border-border-subtle px-2.5 py-1.5 text-muted-foreground hover:border-border hover:text-foreground"
          >
            Export CSV
          </a>
          <a
            data-testid="export-draft-json"
            href={`/api/draft/${draftId}/export/json`}
            className="rounded border border-border-subtle px-2.5 py-1.5 text-muted-foreground hover:border-border hover:text-foreground"
          >
            Export JSON
          </a>
        </div>
      </div>

      {status ? (
        <p
          data-testid="bid-recovery-status"
          role="status"
          className="mt-3 text-xs text-muted-foreground"
        >
          {status}
        </p>
      ) : null}

      {deletedBids.length === 0 ? (
        <p data-testid="bid-history-empty" className="mt-3 text-xs text-muted-foreground">
          No deleted bids in this draft.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {deletedBids.map((bid) => {
            const recovery = getBidRecoveryState(bid, now);
            return (
              <li
                key={bid.id}
                data-testid={`deleted-bid-${bid.id}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded border border-border-subtle bg-background/40 px-3 py-2"
              >
                <div className="text-sm">
                  <span className="font-semibold">{bid.player}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {bid.position} · ${bid.price} · {bid.teamHandle}
                  </span>
                </div>
                {recovery.kind === 'restorable' && !isReadOnly ? (
                  <div className="flex items-center gap-3">
                    <span
                      data-testid={`restore-countdown-${bid.id}`}
                      className="font-mono text-xs tabular-nums text-[var(--pos-pick)]"
                    >
                      {formatRemainingTime(recovery.remainingMs)} remaining
                    </span>
                    <Button
                      data-testid={`restore-bid-${bid.id}`}
                      type="button"
                      size="sm"
                      disabled={isPending}
                      onClick={() => handleRestore(bid.id)}
                    >
                      {restoringBidId === bid.id ? 'Restoring…' : 'Restore bid'}
                    </Button>
                  </div>
                ) : (
                  <p
                    data-testid={`restore-unavailable-${bid.id}`}
                    className="text-xs text-muted-foreground"
                  >
                    {recovery.kind === 'superseded'
                      ? 'Replacement bid recorded. This deleted bid is permanently superseded.'
                      : recovery.kind === 'expired'
                        ? 'Recovery window expired. Use the recovery runbook for older incidents.'
                        : 'This completed draft is read-only.'}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
