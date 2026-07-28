import { PrismaClient } from '@prisma/client';
import { LEAGUE_TEAMS } from '../src/lib/teams';

export async function seedDefaultDraft(
  prisma: PrismaClient,
  ownerDiscordId?: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    let draft = await tx.draft.findFirst({ where: { name: "Cole's Draft 2025" } });
    if (!draft) {
      draft = await tx.draft.create({
        data: {
          name: "Cole's Draft 2025",
          ownerId: ownerDiscordId ?? null,
          ownerTeamId: null,
        },
      });
    }

    await Promise.all(
      LEAGUE_TEAMS.map((team) =>
        tx.team.upsert({
          where: { handle_draftId: { handle: team.handle, draftId: draft.id } },
          update: {},
          create: {
            handle: team.handle,
            displayName: team.displayName,
            budget: 1000,
            draftId: draft.id,
          },
        }),
      ),
    );

    if (!draft.ownerTeamId) {
      const ownerTeam = await tx.team.findFirst({
        where: { handle: 'coreschke', draftId: draft.id },
      });
      if (ownerTeam) {
        await tx.draft.update({
          where: { id: draft.id },
          data: { ownerTeamId: ownerTeam.id },
        });
      }
    }
  });
}
