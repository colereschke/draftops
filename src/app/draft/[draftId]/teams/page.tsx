import { notFound } from 'next/navigation';
import { auth } from '@/auth';
import { getPrisma } from '@/lib/db';
import { getDraft } from '@/lib/draft';
import { getActiveDraftPlayers } from '@/lib/activeDraftPlayers';
import { computeDraftTeamStats } from '@/lib/computeDraftTeamStats';
import { computeTendencies } from '@/lib/tendencies';
import { getTradeBudgetDeltaByTeamId } from '@/lib/tradeBudget';
import { buildTradeablePicksForAllTeams } from '@/lib/tradePicker';
import type { CurrentPickHolding } from '@/lib/pickOwnership';
import {
  buildCurrentPickHoldings,
  getGeneratedPickYear,
  resolveAllPickHolders,
} from '@/lib/pickOwnership';
import RosterTracker from '@/components/RosterTracker';
import TradeHistoryList, { type TradeHistoryEntry } from '@/components/TradeHistory';
import { fromPrismaFuturePickMode } from '@/lib/futurePickAssets';
import { toStartingLineup } from '@/lib/startingLineup';

export const dynamic = 'force-dynamic';

export default async function TeamsPage({ params }: { params: Promise<{ draftId: string }> }) {
  const draftId = parseInt((await params).draftId, 10);
  const session = await auth();
  if (!session) notFound();
  const draft = await getDraft(session.user.id, draftId);
  if (!draft) notFound();

  const rawTeams = await getPrisma().team.findMany({
    where: { draftId },
    include: { results: { where: { deletedAt: null } } },
    orderBy: { handle: 'asc' },
  });
  const resolvedPicksPromise = resolveAllPickHolders(
    getPrisma(),
    draftId,
    rawTeams.map(({ id, handle }) => ({ id, handle })),
  );

  const bids = rawTeams.flatMap((team) =>
    team.results.map((result) => ({
      player: result.player,
      price: result.price,
      teamHandle: team.handle,
    })),
  );
  const startingLineup = toStartingLineup(draft.startingLineup);

  const players = await getActiveDraftPlayers({
    draftId,
    bids,
    startingLineup,
    futurePickAuctionMode: fromPrismaFuturePickMode(draft.futurePickAuctionMode),
    preFetchedTeams: rawTeams,
    preResolvedPicks: resolvedPicksPromise,
  });

  const tendencies = computeTendencies(rawTeams, players);
  const budgetDeltaByTeamId = await getTradeBudgetDeltaByTeamId(getPrisma(), draftId);
  const teams = computeDraftTeamStats({
    teams: rawTeams,
    players,
    rosterSize: draft.rosterSize,
    budgetDeltaByTeamId,
  });

  // Batch loader — resolves the generated-pick year and every team's tradeable picks in one
  // pass. A per-team getTradeablePicksForTeam loop would re-run resolveAllPickHolders once
  // per team (an N+1 across 12 teams).
  const [generatedPickYear, resolvedPicks] = await Promise.all([
    getGeneratedPickYear(getPrisma(), draftId),
    resolvedPicksPromise,
  ]);
  const tradeablePicksByTeamId = buildTradeablePicksForAllTeams(
    rawTeams,
    generatedPickYear,
    resolvedPicks,
  );
  const pickHoldingsByTeamId: Record<number, CurrentPickHolding[]> = Object.fromEntries(
    rawTeams.map((team) => [team.id, []]),
  );
  for (const holding of buildCurrentPickHoldings(rawTeams, generatedPickYear, resolvedPicks)) {
    pickHoldingsByTeamId[holding.holderTeamId]?.push(holding);
  }

  // Deleted trades are included deliberately — the list is where a soft-deleted trade is
  // restored from, inside its 30-minute window. `id` breaks createdAt ties so the order is
  // stable across refreshes.
  const rawTrades = await getPrisma().trade.findMany({
    where: { draftId },
    select: {
      id: true,
      budgetAmount: true,
      createdAt: true,
      deletedAt: true,
      budgetTeam: { select: { handle: true } },
      pickTeam: { select: { handle: true } },
      pickAssets: {
        select: {
          futurePickYear: true,
          futurePickRound: true,
          originTeam: { select: { handle: true } },
        },
      },
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });
  const tradeHistory: TradeHistoryEntry[] = rawTrades.map((trade) => ({
    id: trade.id,
    budgetTeamHandle: trade.budgetTeam.handle,
    pickTeamHandle: trade.pickTeam.handle,
    budgetAmount: trade.budgetAmount,
    picks: trade.pickAssets.map((asset) => ({
      originHandle: asset.originTeam.handle,
      futurePickYear: asset.futurePickYear,
      futurePickRound: asset.futurePickRound as 1 | 2 | 3,
    })),
    createdAt: trade.createdAt.toISOString(),
    deletedAt: trade.deletedAt?.toISOString() ?? null,
  }));

  return (
    <>
      <RosterTracker
        teams={teams}
        tendencies={tendencies}
        ownerHandle={draft.ownerTeam?.handle ?? null}
        startingLineup={startingLineup}
        draftId={draftId}
        tradeTeams={rawTeams.map(({ id, handle, displayName }) => ({ id, handle, displayName }))}
        generatedPickYear={generatedPickYear}
        tradeablePicksByTeamId={tradeablePicksByTeamId}
        pickHoldingsByTeamId={pickHoldingsByTeamId}
        isReadOnly={draft.status === 'COMPLETE'}
      />
      <TradeHistoryList
        draftId={draftId}
        trades={tradeHistory}
        isReadOnly={draft.status === 'COMPLETE'}
      />
    </>
  );
}
