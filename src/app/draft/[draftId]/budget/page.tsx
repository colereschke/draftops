import { notFound } from 'next/navigation';
import { auth } from '@/auth';
import { getPrisma } from '@/lib/db';
import { getDraft } from '@/lib/draft';
import { getActiveDraftPlayers } from '@/lib/activeDraftPlayers';
import { computeDraftTeamStats } from '@/lib/computeDraftTeamStats';
import { computeTendencies } from '@/lib/tendencies';
import { resolveLiveNomination } from '@/lib/liveNomination';
import BudgetPressureView from '@/components/BudgetPressure';
import { fromPrismaFuturePickMode } from '@/lib/futurePickAssets';
import { toStartingLineup } from '@/lib/startingLineup';

export const dynamic = 'force-dynamic';

export default async function BudgetPage({ params }: { params: Promise<{ draftId: string }> }) {
  const draftId = parseInt((await params).draftId, 10);
  const session = await auth();
  if (!session) notFound();
  const draft = await getDraft(session.user.id, draftId);
  if (!draft) notFound();

  const [teams, nominated] = await Promise.all([
    getPrisma().team.findMany({
      where: { draftId },
      include: { results: { where: { deletedAt: null } } },
    }),
    getPrisma().nominatedPlayer.findMany({ where: { draftId }, orderBy: { createdAt: 'desc' } }),
  ]);

  const bids = teams.flatMap((team) =>
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
  const posByPlayerId = new Map(
    players.flatMap((player) =>
      player.id === undefined ? [] : [[player.id, player.pos] as const],
    ),
  );

  // Anchor the board to the most heavily nominated position (ties → most recent).
  const live = resolveLiveNomination(nominated, posByPlayerId);

  const tendencies = computeTendencies(teams, players);
  const teamStats = computeDraftTeamStats({
    teams,
    players,
    rosterSize: draft.rosterSize,
  });

  return (
    <BudgetPressureView
      teams={teamStats}
      tendencies={tendencies}
      livePosition={live?.position ?? null}
      liveName={live?.name ?? null}
      ownerHandle={draft.ownerTeam?.handle ?? null}
      budget={draft.budget}
      startingLineup={startingLineup}
    />
  );
}
