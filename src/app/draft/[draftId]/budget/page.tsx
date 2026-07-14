import { notFound } from 'next/navigation';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { getDraft } from '@/lib/draft';
import { computeTeamStats } from '@/lib/budget';
import { computeTendencies } from '@/lib/tendencies';
import { resolveLiveNomination } from '@/lib/liveNomination';
import BudgetPressureView from '@/components/BudgetPressure';

export const dynamic = 'force-dynamic';

export default async function BudgetPage({ params }: { params: Promise<{ draftId: string }> }) {
  const draftId = parseInt((await params).draftId, 10);
  const session = await auth();
  if (!session) notFound();
  const draft = await getDraft(session.user.id, draftId);
  if (!draft) notFound();

  const [teams, dbPlayers, nominated] = await Promise.all([
    prisma.team.findMany({ where: { draftId }, include: { results: true } }),
    prisma.player.findMany({
      where: { draftId },
      select: { id: true, name: true, pos: true, budget: true },
    }),
    prisma.nominatedPlayer.findMany({ where: { draftId }, orderBy: { createdAt: 'desc' } }),
  ]);

  const players = dbPlayers.map((p) => ({ player: p.name, budget: p.budget }));
  const posByName = new Map(dbPlayers.map((p) => [p.name, p.pos]));
  const posByPlayerId = new Map(dbPlayers.map((p) => [p.id, p.pos]));

  // Anchor the board to the most heavily nominated position (ties → most recent).
  const live = resolveLiveNomination(nominated, posByName, posByPlayerId);

  const tendencies = computeTendencies(teams, players);

  return (
    <BudgetPressureView
      teams={computeTeamStats(teams, draft.rosterSize)}
      tendencies={tendencies}
      livePosition={live?.position ?? null}
      liveName={live?.name ?? null}
      ownerHandle={draft.ownerTeam?.handle ?? null}
    />
  );
}
