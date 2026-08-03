'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { logTrade } from '@/lib/actions';
import MutationStatus from '@/components/MutationStatus';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import type { LeagueTeam } from '@/types';
import type { KnownPickOption } from '@/lib/tradePicker';

function getTradeFailureMessage(code: string): string {
  const messages: Record<string, string> = {
    INVALID_INPUT: 'Check the counterparty, amount, and at least one selected pick.',
    TEAM_NOT_FOUND: 'One of the selected teams could not be found. Refresh and try again.',
    TRADE_EXCEEDS_BUDGET: 'This trade would leave a team without enough budget for its roster.',
    PICK_NOT_HELD: 'The pick-side team no longer holds one of the selected picks.',
    DRAFT_COMPLETE: 'This draft is complete and cannot be changed.',
  };
  return messages[code] ?? 'Unable to log this trade. Refresh and try again.';
}

export interface ManualPickEntry {
  originTeamId: number;
  futurePickYear: number;
  futurePickRound: 1 | 2 | 3;
}

export interface TradeModalProps {
  draftId: number;
  teams: LeagueTeam[];
  initialTeamId: number;
  generatedPickYear: number | null;
  tradeablePicksByTeamId: Record<number, KnownPickOption[]>;
  isOpen: boolean;
  onClose: () => void;
}

type InitiatingRole = 'budget' | 'pick';

function knownPickKey(pick: KnownPickOption): string {
  return `${pick.originTeamId}:${pick.futurePickYear}:${pick.futurePickRound}`;
}

function manualPickKey(pick: ManualPickEntry): string {
  return `${pick.originTeamId}:${pick.futurePickYear}:${pick.futurePickRound}`;
}

const FIELD_CLASS =
  'mt-1 w-full rounded-md border border-border-subtle bg-background px-2 py-1.5 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';
const LABEL_CLASS =
  'font-label text-[10px] font-bold tracking-wide text-muted-foreground uppercase';

export default function TradeModal({
  draftId,
  teams,
  initialTeamId,
  generatedPickYear,
  tradeablePicksByTeamId,
  isOpen,
  onClose,
}: TradeModalProps) {
  const [initiatingRole, setInitiatingRole] = useState<InitiatingRole>('budget');
  const [counterpartyTeamId, setCounterpartyTeamId] = useState<number | null>(null);
  const [budgetAmount, setBudgetAmount] = useState('');
  const [checkedKnownKeys, setCheckedKnownKeys] = useState<Set<string>>(new Set());
  const [manualPicks, setManualPicks] = useState<ManualPickEntry[]>([]);
  const [manualOriginTeamId, setManualOriginTeamId] = useState<number | ''>('');
  const [manualYear, setManualYear] = useState('');
  const [manualRound, setManualRound] = useState<1 | 2 | 3>(1);
  const [errorMessage, setErrorMessage] = useState('');
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const budgetTeamId = initiatingRole === 'budget' ? initialTeamId : counterpartyTeamId;
  const pickTeamId = initiatingRole === 'budget' ? counterpartyTeamId : initialTeamId;

  const counterpartyOptions = useMemo(
    () => teams.filter((team) => team.id !== initialTeamId),
    [teams, initialTeamId],
  );
  const knownPickOptions = pickTeamId !== null ? (tradeablePicksByTeamId[pickTeamId] ?? []) : [];

  const parsedAmount = Number(budgetAmount);
  const isAmountValid = Number.isInteger(parsedAmount) && parsedAmount > 0;
  const totalSelectedPicks = checkedKnownKeys.size + manualPicks.length;
  const canSubmit =
    !isPending &&
    pickTeamId !== null &&
    budgetTeamId !== null &&
    budgetTeamId !== pickTeamId &&
    isAmountValid &&
    totalSelectedPicks > 0;

  const parsedManualYear = Number(manualYear);
  const canAddManualPick =
    manualOriginTeamId !== '' &&
    Number.isInteger(parsedManualYear) &&
    (generatedPickYear === null || parsedManualYear > generatedPickYear) &&
    parsedManualYear > 0;

  function toggleKnownPick(pick: KnownPickOption) {
    setCheckedKnownKeys((prev) => {
      const next = new Set(prev);
      const key = knownPickKey(pick);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function addManualPick() {
    // The empty-origin check comes first: `canAddManualPick` already implies a non-empty
    // origin, so testing it after would leave TS with an already-narrowed `number` and
    // flag the `=== ''` comparison as impossible.
    if (manualOriginTeamId === '' || !canAddManualPick) return;
    const entry: ManualPickEntry = {
      originTeamId: manualOriginTeamId,
      futurePickYear: parsedManualYear,
      futurePickRound: manualRound,
    };
    setManualPicks((prev) =>
      prev.some((existing) => manualPickKey(existing) === manualPickKey(entry))
        ? prev
        : [...prev, entry],
    );
    setManualYear('');
  }

  function removeManualPick(key: string) {
    setManualPicks((prev) => prev.filter((pick) => manualPickKey(pick) !== key));
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit || pickTeamId === null || budgetTeamId === null) return;

    const knownPicks = knownPickOptions
      .filter((pick) => checkedKnownKeys.has(knownPickKey(pick)))
      .map((pick) => ({
        originTeamId: pick.originTeamId,
        futurePickYear: pick.futurePickYear,
        futurePickRound: pick.futurePickRound,
      }));

    startTransition(async () => {
      try {
        const result = await logTrade({
          budgetTeamId,
          pickTeamId,
          budgetAmount: parsedAmount,
          notes: undefined,
          picks: [...knownPicks, ...manualPicks],
          draftId,
        });
        if (result.ok) {
          // No success status text to set here — the parent unmounts this modal on close, so
          // there'd be no one left to read it. Just refresh and close.
          router.refresh();
          onClose();
          return;
        }
        setErrorMessage(getTradeFailureMessage(result.code));
        router.refresh();
      } catch {
        setErrorMessage('Unable to log this trade. Refresh and try again.');
        router.refresh();
      }
    });
  }

  const initialTeamHandle = teams.find((team) => team.id === initialTeamId)?.handle ?? '';

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        data-testid="trade-modal"
        className="bg-card"
        style={{
          width: '420px',
          maxWidth: 'calc(100vw - 32px)',
        }}
      >
        <DialogTitle className="sr-only">Log Trade</DialogTitle>

        <div className="font-label text-[10px] font-bold tracking-wide text-muted-foreground uppercase">
          Log Trade
        </div>

        {errorMessage && (
          <p
            data-testid="trade-modal-error"
            role="alert"
            className="mt-2 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-xs text-destructive"
          >
            {errorMessage}
          </p>
        )}

        <form onSubmit={handleSubmit} className="mt-3 flex flex-col gap-3">
          <fieldset className="border-0 p-0">
            <legend className={LABEL_CLASS}>{initialTeamHandle} is</legend>
            <label className="mt-1 flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="trade-initiating-role"
                checked={initiatingRole === 'budget'}
                onChange={() => {
                  setInitiatingRole('budget');
                  setCheckedKnownKeys(new Set());
                  setManualPicks([]);
                }}
                data-testid="trade-role-budget-radio"
              />
              sending budget, receiving picks
            </label>
            <label className="mt-1 flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="trade-initiating-role"
                checked={initiatingRole === 'pick'}
                onChange={() => {
                  setInitiatingRole('pick');
                  setCheckedKnownKeys(new Set());
                  setManualPicks([]);
                }}
                data-testid="trade-role-picks-radio"
              />
              sending picks, receiving budget
            </label>
          </fieldset>

          <div>
            <label htmlFor="trade-counterparty" className={LABEL_CLASS}>
              Counterparty
            </label>
            <select
              id="trade-counterparty"
              data-testid="trade-counterparty-select"
              value={counterpartyTeamId ?? ''}
              onChange={(event) => {
                setCounterpartyTeamId(Number(event.target.value));
                setCheckedKnownKeys(new Set());
                setManualPicks([]);
              }}
              className={FIELD_CLASS}
            >
              <option value="" disabled>
                Select a team
              </option>
              {counterpartyOptions.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.displayName ?? team.handle}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="trade-budget-amount" className={LABEL_CLASS}>
              Budget amount
            </label>
            <input
              id="trade-budget-amount"
              data-testid="trade-budget-amount-input"
              type="number"
              min={1}
              step={1}
              value={budgetAmount}
              onChange={(event) => setBudgetAmount(event.target.value)}
              className={`${FIELD_CLASS} font-mono tabular-nums`}
            />
          </div>

          <fieldset className="border-0 p-0">
            <legend className={LABEL_CLASS}>
              Picks {teams.find((t) => t.id === pickTeamId)?.handle ?? 'the pick-side team'} sends
            </legend>
            {knownPickOptions.map((pick) => (
              <label key={knownPickKey(pick)} className="mt-1 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  data-testid={`trade-pick-checkbox-${knownPickKey(pick)}`}
                  checked={checkedKnownKeys.has(knownPickKey(pick))}
                  onChange={() => toggleKnownPick(pick)}
                />
                {pick.originHandle} {pick.futurePickYear} round {pick.futurePickRound}
              </label>
            ))}

            <div className="mt-3 rounded-md border border-border-subtle bg-background/40 p-2.5">
              <span id="trade-manual-pick-label" className="text-xs text-muted-foreground">
                Add a future pick (year after {generatedPickYear ?? 'the current pool'})
              </span>
              <div className="mt-2 grid grid-cols-3 gap-2">
                <div>
                  <label htmlFor="trade-manual-origin" className={LABEL_CLASS}>
                    Origin team
                  </label>
                  <select
                    id="trade-manual-origin"
                    data-testid="trade-manual-origin-select"
                    aria-describedby="trade-manual-pick-label"
                    value={manualOriginTeamId}
                    onChange={(event) => setManualOriginTeamId(Number(event.target.value))}
                    className={FIELD_CLASS}
                  >
                    <option value="" disabled>
                      Select a team
                    </option>
                    {teams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.displayName ?? team.handle}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="trade-manual-year" className={LABEL_CLASS}>
                    Year
                  </label>
                  <input
                    id="trade-manual-year"
                    data-testid="trade-manual-year-input"
                    type="number"
                    min={(generatedPickYear ?? 0) + 1}
                    step={1}
                    value={manualYear}
                    onChange={(event) => setManualYear(event.target.value)}
                    className={`${FIELD_CLASS} font-mono tabular-nums`}
                  />
                </div>
                <div>
                  <label htmlFor="trade-manual-round" className={LABEL_CLASS}>
                    Round
                  </label>
                  <select
                    id="trade-manual-round"
                    data-testid="trade-manual-round-select"
                    value={manualRound}
                    onChange={(event) => setManualRound(Number(event.target.value) as 1 | 2 | 3)}
                    className={FIELD_CLASS}
                  >
                    <option value={1}>1st</option>
                    <option value={2}>2nd</option>
                    <option value={3}>3rd</option>
                  </select>
                </div>
              </div>
              <button
                type="button"
                data-testid="trade-manual-add-button"
                disabled={!canAddManualPick}
                onClick={addManualPick}
                className="mt-2 rounded-md border border-border-subtle px-2.5 py-1 text-xs text-foreground hover:bg-muted disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                Add pick
              </button>
            </div>

            {manualPicks.length > 0 && (
              <ul className="mt-2 flex flex-col gap-1">
                {manualPicks.map((pick) => {
                  const key = manualPickKey(pick);
                  const originHandle = teams.find((t) => t.id === pick.originTeamId)?.handle ?? '';
                  return (
                    <li key={key} className="flex items-center justify-between gap-2 text-sm">
                      <span>
                        {originHandle} {pick.futurePickYear} round {pick.futurePickRound}
                      </span>
                      <button
                        type="button"
                        data-testid={`trade-manual-remove-${key}`}
                        onClick={() => removeManualPick(key)}
                        className="rounded-md border border-border-subtle px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      >
                        Remove
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </fieldset>

          <div className="mt-1 flex items-center justify-end gap-2">
            <button
              type="button"
              data-testid="trade-cancel-button"
              onClick={onClose}
              disabled={isPending}
              className="rounded-md border border-border-subtle px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              Cancel
            </button>
            <button
              type="submit"
              data-testid="trade-submit-button"
              disabled={!canSubmit}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/80 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              Log trade
            </button>
          </div>
        </form>
        <MutationStatus message={errorMessage} />
      </DialogContent>
    </Dialog>
  );
}
