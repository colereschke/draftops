import { config as dotenvConfig } from 'dotenv';
dotenvConfig({ path: '.env.local' });

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

// PrismaClient type used by both the script and tests
type PrismaLike = {
  draft: {
    create: (args: {
      data: { name: string; ownerId: string | null; ownerTeamId: null };
    }) => Promise<{ id: number }>;
    update: (args: { where: { id: number }; data: { ownerTeamId: number } }) => Promise<unknown>;
  };
  team: {
    findFirst: (args: { where: { handle: string } }) => Promise<{ id: number } | null>;
    updateMany: (args: {
      where: { draftId: null };
      data: { draftId: number };
    }) => Promise<{ count: number }>;
  };
  auctionResult: {
    updateMany: (args: {
      where: { draftId: null };
      data: { draftId: number };
    }) => Promise<{ count: number }>;
  };
  playerWatchlist: {
    updateMany: (args: {
      where: { draftId: null };
      data: { draftId: number };
    }) => Promise<{ count: number }>;
  };
  nominatedPlayer: {
    updateMany: (args: {
      where: { draftId: null };
      data: { draftId: number };
    }) => Promise<{ count: number }>;
  };
};

// ownerDiscordId: the Discord userId that should own this draft. Pass null to leave unclaimed
// (use OWNER_DISCORD_ID env var at call time — find your ID via Discord's /api/users/@me or
// by checking the JWT token after first sign-in in dev logs).
export async function runBackfill(
  prisma: PrismaLike,
  ownerHandle: string,
  ownerDiscordId: string | null,
): Promise<void> {
  const draft = await prisma.draft.create({
    data: { name: "Cole's Draft 2025", ownerId: ownerDiscordId, ownerTeamId: null },
  });

  const [teamResult, arResult, wlResult, nomResult] = await Promise.all([
    prisma.team.updateMany({ where: { draftId: null }, data: { draftId: draft.id } }),
    prisma.auctionResult.updateMany({ where: { draftId: null }, data: { draftId: draft.id } }),
    prisma.playerWatchlist.updateMany({ where: { draftId: null }, data: { draftId: draft.id } }),
    prisma.nominatedPlayer.updateMany({ where: { draftId: null }, data: { draftId: draft.id } }),
  ]);

  console.log(
    `Stamped draftId=${draft.id} on: ${teamResult.count} teams, ` +
      `${arResult.count} auction results, ${wlResult.count} watchlist, ` +
      `${nomResult.count} nominated`,
  );
  if (ownerDiscordId) {
    console.log(`Set ownerId=${ownerDiscordId}`);
  } else {
    console.warn(
      `No OWNER_DISCORD_ID set — draft is unclaimed. Re-run after finding your Discord ID.`,
    );
  }

  const ownerTeam = await prisma.team.findFirst({ where: { handle: ownerHandle } });
  if (ownerTeam) {
    await prisma.draft.update({ where: { id: draft.id }, data: { ownerTeamId: ownerTeam.id } });
    console.log(`Set ownerTeamId=${ownerTeam.id} (handle: ${ownerHandle})`);
  } else {
    console.warn(`Owner team with handle "${ownerHandle}" not found — ownerTeamId left null`);
  }
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  // Set OWNER_DISCORD_ID in .env.local to your Discord snowflake before running.
  // Find it at https://discord.com/developers/docs/resources/user (or check server logs
  // after first sign-in — the JWT sub claim is your Discord ID).
  const ownerDiscordId = process.env.OWNER_DISCORD_ID ?? null;

  try {
    await runBackfill(prisma as never, 'coreschke', ownerDiscordId);
    console.log('Backfill complete.');
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

// Guard: only run when this file is the entrypoint, not when imported by tests
if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
