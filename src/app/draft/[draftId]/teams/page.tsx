import { notFound } from 'next/navigation';
import { auth } from '@/auth';
import { getPrisma } from '@/lib/db';
import { getDraft } from '@/lib/draft';
import { getActiveDraftPlayers } from '@/lib/activeDraftPlayers';
import { computeDraftTeamStats } from '@/lib/computeDraftTeamStats';
import { computeTendencies } from '@/lib/tendencies';
import { getTradeBudgetDeltaByTeamId } from '@/lib/tradeBudget';
import { getTradeablePicksForAllTeams } from '@/lib/tradePicker';
import RosterTracker from '@/components/RosterTracker';
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
  const { generatedPickYear, tradeablePicksByTeamId } = await getTradeablePicksForAllTeams(
    getPrisma(),
    draftId,
  );

  return (
    <RosterTracker
      teams={teams}
      tendencies={tendencies}
      ownerHandle={draft.ownerTeam?.handle ?? null}
      startingLineup={startingLineup}
      draftId={draftId}
      tradeTeams={rawTeams.map(({ id, handle, displayName }) => ({ id, handle, displayName }))}
      generatedPickYear={generatedPickYear}
      tradeablePicksByTeamId={tradeablePicksByTeamId}
      isReadOnly={draft.status === 'COMPLETE'}
    />
  );
}
