import { getPrisma } from '@/lib/db';
import { applyDynamicPickValues } from '@/lib/dynamicPickValues';
import { filterFuturePickAssetsForMode } from '@/lib/futurePickAssets';
import { mapPlayersWithDraftValues } from '@/lib/playerValueMapping';
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
}

export async function getActiveDraftPlayers({
  draftId,
  startingLineup,
  futurePickAuctionMode,
  bids,
}: GetActiveDraftPlayersInput): Promise<Player[]> {
  const [players, draft] = await Promise.all([
    getPrisma().player.findMany({ where: { draftId }, orderBy: { sfRank: 'asc' } }),
    getPrisma().draft.findUnique({
      where: { id: draftId },
      select: { activeProjectionValueSetId: true },
    }),
  ]);
  const draftValues = draft?.activeProjectionValueSetId
    ? await getPrisma().draftPlayerValue.findMany({
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
    : [];

  const dynamicPlayers = applyDynamicPickValues({
    players: mapPlayersWithDraftValues(players, draftValues),
    bids,
    startingLineup,
  });

  return filterFuturePickAssetsForMode(dynamicPlayers, futurePickAuctionMode);
}
