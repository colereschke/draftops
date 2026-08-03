import type { Draft, Prisma } from '@prisma/client';
import {
  DraftMutationFailure,
  isPositiveSafeInteger,
  withActiveOwnedDraftMutation,
  type DraftMutationResult,
} from '@/lib/draftMutation';
import { createTradeAuditEvent, toTradeSnapshot, type AuditableTrade } from '@/lib/tradeAudit';
import { resolvePickHolder } from '@/lib/pickOwnership';
import { getTradeBudgetDeltaByTeamId } from '@/lib/tradeBudget';
import { countsTowardRoster } from '@/lib/rosterPolicy';

export interface TradePickInput {
  originTeamId: number;
  futurePickYear: number;
  futurePickRound: 1 | 2 | 3;
}

export interface CreateTradeRecordInput {
  userId: string;
  draftId: number;
  budgetTeamId: number;
  pickTeamId: number;
  budgetAmount: number;
  notes?: string;
  picks: TradePickInput[];
}

function pickKey(pick: TradePickInput): string {
  return `${pick.originTeamId}:${pick.futurePickYear}:${pick.futurePickRound}`;
}

function hasValidCreateInput(input: CreateTradeRecordInput): boolean {
  if (!isPositiveSafeInteger(input.draftId)) return false;
  if (!isPositiveSafeInteger(input.budgetTeamId)) return false;
  if (!isPositiveSafeInteger(input.pickTeamId)) return false;
  if (!isPositiveSafeInteger(input.budgetAmount)) return false;
  if (input.picks.length === 0) return false;
  for (const pick of input.picks) {
    if (!isPositiveSafeInteger(pick.originTeamId)) return false;
    if (!isPositiveSafeInteger(pick.futurePickYear)) return false;
    if (![1, 2, 3].includes(pick.futurePickRound)) return false;
  }
  const uniqueKeys = new Set(input.picks.map(pickKey));
  if (uniqueKeys.size !== input.picks.length) return false;
  return true;
}

export async function assertTeamCanAbsorbBudgetChange(
  tx: Prisma.TransactionClient,
  draft: Draft,
  teamId: number,
  pendingDelta: number,
  excludeTradeId?: number,
): Promise<void> {
  const [team, results, deltaByTeamId] = await Promise.all([
    tx.team.findFirst({
      where: { id: teamId, draftId: draft.id },
      select: { id: true, budget: true },
    }),
    tx.auctionResult.findMany({
      where: { draftId: draft.id, teamId, deletedAt: null },
      select: { price: true, position: true },
    }),
    getTradeBudgetDeltaByTeamId(tx, draft.id, { excludeTradeId }),
  ]);
  if (!team) throw new DraftMutationFailure('TEAM_NOT_FOUND');

  const spent = results.reduce((sum, result) => sum + result.price, 0);
  const rosterCount = results.reduce(
    (count, result) => count + (countsTowardRoster(result.position) ? 1 : 0),
    0,
  );
  const requiredRosterDollars = Math.max(0, draft.rosterSize - rosterCount);
  const existingDelta = deltaByTeamId.get(teamId) ?? 0;
  const projectedRemaining = team.budget + existingDelta + pendingDelta - spent;
  if (projectedRemaining < requiredRosterDollars) {
    throw new DraftMutationFailure('TRADE_EXCEEDS_BUDGET');
  }
}

async function assertPicksCurrentlyHeldBy(
  tx: Prisma.TransactionClient,
  draftId: number,
  pickTeamId: number,
  picks: TradePickInput[],
): Promise<void> {
  for (const pick of picks) {
    const resolution = await resolvePickHolder(
      tx,
      draftId,
      pick.originTeamId,
      pick.futurePickYear,
      pick.futurePickRound,
    );
    if (resolution.holderTeamId !== pickTeamId) {
      throw new DraftMutationFailure('PICK_NOT_HELD');
    }
  }
}

export async function createTradeRecord(
  input: CreateTradeRecordInput,
): Promise<DraftMutationResult<{ tradeId: number }>> {
  if (!hasValidCreateInput(input)) return { ok: false, code: 'INVALID_INPUT' };
  if (input.budgetTeamId === input.pickTeamId) return { ok: false, code: 'TEAM_NOT_FOUND' };

  return withActiveOwnedDraftMutation(input.userId, input.draftId, async (tx, draft) => {
    // Note on why there's no separate "year must be after the generated year for off-book entries"
    // check here: `resolvePickHolder` resolves ANY (origin, year, round) correctly regardless of
    // whether the year happens to match the currently-generated pool or not — it isn't a distinct
    // code path, just a different outcome at step 2 vs step 3. `hasValidCreateInput` already rejects
    // non-positive/non-integer years. The client-side "after the generated year" constraint (Task 21)
    // exists to keep the picker's two categories visually unambiguous, not because the mutation would
    // behave incorrectly without it — so no additional server check is needed, and none is added here.
    await assertPicksCurrentlyHeldBy(tx, draft.id, input.pickTeamId, input.picks);
    await assertTeamCanAbsorbBudgetChange(tx, draft, input.budgetTeamId, -input.budgetAmount);

    const trade = await tx.trade.create({
      data: {
        draftId: draft.id,
        budgetTeamId: input.budgetTeamId,
        pickTeamId: input.pickTeamId,
        budgetAmount: input.budgetAmount,
        notes: input.notes ?? null,
        pickAssets: {
          create: input.picks.map((pick) => ({
            draftId: draft.id,
            originTeamId: pick.originTeamId,
            futurePickYear: pick.futurePickYear,
            futurePickRound: pick.futurePickRound,
          })),
        },
      },
      include: { pickAssets: true },
    });

    await createTradeAuditEvent(tx, {
      draftId: draft.id,
      tradeId: trade.id,
      actorId: input.userId,
      type: 'CREATE',
      before: null,
      after: toTradeSnapshot(trade as AuditableTrade),
    });

    return { tradeId: trade.id };
  });
}

export interface UpdateTradeRecordInput {
  userId: string;
  draftId: number;
  tradeId: number;
  budgetAmount: number;
  notes?: string;
}

function hasValidUpdateInput(input: UpdateTradeRecordInput): boolean {
  return (
    isPositiveSafeInteger(input.draftId) &&
    isPositiveSafeInteger(input.tradeId) &&
    isPositiveSafeInteger(input.budgetAmount)
  );
}

export async function updateTradeRecord(
  input: UpdateTradeRecordInput,
): Promise<DraftMutationResult<{ tradeId: number }>> {
  if (!hasValidUpdateInput(input)) return { ok: false, code: 'INVALID_INPUT' };

  return withActiveOwnedDraftMutation(input.userId, input.draftId, async (tx, draft) => {
    const existing = await tx.trade.findFirst({
      where: { id: input.tradeId, draftId: draft.id, deletedAt: null },
    });
    if (!existing) throw new DraftMutationFailure('TRADE_NOT_FOUND');

    await assertTeamCanAbsorbBudgetChange(
      tx,
      draft,
      existing.budgetTeamId,
      -input.budgetAmount,
      existing.id,
    );
    await assertTeamCanAbsorbBudgetChange(
      tx,
      draft,
      existing.pickTeamId,
      input.budgetAmount,
      existing.id,
    );

    const updated = await tx.trade.update({
      where: { id: existing.id },
      // `input.notes` is optional — the UI's amount-only edit flow doesn't always resend notes, and
      // `?? null` here would silently wipe them on every amount correction. Falling back to the
      // existing value means "notes omitted" preserves them, while an explicit `''` (deliberately
      // clearing them) still passes through, since `??` only substitutes on `null`/`undefined`.
      data: { budgetAmount: input.budgetAmount, notes: input.notes ?? existing.notes },
    });

    await createTradeAuditEvent(tx, {
      draftId: draft.id,
      tradeId: updated.id,
      actorId: input.userId,
      type: 'UPDATE',
      before: toTradeSnapshot(existing as AuditableTrade),
      after: toTradeSnapshot(updated as AuditableTrade),
    });

    return { tradeId: updated.id };
  });
}

async function getTransactionTimestamp(tx: Prisma.TransactionClient): Promise<Date> {
  const clock = await tx.$queryRaw<Array<{ now: Date }>>`SELECT transaction_timestamp() AS now`;
  return clock[0].now;
}

async function assertNoLaterTradeRetradesAnyPick(
  tx: Prisma.TransactionClient,
  draftId: number,
  trade: { id: number; createdAt: Date },
  picks: Array<{ originTeamId: number; futurePickYear: number; futurePickRound: number }>,
): Promise<void> {
  for (const pick of picks) {
    const laterTrade = await tx.tradePickAsset.findFirst({
      where: {
        draftId,
        originTeamId: pick.originTeamId,
        futurePickYear: pick.futurePickYear,
        futurePickRound: pick.futurePickRound,
        trade: { deletedAt: null, createdAt: { gt: trade.createdAt } },
      },
      select: { id: true },
    });
    if (laterTrade) throw new DraftMutationFailure('PICK_ALREADY_RETRADED');
  }
}

export interface DeleteTradeRecordInput {
  userId: string;
  draftId: number;
  tradeId: number;
}

export async function deleteTradeRecord(
  input: DeleteTradeRecordInput,
): Promise<DraftMutationResult<null>> {
  if (!isPositiveSafeInteger(input.draftId) || !isPositiveSafeInteger(input.tradeId)) {
    return { ok: false, code: 'INVALID_INPUT' };
  }

  return withActiveOwnedDraftMutation(input.userId, input.draftId, async (tx, draft) => {
    const existing = await tx.trade.findFirst({
      where: { id: input.tradeId, draftId: draft.id, deletedAt: null },
      include: { pickAssets: true },
    });
    if (!existing) throw new DraftMutationFailure('TRADE_NOT_FOUND');

    await assertNoLaterTradeRetradesAnyPick(tx, draft.id, existing, existing.pickAssets);
    await assertTeamCanAbsorbBudgetChange(tx, draft, existing.pickTeamId, 0, existing.id);

    const transactionTimestamp = await getTransactionTimestamp(tx);
    const deleted = await tx.trade.update({
      where: { id: existing.id },
      data: { deletedAt: transactionTimestamp, updatedAt: transactionTimestamp },
    });

    await createTradeAuditEvent(tx, {
      draftId: draft.id,
      tradeId: deleted.id,
      actorId: input.userId,
      type: 'DELETE',
      before: toTradeSnapshot(existing as AuditableTrade),
      after: toTradeSnapshot(deleted as AuditableTrade),
    });

    return null;
  });
}
