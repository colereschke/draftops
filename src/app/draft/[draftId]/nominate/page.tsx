import { notFound } from 'next/navigation';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { getDraft } from '@/lib/draft';
import NominationHelper from '@/components/NominationHelper';
import { DEFAULT_STARTING_LINEUP, type StartingSlot } from '@/types';
import { applyDynamicPickValues } from '@/lib/dynamicPickValues';
import { filterFuturePickAssetsForMode, fromPrismaFuturePickMode } from '@/lib/futurePickAssets';
import { mapPlayersWithDraftValues } from '@/lib/playerValueMapping';

export const metadata = { title: 'Nominate — DraftOps' };

export default async function NominatePage({ params }: { params: Promise<{ draftId: string }> }) {
  const draftId = parseInt((await params).draftId, 10);
  const session = await auth();
  if (!session) notFound();
  const draft = await getDraft(session.user.id, draftId);
  if (!draft) notFound();

  const [rawBids, dbPlayers, draftValues] = await Promise.all([
    prisma.auctionResult.findMany({
      where: { draftId },
      select: {
        player: true,
        price: true,
        team: { select: { handle: true } },
      },
    }),
    prisma.player.findMany({ where: { draftId }, orderBy: { sfRank: 'asc' } }),
    prisma.draftPlayerValue.findMany({
      where: { draftId },
      select: {
        playerId: true,
        projectionSourceId: true,
        projectedPoints: true,
        replacementPoints: true,
        vor: true,
        projectionAuctionValue: true,
        fallbackAuctionValue: true,
        activeAuctionValue: true,
        valueSource: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
    }),
  ]);

  const players = filterFuturePickAssetsForMode(
    applyDynamicPickValues({
      players: mapPlayersWithDraftValues(dbPlayers, draftValues),
      bids: rawBids.map((bid) => ({
        player: bid.player,
        price: bid.price,
        teamHandle: bid.team.handle,
      })),
      startingLineup: (draft.startingLineup ?? DEFAULT_STARTING_LINEUP) as StartingSlot[],
    }),
    fromPrismaFuturePickMode(draft.futurePickAuctionMode),
  );

  return (
    <NominationHelper
      draftId={draftId}
      players={players}
      isReadOnly={draft.status === 'COMPLETE'}
    />
  );
}
