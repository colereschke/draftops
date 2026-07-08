import { notFound } from 'next/navigation';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { getDraft } from '@/lib/draft';
import { computeTeamStats } from '@/lib/budget';
import { computeTendencies } from '@/lib/tendencies';
import type { AppetitePos } from '@/lib/tendencies.constants';
import BudgetPressureView from '@/components/BudgetPressure';

export const dynamic = 'force-dynamic';

const APPETITE_SET = new Set<string>(['QB', 'RB', 'WR', 'TE']);

export default async function BudgetPage({ params }: { params: Promise<{ draftId: string }> }) {
  const draftId = parseInt((await params).draftId, 10);
  const session = await auth();
  if (!session) notFound();
  const draft = await getDraft(session.user.id, draftId);
  if (!draft) notFound();

  const [teams, dbPlayers, nominated] = await Promise.all([
    prisma.team.findMany({ where: { draftId }, include: { results: true } }),
    prisma.player.findMany({ where: { draftId }, select: { name: true, pos: true, budget: true } }),
    prisma.nominatedPlayer.findMany({ where: { draftId }, orderBy: { createdAt: 'desc' } }),
  ]);

  const players = dbPlayers.map((p) => ({ player: p.name, budget: p.budget }));
  const posByName = new Map(dbPlayers.map((p) => [p.name, p.pos]));

  // Most recently nominated player whose position is one of the four board positions.
  let livePosition: AppetitePos | null = null;
  let liveName: string | null = null;
  for (const n of nominated) {
    const pos = posByName.get(n.playerName);
    if (pos && APPETITE_SET.has(pos)) {
      livePosition = pos as AppetitePos;
      liveName = n.playerName;
      break;
    }
  }

  const tendencies = computeTendencies(teams, players);

  return (
    <BudgetPressureView
      teams={computeTeamStats(teams, draft.rosterSize)}
      tendencies={tendencies}
      livePosition={livePosition}
      liveName={liveName}
      ownerHandle={draft.ownerTeam?.handle ?? null}
    />
  );
}
