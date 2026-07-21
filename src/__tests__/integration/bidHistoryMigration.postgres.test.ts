import type { Client } from 'pg';
import {
  createIsolatedMigrationSchema,
  type MigrationTestSchema,
} from '../../../scripts/testDatabase';

const MIGRATION_NAME = '20260719120000_hard_011_bid_history';

interface DraftRows {
  draftId: number;
  firstTeamId: number;
  secondTeamId: number;
  playerId: number;
}

async function createDraftRows(client: Client): Promise<DraftRows> {
  const draft = await client.query<{ id: number }>(
    'INSERT INTO "Draft" (name) VALUES ($1) RETURNING id',
    [`Bid history ${crypto.randomUUID()}`],
  );
  const draftId = draft.rows[0].id;
  const teams = await client.query<{ id: number }>(
    `INSERT INTO "Team" (handle, "draftId", "updatedAt")
     VALUES ($1, $3, now()), ($2, $3, now())
     RETURNING id`,
    [`first-${draftId}`, `second-${draftId}`, draftId],
  );
  const player = await client.query<{ id: number }>(
    `INSERT INTO "Player" (
      name, "nflTeam", pos, "sfRank", budget, ceiling, floor,
      "baseBudget", "baseCeiling", "baseFloor", notes, "draftId"
    ) VALUES ('Josh Allen', 'BUF', 'QB', 1, 10, 12, 8, 10, 12, 8, '', $1)
    RETURNING id`,
    [draftId],
  );
  return {
    draftId,
    firstTeamId: teams.rows[0].id,
    secondTeamId: teams.rows[1].id,
    playerId: player.rows[0].id,
  };
}

describe('bid history migration against PostgreSQL', () => {
  let schema: MigrationTestSchema;

  beforeEach(async () => {
    schema = await createIsolatedMigrationSchema(MIGRATION_NAME);
  });

  afterEach(async () => {
    await schema.dispose();
  });

  it('allows a deleted claim and a new active claim for the same player', async () => {
    const { draftId, firstTeamId, secondTeamId, playerId } = await createDraftRows(schema.client);
    const oldBid = await schema.client.query<{ id: number }>(
      `INSERT INTO "AuctionResult" (
        player, "playerId", position, "nflTeam", price, "sfRank", "teamId", "draftId"
      ) VALUES ('Josh Allen', $1, 'QB', 'BUF', 120, 1, $2, $3) RETURNING id`,
      [playerId, firstTeamId, draftId],
    );

    await schema.applyMigration(MIGRATION_NAME);
    await schema.client.query('UPDATE "AuctionResult" SET "deletedAt" = now() WHERE id = $1', [
      oldBid.rows[0].id,
    ]);

    await expect(
      schema.client.query(
        `INSERT INTO "AuctionResult" (
          player, "playerId", position, "nflTeam", price, "sfRank", "teamId", "draftId"
        ) VALUES ('Josh Allen', $1, 'QB', 'BUF', 150, 1, $2, $3)`,
        [playerId, secondTeamId, draftId],
      ),
    ).resolves.toBeDefined();
  });

  it('rejects two active claims for the same player', async () => {
    const { draftId, firstTeamId, secondTeamId, playerId } = await createDraftRows(schema.client);
    await schema.applyMigration(MIGRATION_NAME);
    await schema.client.query(
      `INSERT INTO "AuctionResult" (
        player, "playerId", position, "nflTeam", price, "sfRank", "teamId", "draftId"
      ) VALUES ('Josh Allen', $1, 'QB', 'BUF', 120, 1, $2, $3)`,
      [playerId, firstTeamId, draftId],
    );

    await expect(
      schema.client.query(
        `INSERT INTO "AuctionResult" (
          player, "playerId", position, "nflTeam", price, "sfRank", "teamId", "draftId"
        ) VALUES ('Josh Allen', $1, 'QB', 'BUF', 150, 1, $2, $3)`,
        [playerId, secondTeamId, draftId],
      ),
    ).rejects.toMatchObject({ code: '23505' });
  });
});
