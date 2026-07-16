import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import {
  DraftMutationFailure,
  isPositiveSafeInteger,
  withActiveOwnedDraftMutation,
  type DraftMutationCode,
} from '@/lib/draftMutation';

interface PlayerMutationBody {
  playerId?: unknown;
}

function failureResponse(code: DraftMutationCode): NextResponse {
  const status =
    code === 'INVALID_INPUT'
      ? 400
      : code === 'NOT_FOUND' || code === 'PLAYER_NOT_FOUND'
        ? 404
        : code === 'DRAFT_COMPLETE' || code === 'PLAYER_ALREADY_CLAIMED'
          ? 409
          : 500;
  return NextResponse.json({ ok: false, code }, { status });
}

async function mutationInput(
  request: NextRequest,
  params: Promise<{ draftId: string }>,
): Promise<{ draftId: number; playerId: number } | null> {
  const draftId = Number((await params).draftId);
  let body: PlayerMutationBody;
  try {
    body = (await request.json()) as PlayerMutationBody;
  } catch {
    return null;
  }
  if (!isPositiveSafeInteger(draftId) || !isPositiveSafeInteger(body.playerId)) return null;
  return { draftId, playerId: body.playerId };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ draftId: string }> },
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const input = await mutationInput(request, params);
  if (!input) return failureResponse('INVALID_INPUT');

  const result = await withActiveOwnedDraftMutation(
    session.user.id,
    input.draftId,
    async (tx, draft) => {
      const [player, existingResult] = await Promise.all([
        tx.player.findFirst({
          where: { id: input.playerId, draftId: draft.id },
          select: { id: true, name: true },
        }),
        tx.auctionResult.findFirst({
          where: { playerId: input.playerId, draftId: draft.id },
          select: { id: true },
        }),
      ]);
      if (!player) throw new DraftMutationFailure('PLAYER_NOT_FOUND');
      if (existingResult) throw new DraftMutationFailure('PLAYER_ALREADY_CLAIMED');

      return tx.playerWatchlist.upsert({
        where: { playerId_draftId: { playerId: player.id, draftId: draft.id } },
        create: { playerId: player.id, playerName: player.name, draftId: draft.id },
        update: { playerName: player.name },
      });
    },
  );
  if (!result.ok) return failureResponse(result.code);
  return NextResponse.json({
    playerId: result.data.playerId,
    playerName: result.data.playerName,
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ draftId: string }> },
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const input = await mutationInput(request, params);
  if (!input) return failureResponse('INVALID_INPUT');

  const result = await withActiveOwnedDraftMutation(
    session.user.id,
    input.draftId,
    async (tx, draft) => {
      await tx.playerWatchlist.deleteMany({
        where: { playerId: input.playerId, draftId: draft.id },
      });
      return null;
    },
  );
  if (!result.ok) return failureResponse(result.code);
  return NextResponse.json({ ok: true });
}
