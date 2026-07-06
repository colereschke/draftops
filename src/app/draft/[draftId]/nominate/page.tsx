import { notFound } from 'next/navigation';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { getDraft } from '@/lib/draft';
import NominationHelper from '@/components/NominationHelper';
import type { Player, Position } from '@/types';

export const metadata = { title: 'Nominate — DraftOps' };

export default async function NominatePage({ params }: { params: Promise<{ draftId: string }> }) {
  const draftId = parseInt((await params).draftId, 10);
  const session = await auth();
  if (!session) notFound();
  const draft = await getDraft(session.user.id, draftId);
  if (!draft) notFound();

  const dbPlayers = await prisma.player.findMany({
    where: { draftId },
    orderBy: { sfRank: 'asc' },
  });

  const players: Player[] = dbPlayers.map((p) => ({
    player: p.name,
    team: p.nflTeam,
    pos: p.pos as Position,
    age: p.age,
    sfRank: p.sfRank,
    budget: p.budget,
    ceiling: p.ceiling,
    floor: p.floor,
    notes: p.notes,
    sleeperId: p.sleeperId,
    projectedPoints: p.projectedPoints,
    replacementPoints: p.replacementPoints,
    vor: p.vor,
    projectionAuctionValue: p.projectionAuctionValue,
    fallbackAuctionValue: p.fallbackAuctionValue,
    activeAuctionValue: p.activeAuctionValue,
    valueSource: p.valueSource as Player['valueSource'],
    projectionSource: p.projectionSource,
    projectionDate: p.projectionDate,
    projectionSeason: p.projectionSeason,
  }));

  return <NominationHelper draftId={draftId} players={players} />;
}
