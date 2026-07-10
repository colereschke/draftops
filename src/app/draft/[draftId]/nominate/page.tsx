import { notFound } from 'next/navigation';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { getDraft } from '@/lib/draft';
import NominationHelper from '@/components/NominationHelper';
import type { Player, Position } from '@/types';
import { filterFuturePickAssetsForMode, fromPrismaFuturePickMode } from '@/lib/futurePickAssets';

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

  const players: Player[] = filterFuturePickAssetsForMode(
    dbPlayers.map((p) => ({
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
      futurePickYear: p.futurePickYear,
      futurePickRound: p.futurePickRound,
      futurePickOriginHandle: p.futurePickOriginHandle,
      futurePickAssetKind:
        p.futurePickAssetKind === 'package' || p.futurePickAssetKind === 'pick'
          ? p.futurePickAssetKind
          : null,
    })),
    fromPrismaFuturePickMode(draft.futurePickAuctionMode),
  );

  return <NominationHelper draftId={draftId} players={players} />;
}
