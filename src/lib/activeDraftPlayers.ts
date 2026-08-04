import { getPrisma } from '@/lib/db';
import { applyDynamicPickValues } from '@/lib/dynamicPickValues';
import { filterFuturePickAssetsForMode } from '@/lib/futurePickAssets';
import { mapPlayersWithDraftValues } from '@/lib/playerValueMapping';
import { resolveAllPickHolders, type ResolvedPick, type TeamIdentity } from '@/lib/pickOwnership';
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
  preFetchedTeams?: TeamIdentity[] | Promise<TeamIdentity[]>;
  preResolvedPicks?: ResolvedPick[] | Promise<ResolvedPick[]>;
}

export async function getActiveDraftPlayers({
  draftId,
  startingLineup,
  futurePickAuctionMode,
  bids,
  preFetchedTeams,
  preResolvedPicks,
}: GetActiveDraftPlayersInput): Promise<Player[]> {
  // Shared with resolveAllPickHolders below (via the same in-flight promise) so the team list is
  // only fetched once, not twice, on this 20s-polled read path.
  const teamsPromise = Promise.resolve(
    preFetchedTeams ??
      getPrisma().team.findMany({
        where: { draftId },
        select: { id: true, handle: true },
      }),
  );
  const resolvedPicksPromise = Promise.resolve(
    preResolvedPicks ?? resolveAllPickHolders(getPrisma(), draftId, teamsPromise),
  );

  const [players, draft, teams, resolvedPicks] = await Promise.all([
    getPrisma().player.findMany({ where: { draftId }, orderBy: { sfRank: 'asc' } }),
    getPrisma().draft.findUnique({
      where: { id: draftId },
      select: { activeProjectionValueSetId: true, playerValueSourceBudget: true, budget: true },
    }),
    teamsPromise,
    resolvedPicksPromise,
  ]);

  // Derived from the already-fetched `players` batch (same draftId-scoped query the removed
  // player.aggregate would have reissued) instead of a second query.
  const futurePickYears = players
    .map((player) => player.futurePickYear)
    .filter((year): year is number => year !== null);
  const generatedPickYear = futurePickYears.length > 0 ? Math.max(...futurePickYears) : null;

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
    // inside computeFutureCapitalByHandle) are hardcoded constants always denominated in the
    // $1,000 source economy — tracing generateFuturePickAssets -> adjustPlayerValues in
    // src/lib/actions.ts, the sourceBudget factor introduced when scaling PACKAGE_BASELINE into
    // the draft's ranking-source economy cancels against adjustPlayerValues' later division by
    // that same sourceBudget, so the stored Player.budget for a generated package row is
    // `109 * draftBudget / 1000`, not `109 * draftBudget / playerValueSourceBudget`. The fallback
    // scale here must therefore be a plain draft-budget scale against the $1,000 constant economy
    // (DEFAULT_RANKING_SOURCE_BUDGET), not scaled against the draft's own ranking-source budget.
    // This is currently unreachable under any real data: every ranking source in this codebase is
    // $1,000-denominated today, so the two formulas agree everywhere, and the fallback branch
    // itself only runs when generated-year Player rows are missing for an origin — which is why
    // this wasn't caught by existing tests.
    fallbackScale: getBudgetScale(
      DEFAULT_RANKING_SOURCE_BUDGET,
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
