import { getPrisma } from '@/lib/db';
import { applyDynamicPickValues } from '@/lib/dynamicPickValues';
import { filterFuturePickAssetsForMode } from '@/lib/futurePickAssets';
import { mapPlayersWithDraftValues } from '@/lib/playerValueMapping';
import { getGeneratedPickYear, resolveAllPickHolders } from '@/lib/pickOwnership';
import { computeFutureCapitalByHandle, loadGeneratedYearBaselines } from '@/lib/pickCapital';
import { DEFAULT_RANKING_SOURCE_BUDGET, getBudgetScale } from '@/lib/valuationBudget';
import type { FuturePickAuctionMode, Player, StartingSlot } from '@/types';

export interface ActiveValueBidInput {
  player: string;
  price: number;
  teamHandle: string;
}

export interface GetActiveDraftPlayersInput {
  draftId: number;
  startingLineup: StartingSlot[];
  futurePickAuctionMode: FuturePickAuctionMode;
  bids: ActiveValueBidInput[];
}

export async function getActiveDraftPlayers({
  draftId,
  startingLineup,
  futurePickAuctionMode,
  bids,
}: GetActiveDraftPlayersInput): Promise<Player[]> {
  const [players, draft, teams, generatedPickYear, resolvedPicks] = await Promise.all([
    getPrisma().player.findMany({ where: { draftId }, orderBy: { sfRank: 'asc' } }),
    getPrisma().draft.findUnique({
      where: { id: draftId },
      select: { activeProjectionValueSetId: true, playerValueSourceBudget: true, budget: true },
    }),
    getPrisma().team.findMany({ where: { draftId }, select: { id: true, handle: true } }),
    getGeneratedPickYear(getPrisma(), draftId),
    resolveAllPickHolders(getPrisma(), draftId),
  ]);

  const [draftValues, baselines] = await Promise.all([
    draft?.activeProjectionValueSetId
      ? getPrisma().draftPlayerValue.findMany({
          where: { draftId, valueSetId: draft.activeProjectionValueSetId },
          select: {
            playerId: true,
            projectedPoints: true,
            replacementPoints: true,
            vor: true,
            projectionAuctionValue: true,
            fallbackAuctionValue: true,
            activeAuctionValue: true,
            valueSource: true,
          },
        })
      : Promise.resolve([]),
    // Skip the query entirely, not just short-circuit its result, whenever there's nothing for
    // `computeFutureCapitalByHandle` to look baselines up for — it only consults `baselines` for
    // origins present in `resolvedPicks` (grouped), and `resolvedPicks` is empty on the
    // overwhelmingly common "no trades or PKG/PICK wins yet" path. This route
    // (`getActiveDraftPlayers`) backs the polling `nomination-data` route (HARD-017 already trimmed
    // that path once), so avoiding an unconditional extra query here on every poll matters.
    generatedPickYear === null || resolvedPicks.length === 0
      ? Promise.resolve({
          packageBaselineByOrigin: new Map<number, number>(),
          roundBaselineByOriginRound: new Map<string, number>(),
        })
      : loadGeneratedYearBaselines(getPrisma(), draftId, generatedPickYear, teams),
  ]);

  const futureCapitalByHandle = computeFutureCapitalByHandle({
    resolvedPicks,
    teamHandleById: new Map(teams.map((team) => [team.id, team.handle])),
    baselines,
    // PACKAGE_BASELINE/ROUND_BASELINES (used only in the no-generated-year-data fallback branch
    // inside computeFutureCapitalByHandle) are denominated in the $1,000 ranking-source economy,
    // same as PKG_VALUES — matching CLAUDE.md's documented fallback-value scaling formula
    // (`Draft.budget / Draft.playerValueSourceBudget`), not `DEFAULT_RANKING_SOURCE_BUDGET`, which
    // is only the *default* source budget when a draft doesn't record its own.
    fallbackScale: getBudgetScale(
      draft?.playerValueSourceBudget ?? DEFAULT_RANKING_SOURCE_BUDGET,
      draft?.budget ?? DEFAULT_RANKING_SOURCE_BUDGET,
    ),
  });

  const dynamicPlayers = applyDynamicPickValues({
    players: mapPlayersWithDraftValues(players, draftValues),
    bids,
    startingLineup,
    futureCapitalByHandle,
  });

  return filterFuturePickAssetsForMode(dynamicPlayers, futurePickAuctionMode);
}
