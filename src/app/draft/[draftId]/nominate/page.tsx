import { notFound } from 'next/navigation';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { getDraft } from '@/lib/draft';
import NominationHelper from '@/components/NominationHelper';
import { DEFAULT_STARTING_LINEUP, type StartingSlot } from '@/types';
import { getActiveDraftPlayers } from '@/lib/activeDraftPlayers';
import { fromPrismaFuturePickMode } from '@/lib/futurePickAssets';

export const metadata = { title: 'Nominate — DraftOps' };

export default async function NominatePage({ params }: { params: Promise<{ draftId: string }> }) {
  const draftId = parseInt((await params).draftId, 10);
  const session = await auth();
  if (!session) notFound();
  const draft = await getDraft(session.user.id, draftId);
  if (!draft) notFound();

  const rawBids = await prisma.auctionResult.findMany({
    where: { draftId },
    select: {
      player: true,
      price: true,
      team: { select: { handle: true } },
    },
  });

  const players = await getActiveDraftPlayers({
    draftId,
    bids: rawBids.map((bid) => ({
      player: bid.player,
      price: bid.price,
      teamHandle: bid.team.handle,
    })),
    startingLineup: (draft.startingLineup ?? DEFAULT_STARTING_LINEUP) as StartingSlot[],
    futurePickAuctionMode: fromPrismaFuturePickMode(draft.futurePickAuctionMode),
  });

  return (
    <NominationHelper
      draftId={draftId}
      players={players}
      isReadOnly={draft.status === 'COMPLETE'}
    />
  );
}
