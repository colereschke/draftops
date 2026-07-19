import type { Prisma, PrismaClient } from '@prisma/client';
import type { FuturePickAssetKind, Player, Position, ScoringSettings, StartingSlot } from '@/types';
import { DEFAULT_SCORING_SETTINGS, DEFAULT_STARTING_LINEUP } from '@/types';
import {
  type ApplyProjectionValuesOptions,
  type ApplyProjectionValuesResult,
  type ProjectionApplyPrisma,
} from '@/lib/projectionApplication';
import { adjustPlayerValues } from '@/lib/valueAdjustment';
import { getBudgetScale, scaleWholeDollar } from '@/lib/valuationBudget';

export interface BudgetValueBackfillPlayer {
  id: number;
  name: string;
  nflTeam: string;
  pos: string;
  age: number | null;
  sfRank: number;
  notes: string;
  budget: number;
  ceiling: number;
  floor: number;
  baseBudget: number;
  baseCeiling: number;
  baseFloor: number;
  sleeperId: string | null;
  customKey: string | null;
  futurePickYear: number | null;
  futurePickRound: number | null;
  futurePickOriginHandle: string | null;
  futurePickAssetKind: string | null;
}

export interface BudgetValueBackfillPlayerValue {
  id: number;
  draftId: number;
  playerId: number;
  projectionSourceId: number | null;
  valueSetId: number;
  projectedPoints: number | null;
  replacementPoints: number | null;
  vor: number | null;
  projectionAuctionValue: number | null;
  fallbackAuctionValue: number;
  activeAuctionValue: number;
  valueSource: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface BudgetValueBackfillDraft {
  id: number;
  name: string;
  createdAt: Date;
  budget: number;
  playerValueSourceBudget: number;
  teamCount: number;
  rosterSize: number;
  futurePickAuctionMode: string;
  startingLineup: unknown;
  scoringSettings: unknown;
  targetRoster: unknown;
  activeProjectionValueSetId: number | null;
  projectionValueSets: BudgetValueBackfillValueSet[];
  players: BudgetValueBackfillPlayer[];
  playerValues: BudgetValueBackfillPlayerValue[];
}

export interface BudgetValueBackfillValueSet {
  id: number;
  draftId: number;
  projectionSourceId: number | null;
  status: string;
  expectedPlayerCount: number;
  appliedPlayerCount: number;
  createdAt: Date;
  activatedAt: Date | null;
  failedAt: Date | null;
  failureCode: string | null;
  failureMessage: string | null;
}

export interface BudgetValuePlayerUpdate {
  id: number;
  budget: number;
  ceiling: number;
  floor: number;
}

export interface BudgetValueDraftPlan {
  draftId: number;
  draftName: string;
  changedPlayerCount: number;
  beforeFallbackTotal: number;
  afterFallbackTotal: number;
  beforeActiveTotal: number;
  afterActiveTotal: number;
  playerUpdates: BudgetValuePlayerUpdate[];
}

export interface BudgetValueBackfillPlan {
  drafts: BudgetValueDraftPlan[];
}

export interface BudgetValueSnapshot {
  createdAt: string;
  drafts: BudgetValueBackfillDraft[];
}

export interface BudgetValueBackfillOptions {
  apply: boolean;
  draftId?: number;
  snapshotDir?: string;
}

export interface BudgetValueBackfillResult extends BudgetValueBackfillPlan {
  mode: 'dry-run' | 'applied';
  snapshotPath: string | null;
}

export type BudgetValueBackfillTransaction = Prisma.TransactionClient;

export interface BudgetValueBackfillPrisma {
  draft: Pick<PrismaClient['draft'], 'findMany'>;
  draftPlayerValue: Pick<PrismaClient['draftPlayerValue'], 'aggregate'>;
  $transaction: PrismaClient['$transaction'];
}

export interface BudgetValueBackfillDependencies {
  writeSnapshot(snapshot: BudgetValueSnapshot, snapshotDir: string): Promise<string>;
  applyProjections(
    prisma: ProjectionApplyPrisma,
    options: ApplyProjectionValuesOptions,
  ): Promise<ApplyProjectionValuesResult>;
  pruneProjectionRows(prisma: BudgetValueBackfillPrisma, draftId: number): Promise<void>;
}

export function planBudgetValueBackfill(
  drafts: BudgetValueBackfillDraft[],
): BudgetValueBackfillPlan {
  drafts.forEach(validatePersistedDraftBudgets);

  return {
    drafts: drafts
      .filter((draft) => draft.budget !== draft.playerValueSourceBudget)
      .map(planDraftBackfill),
  };
}

export async function runBudgetValueBackfill(
  prisma: BudgetValueBackfillPrisma,
  options: BudgetValueBackfillOptions,
  dependencies: BudgetValueBackfillDependencies,
): Promise<BudgetValueBackfillResult> {
  const drafts = await prisma.draft.findMany({
    ...(options.draftId === undefined ? {} : { where: { id: options.draftId } }),
    select: {
      id: true,
      name: true,
      createdAt: true,
      budget: true,
      playerValueSourceBudget: true,
      teamCount: true,
      rosterSize: true,
      futurePickAuctionMode: true,
      startingLineup: true,
      scoringSettings: true,
      targetRoster: true,
      activeProjectionValueSetId: true,
      projectionValueSets: {
        select: {
          id: true,
          draftId: true,
          projectionSourceId: true,
          status: true,
          expectedPlayerCount: true,
          appliedPlayerCount: true,
          createdAt: true,
          activatedAt: true,
          failedAt: true,
          failureCode: true,
          failureMessage: true,
        },
      },
      players: {
        select: {
          id: true,
          name: true,
          nflTeam: true,
          pos: true,
          age: true,
          sfRank: true,
          notes: true,
          budget: true,
          ceiling: true,
          floor: true,
          baseBudget: true,
          baseCeiling: true,
          baseFloor: true,
          sleeperId: true,
          customKey: true,
          futurePickYear: true,
          futurePickRound: true,
          futurePickOriginHandle: true,
          futurePickAssetKind: true,
        },
      },
      playerValues: {
        select: {
          id: true,
          draftId: true,
          playerId: true,
          projectionSourceId: true,
          valueSetId: true,
          projectedPoints: true,
          replacementPoints: true,
          vor: true,
          projectionAuctionValue: true,
          fallbackAuctionValue: true,
          activeAuctionValue: true,
          valueSource: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  });
  const plan = planBudgetValueBackfill(drafts);

  if (!options.apply) {
    return { ...plan, mode: 'dry-run', snapshotPath: null };
  }

  const affectedDraftIds = new Set(plan.drafts.map((draft) => draft.draftId));
  const affectedDrafts = drafts.filter((draft) => affectedDraftIds.has(draft.id));
  const snapshotPath = await dependencies.writeSnapshot(
    { createdAt: new Date().toISOString(), drafts: affectedDrafts },
    options.snapshotDir ?? 'valuation-backfill-snapshots',
  );
  const appliedDrafts: BudgetValueDraftPlan[] = [];

  for (const draftPlan of plan.drafts) {
    const projectionResult = await prisma.$transaction(
      async (tx) => {
        for (const update of draftPlan.playerUpdates) {
          await tx.player.update({
            where: { id: update.id },
            data: { budget: update.budget, ceiling: update.ceiling, floor: update.floor },
          });
        }
        return dependencies.applyProjections(tx, {
          draftId: draftPlan.draftId,
          mode: 'transaction',
        });
      },
      { timeout: 60_000 },
    );

    const activeValues = await prisma.draftPlayerValue.aggregate({
      where: {
        draftId: draftPlan.draftId,
        valueSetId: projectionResult.valueSetId,
      },
      _sum: { activeAuctionValue: true },
    });
    appliedDrafts.push({
      ...draftPlan,
      afterActiveTotal: activeValues._sum.activeAuctionValue ?? 0,
    });
    try {
      await dependencies.pruneProjectionRows(prisma, draftPlan.draftId);
    } catch (error) {
      console.error(`Failed to prune projection value rows for draft ${draftPlan.draftId}`, error);
    }
  }

  return { drafts: appliedDrafts, mode: 'applied', snapshotPath };
}

function planDraftBackfill(draft: BudgetValueBackfillDraft): BudgetValueDraftPlan {
  const adjusted = adjustPlayerValues(draft.players.map(toSourcePlayer), {
    startingLineup: toStartingLineup(draft.startingLineup),
    scoringSettings: toScoringSettings(draft.scoringSettings),
    teamCount: draft.teamCount,
    sourceBudget: draft.playerValueSourceBudget,
    draftBudget: draft.budget,
  });
  const proposedPlayerValues = adjusted.map((player) => ({
    id: requirePlayerId(player),
    budget: player.budget,
    ceiling: player.ceiling,
    floor: player.floor,
  }));
  const currentPlayersById = new Map(draft.players.map((player) => [player.id, player]));
  const playerUpdates = proposedPlayerValues.filter((proposed) => {
    const current = currentPlayersById.get(proposed.id);
    return (
      current === undefined ||
      current.budget !== proposed.budget ||
      current.ceiling !== proposed.ceiling ||
      current.floor !== proposed.floor
    );
  });
  const proposedPlayersById = new Map(proposedPlayerValues.map((player) => [player.id, player]));
  const activePlayerValues = draft.activeProjectionValueSetId
    ? draft.playerValues.filter((value) => value.valueSetId === draft.activeProjectionValueSetId)
    : [];

  return {
    draftId: draft.id,
    draftName: draft.name,
    changedPlayerCount: playerUpdates.length,
    beforeFallbackTotal: sum(draft.players.map((player) => player.budget)),
    afterFallbackTotal: sum(proposedPlayerValues.map((player) => player.budget)),
    beforeActiveTotal: sum(activePlayerValues.map((value) => value.activeAuctionValue)),
    afterActiveTotal: sum(
      activePlayerValues.map((value) => {
        if (value.fallbackAuctionValue <= 0) {
          throw new Error(
            `Draft ${draft.id}: projection value ${value.id} has a nonpositive fallback auction value`,
          );
        }
        const proposedFallback = proposedPlayersById.get(value.playerId);
        if (!proposedFallback) {
          throw new Error(
            `Draft ${draft.id}: projection value ${value.id} references missing player ${value.playerId}`,
          );
        }
        return scaleWholeDollar(
          value.activeAuctionValue,
          proposedFallback.budget / value.fallbackAuctionValue,
          0,
        );
      }),
    ),
    playerUpdates,
  };
}

function validatePersistedDraftBudgets(draft: BudgetValueBackfillDraft): void {
  try {
    getBudgetScale(draft.playerValueSourceBudget, draft.budget);
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Draft ${draft.id}: ${error.message}`);
    }
    throw error;
  }
}

function toSourcePlayer(player: BudgetValueBackfillPlayer): Player {
  return {
    id: player.id,
    player: player.name,
    team: player.nflTeam,
    pos: player.pos as Position,
    age: player.age,
    sfRank: player.sfRank,
    budget: player.baseBudget,
    ceiling: player.baseCeiling,
    floor: player.baseFloor,
    notes: player.notes,
    sleeperId: player.sleeperId,
    customKey: player.customKey,
    futurePickYear: player.futurePickYear,
    futurePickRound: player.futurePickRound,
    futurePickOriginHandle: player.futurePickOriginHandle,
    futurePickAssetKind: toFuturePickAssetKind(player.futurePickAssetKind, player.id),
  };
}

function toFuturePickAssetKind(value: string | null, playerId: number): FuturePickAssetKind | null {
  if (value === 'pick' || value === 'package' || value === null) return value;
  throw new Error(`Invalid future pick asset kind for player ${playerId}: ${value}`);
}

function toStartingLineup(value: unknown): StartingSlot[] {
  if (!Array.isArray(value)) return [...DEFAULT_STARTING_LINEUP];
  const slots = value.filter(isStartingSlot);
  return slots.length > 0 ? slots : [...DEFAULT_STARTING_LINEUP];
}

function isStartingSlot(value: unknown): value is StartingSlot {
  return (
    value === 'QB' ||
    value === 'RB' ||
    value === 'WR' ||
    value === 'TE' ||
    value === 'FLEX' ||
    value === 'SUPER_FLEX'
  );
}

function toScoringSettings(value: unknown): ScoringSettings {
  if (value === null || typeof value !== 'object') return { ...DEFAULT_SCORING_SETTINGS };
  return { ...DEFAULT_SCORING_SETTINGS, ...(value as Partial<ScoringSettings>) };
}

function requirePlayerId(player: Player): number {
  if (player.id === undefined)
    throw new Error(`Adjusted player ${player.player} is missing its ID`);
  return player.id;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
