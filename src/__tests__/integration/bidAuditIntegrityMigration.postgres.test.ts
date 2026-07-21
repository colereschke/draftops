import {
  createIsolatedMigrationSchema,
  type MigrationTestSchema,
} from '../../../scripts/testDatabase';

const MIGRATION_NAME = '20260721110000_hard_011_bid_audit_integrity';

describe('bid audit same-draft integrity migration against PostgreSQL', () => {
  let schema: MigrationTestSchema;

  beforeEach(async () => {
    schema = await createIsolatedMigrationSchema(MIGRATION_NAME);
  });

  afterEach(async () => {
    await schema.dispose();
  });

  it('rejects an audit event whose draft does not own its bid', async () => {
    const firstDraft = await schema.client.query<{ id: number }>(
      'INSERT INTO "Draft" (name) VALUES ($1) RETURNING id',
      ['First audit draft'],
    );
    const secondDraft = await schema.client.query<{ id: number }>(
      'INSERT INTO "Draft" (name) VALUES ($1) RETURNING id',
      ['Second audit draft'],
    );
    const team = await schema.client.query<{ id: number }>(
      `INSERT INTO "Team" (handle, "draftId", "updatedAt")
       VALUES ('audit-team', $1, transaction_timestamp()) RETURNING id`,
      [firstDraft.rows[0].id],
    );
    const player = await schema.client.query<{ id: number }>(
      `INSERT INTO "Player" (
        name, "nflTeam", pos, "sfRank", budget, ceiling, floor,
        "baseBudget", "baseCeiling", "baseFloor", notes, "draftId"
      ) VALUES ('Audit Player', 'BUF', 'QB', 1, 10, 12, 8, 10, 12, 8, '', $1)
      RETURNING id`,
      [firstDraft.rows[0].id],
    );
    const bid = await schema.client.query<{ id: number }>(
      `INSERT INTO "AuctionResult" (
        player, "playerId", position, "nflTeam", price, "sfRank", "teamId", "draftId"
      ) VALUES ('Audit Player', $1, 'QB', 'BUF', 120, 1, $2, $3) RETURNING id`,
      [player.rows[0].id, team.rows[0].id, firstDraft.rows[0].id],
    );

    await schema.applyMigration(MIGRATION_NAME);

    await expect(
      schema.client.query(
        `INSERT INTO "BidAuditEvent" ("draftId", "bidId", "actorId", type)
         VALUES ($1, $2, 'owner', 'CREATE')`,
        [secondDraft.rows[0].id, bid.rows[0].id],
      ),
    ).rejects.toMatchObject({ code: '23503' });
  });
});
