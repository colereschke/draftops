import type { Client } from 'pg';
import {
  createIsolatedMigrationSchema,
  type MigrationTestSchema,
} from '../../../scripts/testDatabase';

const MIGRATION_NAME = '20260718180000_same_draft_relationships';

interface DraftRows {
  draftId: number;
  teamId: number;
}

async function createDraftRows(client: Client, label: string): Promise<DraftRows> {
  const draft = await client.query<{ id: number }>(
    'INSERT INTO "Draft" (name) VALUES ($1) RETURNING id',
    [`${label} ${crypto.randomUUID()}`],
  );
  const draftId = draft.rows[0].id;
  const team = await client.query<{ id: number }>(
    `INSERT INTO "Team" (handle, "draftId", "updatedAt")
     VALUES ($1, $2, now()) RETURNING id`,
    [`${label}-${draftId}`, draftId],
  );
  return { draftId, teamId: team.rows[0].id };
}

async function createPlayer(client: Client, draftId: number, name: string): Promise<number> {
  const player = await client.query<{ id: number }>(
    `INSERT INTO "Player" (
      name, "nflTeam", pos, "sfRank", budget, ceiling, floor,
      "baseBudget", "baseCeiling", "baseFloor", notes, "draftId"
    ) VALUES ($1, 'BUF', 'QB', 1, 10, 12, 8, 10, 12, 8, '', $2)
    RETURNING id`,
    [name, draftId],
  );
  return player.rows[0].id;
}

async function createBid(
  client: Client,
  input: DraftRows & { playerName: string; playerId?: number; draftId?: number; teamId?: number },
): Promise<void> {
  await client.query(
    `INSERT INTO "AuctionResult" (
      player, "playerId", position, "nflTeam", price, "sfRank", "teamId", "draftId"
    ) VALUES ($1, $2, 'QB', 'BUF', 10, 1, $3, $4)`,
    [input.playerName, input.playerId ?? null, input.teamId, input.draftId],
  );
}

async function seedNullIdentityRows(
  client: Client,
  rows: DraftRows,
  playerName: string,
): Promise<void> {
  await createBid(client, { ...rows, playerName });
  await client.query('INSERT INTO "PlayerWatchlist" ("playerName", "draftId") VALUES ($1, $2)', [
    playerName,
    rows.draftId,
  ]);
  await client.query('INSERT INTO "NominatedPlayer" ("playerName", "draftId") VALUES ($1, $2)', [
    playerName,
    rows.draftId,
  ]);
}

async function expectColumnNullability(
  client: Client,
  tableName: string,
  expected: 'YES' | 'NO',
): Promise<void> {
  const result = await client.query<{ is_nullable: string }>(
    `SELECT is_nullable
     FROM information_schema.columns
     WHERE table_schema = current_schema()
       AND table_name = $1
       AND column_name = 'playerId'`,
    [tableName],
  );
  expect(result.rows).toEqual([{ is_nullable: expected }]);
}

async function expectMigrationFailure(schema: MigrationTestSchema, message: string): Promise<void> {
  await expect(schema.applyMigration(MIGRATION_NAME)).rejects.toThrow(message);
  await schema.client.query('ROLLBACK');
}

describe('same-draft relationship migration against PostgreSQL', () => {
  let schema: MigrationTestSchema;

  beforeEach(async () => {
    schema = await createIsolatedMigrationSchema(MIGRATION_NAME);
  });

  afterEach(async () => {
    await schema.dispose();
  });

  it('backfills unique player identities and applies every compound constraint', async () => {
    const rows = await createDraftRows(schema.client, 'valid');
    const playerName = 'Unique Player';
    const playerId = await createPlayer(schema.client, rows.draftId, playerName);
    await seedNullIdentityRows(schema.client, rows, playerName);

    await schema.applyMigration(MIGRATION_NAME);

    const bid = await schema.client.query<{ playerId: number }>(
      'SELECT "playerId" FROM "AuctionResult" WHERE player = $1',
      [playerName],
    );
    const watchlist = await schema.client.query<{ playerId: number }>(
      'SELECT "playerId" FROM "PlayerWatchlist" WHERE "playerName" = $1',
      [playerName],
    );
    const nomination = await schema.client.query<{ playerId: number }>(
      'SELECT "playerId" FROM "NominatedPlayer" WHERE "playerName" = $1',
      [playerName],
    );
    expect(bid.rows).toEqual([{ playerId }]);
    expect(watchlist.rows).toEqual([{ playerId }]);
    expect(nomination.rows).toEqual([{ playerId }]);
    await expectColumnNullability(schema.client, 'AuctionResult', 'NO');
    await expectColumnNullability(schema.client, 'PlayerWatchlist', 'NO');
    await expectColumnNullability(schema.client, 'NominatedPlayer', 'NO');

    const constraints = await schema.client.query<{ conname: string }>(
      `SELECT conname
       FROM pg_constraint
       WHERE connamespace = current_schema()::regnamespace
         AND conname = ANY($1::text[])
       ORDER BY conname`,
      [
        [
          'Draft_ownerTeamId_id_fkey',
          'AuctionResult_teamId_draftId_fkey',
          'AuctionResult_playerId_draftId_fkey',
          'PlayerWatchlist_playerId_draftId_fkey',
          'NominatedPlayer_playerId_draftId_fkey',
          'DraftPlayerValue_playerId_draftId_fkey',
        ],
      ],
    );
    expect(constraints.rows).toHaveLength(6);
  });

  it('aborts and rolls back an unmatched null identity', async () => {
    const rows = await createDraftRows(schema.client, 'unmatched');
    await createBid(schema.client, { ...rows, playerName: 'Missing Player' });

    await expectMigrationFailure(
      schema,
      'AuctionResult.playerId null reference has no same-draft player match',
    );

    await expectColumnNullability(schema.client, 'AuctionResult', 'YES');
  });

  it('aborts and rolls back an ambiguous null identity', async () => {
    const rows = await createDraftRows(schema.client, 'ambiguous');
    await createPlayer(schema.client, rows.draftId, 'Duplicate Player');
    await createPlayer(schema.client, rows.draftId, 'Duplicate Player');
    await createBid(schema.client, { ...rows, playerName: 'Duplicate Player' });

    await expectMigrationFailure(
      schema,
      'AuctionResult.playerId null reference is ambiguous within its draft',
    );

    await expectColumnNullability(schema.client, 'AuctionResult', 'YES');
  });

  it('aborts and rolls back a cross-draft team relationship', async () => {
    const first = await createDraftRows(schema.client, 'first');
    const second = await createDraftRows(schema.client, 'second');
    const playerName = 'First Player';
    const playerId = await createPlayer(schema.client, first.draftId, playerName);
    await createBid(schema.client, {
      ...first,
      teamId: second.teamId,
      playerName,
      playerId,
    });

    await expectMigrationFailure(
      schema,
      'AuctionResult.teamId references a team from another draft',
    );

    const constraint = await schema.client.query(
      `SELECT 1 FROM pg_constraint
       WHERE connamespace = current_schema()::regnamespace
         AND conname = 'AuctionResult_teamId_draftId_fkey'`,
    );
    expect(constraint.rows).toHaveLength(0);
  });

  it('aborts when a backfill would duplicate an existing player identity', async () => {
    const rows = await createDraftRows(schema.client, 'collision');
    const playerName = 'Claimed Player';
    const playerId = await createPlayer(schema.client, rows.draftId, playerName);
    await createBid(schema.client, { ...rows, playerName, playerId });
    await createBid(schema.client, { ...rows, playerName });

    await expectMigrationFailure(
      schema,
      'AuctionResult.playerId backfill would create a duplicate player claim',
    );

    await expectColumnNullability(schema.client, 'AuctionResult', 'YES');
  });
});
