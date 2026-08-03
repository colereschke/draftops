'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deleteTrade, restoreTrade, updateTrade } from '@/lib/actions';
import MutationStatus from '@/components/MutationStatus';

const RESTORE_WINDOW_MS = 30 * 60 * 1000;

const BUTTON_CLASS =
  'rounded-md border border-border-subtle px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';
const DESTRUCTIVE_BUTTON_CLASS =
  'rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-1 text-xs text-destructive hover:bg-destructive/20 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

function getTradeMutationFailureMessage(code: string): string {
  const messages: Record<string, string> = {
    TRADE_NOT_FOUND: 'This trade could not be found. Refresh to see the current list.',
    TRADE_NOT_DELETED: 'This trade is already active. Refresh to see the current list.',
    TRADE_EXCEEDS_BUDGET: 'This change would leave a team without enough budget for its roster.',
    PICK_NOT_HELD: 'One of the picks in this trade is no longer held by the expected team.',
    PICK_ALREADY_RETRADED:
      'A later trade already re-traded one of these picks. Remove that one first.',
    RESTORE_WINDOW_EXPIRED: 'The 30-minute recovery window expired.',
    INVALID_INPUT: 'Enter a valid, positive budget amount.',
    DRAFT_COMPLETE: 'This draft is complete and cannot be changed.',
  };
  return messages[code] ?? 'Unable to complete this action. Refresh and try again.';
}

export interface TradeHistoryEntry {
  id: number;
  budgetTeamHandle: string;
  pickTeamHandle: string;
  budgetAmount: number;
  picks: Array<{ originHandle: string; futurePickYear: number; futurePickRound: 1 | 2 | 3 }>;
  createdAt: string;
  deletedAt: string | null;
}

export interface TradeHistoryListProps {
  draftId: number;
  trades: TradeHistoryEntry[];
  /**
   * Test-only clock pin. When supplied, the 1-second tick is skipped so restore-window
   * expiration is deterministic. Production always leaves this undefined and uses the real,
   * ticking clock.
   */
  nowMs?: number;
}

function describePicks(picks: TradeHistoryEntry['picks']): string {
  return picks
    .map((pick) => `${pick.originHandle} ${pick.futurePickYear} round ${pick.futurePickRound}`)
    .join(', ');
}

export default function TradeHistoryList({ draftId, trades, nowMs }: TradeHistoryListProps) {
  const router = useRouter();
  const [now, setNow] = useState(() => new Date(nowMs ?? Date.now()));
  const [confirmingId, setConfirmingId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [errorByTradeId, setErrorByTradeId] = useState<Record<number, string>>({});
  const [statusMessage, setStatusMessage] = useState('');
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (nowMs !== undefined) return; // tests pin the clock — don't tick in that case
    const intervalId = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(intervalId);
  }, [nowMs]);

  function setRowError(tradeId: number, message: string | null) {
    setErrorByTradeId((prev) => {
      const next = { ...prev };
      if (message === null) delete next[tradeId];
      else next[tradeId] = message;
      return next;
    });
  }

  function handleDelete(tradeId: number) {
    startTransition(async () => {
      try {
        const result = await deleteTrade({ id: tradeId, draftId });
        if (result.ok) {
          setStatusMessage('Trade removed.');
          setRowError(tradeId, null);
        } else {
          setStatusMessage(`Could not remove trade: ${result.code}`);
          setRowError(tradeId, getTradeMutationFailureMessage(result.code));
        }
      } catch {
        setStatusMessage('Could not remove trade.');
        setRowError(tradeId, 'Unable to remove this trade. Refresh and try again.');
      } finally {
        setConfirmingId(null);
        router.refresh();
      }
    });
  }

  function handleRestore(tradeId: number) {
    startTransition(async () => {
      try {
        const result = await restoreTrade({ id: tradeId, draftId });
        if (result.ok) {
          setStatusMessage('Trade restored.');
          setRowError(tradeId, null);
        } else {
          setStatusMessage(`Could not restore trade: ${result.code}`);
          setRowError(tradeId, getTradeMutationFailureMessage(result.code));
        }
      } catch {
        setStatusMessage('Could not restore trade.');
        setRowError(tradeId, 'Unable to restore this trade. Refresh and try again.');
      } finally {
        router.refresh();
      }
    });
  }

  function startEdit(trade: TradeHistoryEntry) {
    setEditingId(trade.id);
    setEditAmount(String(trade.budgetAmount));
    setRowError(trade.id, null);
  }

  function cancelEdit(tradeId: number) {
    setEditingId(null);
    setRowError(tradeId, null);
  }

  function handleSaveEdit(tradeId: number) {
    const parsedAmount = Number(editAmount);
    if (!Number.isInteger(parsedAmount) || parsedAmount <= 0) {
      setRowError(tradeId, 'Enter a valid, positive budget amount.');
      return;
    }
    startTransition(async () => {
      try {
        // Amount-only edit: `notes`, both team ids, and the pick set are deliberately not sent.
        // `updateTradeRecord` preserves existing notes when the field is omitted, and direction
        // or pick changes have to be made by removing this trade and logging a new one.
        const result = await updateTrade({ id: tradeId, budgetAmount: parsedAmount, draftId });
        if (result.ok) {
          setStatusMessage('Trade updated.');
          setRowError(tradeId, null);
          setEditingId(null);
        } else {
          setStatusMessage(`Could not update trade: ${result.code}`);
          setRowError(tradeId, getTradeMutationFailureMessage(result.code));
        }
      } catch {
        setStatusMessage('Could not update trade.');
        setRowError(tradeId, 'Unable to update this trade. Refresh and try again.');
      } finally {
        router.refresh();
      }
    });
  }

  return (
    <section
      data-testid="trade-history"
      // Named so this becomes a `region` landmark: the list renders as a sibling of
      // RosterTracker's <main>, and unnamed content outside a landmark is an axe violation.
      aria-labelledby="trade-history-heading"
      className="border-t border-border-subtle bg-card/20 px-5 py-4"
    >
      <h2
        id="trade-history-heading"
        className="font-label text-sm font-bold tracking-wide uppercase"
      >
        Trade history
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Budget-for-picks trades logged in this draft. Amounts can be corrected in place; a removed
        trade can be restored for 30 minutes.
      </p>

      {trades.length === 0 ? (
        <p data-testid="trade-history-empty" className="mt-3 text-xs text-muted-foreground">
          No trades logged in this draft.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {trades.map((trade) => {
            const isDeleted = trade.deletedAt !== null;
            // `>=` mirrors the server boundary in `restoreTradeRecord` (which rejects once
            // `deletedAt <= now - 30 minutes`), so the button never lingers for an instant
            // after the action would already refuse it.
            const restoreExpired =
              isDeleted &&
              now.getTime() - new Date(trade.deletedAt as string).getTime() >= RESTORE_WINDOW_MS;
            const summary = `${trade.budgetTeamHandle} to ${trade.pickTeamHandle}`;
            const rowError = errorByTradeId[trade.id];

            return (
              <li
                key={trade.id}
                data-testid={`trade-history-row-${trade.id}`}
                className={`rounded border border-border-subtle bg-background/40 px-3 py-2 ${
                  isDeleted ? 'opacity-60' : ''
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="text-sm">
                    <span className="font-semibold">{trade.budgetTeamHandle}</span>
                    <span className="text-muted-foreground"> sent </span>
                    <span className="font-mono tabular-nums">${trade.budgetAmount}</span>
                    <span className="text-muted-foreground"> to </span>
                    <span className="font-semibold">{trade.pickTeamHandle}</span>
                    <span className="text-muted-foreground"> for </span>
                    <span>{describePicks(trade.picks)}</span>
                  </span>

                  <div className="flex flex-wrap items-center gap-2">
                    {/* Gated on `!isDeleted` too: if a refresh soft-deletes the row mid-edit,
                        the amount field must not linger next to the Restore button. */}
                    {!isDeleted && editingId === trade.id ? (
                      <>
                        <label
                          htmlFor={`trade-history-edit-amount-${trade.id}`}
                          className="font-label text-[10px] font-bold tracking-wide text-muted-foreground uppercase"
                        >
                          New amount
                        </label>
                        <input
                          id={`trade-history-edit-amount-${trade.id}`}
                          data-testid={`trade-history-edit-amount-${trade.id}`}
                          type="number"
                          min={1}
                          step={1}
                          value={editAmount}
                          onChange={(event) => setEditAmount(event.target.value)}
                          className="w-24 rounded-md border border-border-subtle bg-background px-2 py-1 font-mono text-sm tabular-nums text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        />
                        <button
                          type="button"
                          disabled={isPending}
                          data-testid={`trade-history-save-${trade.id}`}
                          onClick={() => handleSaveEdit(trade.id)}
                          className={BUTTON_CLASS}
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          disabled={isPending}
                          data-testid={`trade-history-cancel-edit-${trade.id}`}
                          onClick={() => cancelEdit(trade.id)}
                          className={BUTTON_CLASS}
                        >
                          Cancel
                        </button>
                      </>
                    ) : null}

                    {!isDeleted && editingId !== trade.id ? (
                      confirmingId === trade.id ? (
                        <>
                          <button
                            type="button"
                            disabled={isPending}
                            data-testid={`trade-history-confirm-remove-${trade.id}`}
                            aria-label={`Confirm removing the ${summary} trade`}
                            onClick={() => handleDelete(trade.id)}
                            className={DESTRUCTIVE_BUTTON_CLASS}
                          >
                            Confirm Remove
                          </button>
                          <button
                            type="button"
                            disabled={isPending}
                            data-testid={`trade-history-keep-${trade.id}`}
                            aria-label={`Keep the ${summary} trade`}
                            onClick={() => setConfirmingId(null)}
                            className={BUTTON_CLASS}
                          >
                            Keep
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            disabled={isPending}
                            data-testid={`trade-history-edit-${trade.id}`}
                            aria-label={`Edit the amount of the ${summary} trade`}
                            onClick={() => startEdit(trade)}
                            className={BUTTON_CLASS}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            disabled={isPending}
                            data-testid={`trade-history-remove-${trade.id}`}
                            aria-label={`Remove the ${summary} trade`}
                            onClick={() => setConfirmingId(trade.id)}
                            className={BUTTON_CLASS}
                          >
                            Remove
                          </button>
                        </>
                      )
                    ) : null}

                    {isDeleted &&
                      (restoreExpired ? (
                        <span
                          data-testid={`trade-history-expired-${trade.id}`}
                          className="text-xs text-muted-foreground"
                        >
                          Removed — too late to restore
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={isPending}
                          data-testid={`trade-history-restore-${trade.id}`}
                          aria-label={`Restore the ${summary} trade`}
                          onClick={() => handleRestore(trade.id)}
                          className={BUTTON_CLASS}
                        >
                          Restore
                        </button>
                      ))}
                  </div>
                </div>

                {rowError ? (
                  <p
                    data-testid={`trade-history-error-${trade.id}`}
                    role="alert"
                    className="mt-2 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-xs text-destructive"
                  >
                    {rowError}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      <MutationStatus message={statusMessage} />
    </section>
  );
}
