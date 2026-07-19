import { LEAGUE_TEAMS } from '../src/lib/teams';
import { FIXTURE_PLAYERS, BASELINE_BID_TARGET } from './fixtures/players';
import { E2E_TEST_USER_ID } from './env';
import { prisma, closeDb } from './db';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');

async function main() {
  const draft = await prisma.draft.create({
    data: {
      name: 'Playwright E2E Draft',
      ownerId: E2E_TEST_USER_ID,
    },
  });

  await prisma.team.createMany({
    data: LEAGUE_TEAMS.map((team) => ({
      handle: team.handle,
      displayName: team.displayName,
      budget: 1000,
      draftId: draft.id,
    })),
  });

  const ownerTeam = await prisma.team.findFirstOrThrow({
    where: { handle: 'coreschke', draftId: draft.id },
  });
  await prisma.draft.update({ where: { id: draft.id }, data: { ownerTeamId: ownerTeam.id } });

  const createdPlayers = await prisma.player.createManyAndReturn({
    data: FIXTURE_PLAYERS.map((player) => ({
      name: player.name,
      nflTeam: player.nflTeam,
      pos: player.pos,
      age: player.age,
      sfRank: player.sfRank,
      budget: player.budget,
      ceiling: player.ceiling,
      floor: player.floor,
      baseBudget: player.budget,
      baseCeiling: player.ceiling,
      baseFloor: player.floor,
      draftId: draft.id,
    })),
  });

  const baselinePlayer = createdPlayers.find((p) => p.name === BASELINE_BID_TARGET.name);
  if (!baselinePlayer) throw new Error('Baseline bid target was not seeded');

  await prisma.auctionResult.create({
    data: {
      player: baselinePlayer.name,
      playerId: baselinePlayer.id,
      position: baselinePlayer.pos,
      nflTeam: baselinePlayer.nflTeam,
      price: baselinePlayer.budget,
      teamId: ownerTeam.id,
      draftId: draft.id,
    },
  });

  console.log(`Seeded e2e draft ${draft.id} with ${FIXTURE_PLAYERS.length} players.`);
}

main()
  .then(closeDb)
  .catch(async (err) => {
    console.error(err);
    await closeDb();
    process.exit(1);
  });
