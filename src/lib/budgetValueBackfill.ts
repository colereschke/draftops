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
  players: BudgetValueBackfillPlayer[];
  playerValues: BudgetValueBackfillPlayerValue[];
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
    await prisma.$transaction(
      async (tx) => {
        for (const update of draftPlan.playerUpdates) {
          await tx.player.update({
            where: { id: update.id },
            data: { budget: update.budget, ceiling: update.ceiling, floor: update.floor },
          });
        }
        await dependencies.applyProjections(tx, {
          draftId: draftPlan.draftId,
          useBatchTransaction: false,
        });
      },
      { timeout: 60_000 },
    );

    const activeValues = await prisma.draftPlayerValue.aggregate({
      where: { draftId: draftPlan.draftId },
      _sum: { activeAuctionValue: true },
    });
    appliedDrafts.push({
      ...draftPlan,
      afterActiveTotal: activeValues._sum.activeAuctionValue ?? 0,
    });
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
  const playerUpdates = adjusted.map((player) => ({
    id: requirePlayerId(player),
    budget: player.budget,
    ceiling: player.ceiling,
    floor: player.floor,
  }));
  const budgetScale = getBudgetScale(draft.playerValueSourceBudget, draft.budget);

  return {
    draftId: draft.id,
    draftName: draft.name,
    changedPlayerCount: playerUpdates.length,
    beforeFallbackTotal: sum(draft.players.map((player) => player.budget)),
    afterFallbackTotal: sum(playerUpdates.map((player) => player.budget)),
    beforeActiveTotal: sum(draft.playerValues.map((value) => value.activeAuctionValue)),
    afterActiveTotal: sum(
      draft.playerValues.map((value) => scaleWholeDollar(value.activeAuctionValue, budgetScale)),
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
