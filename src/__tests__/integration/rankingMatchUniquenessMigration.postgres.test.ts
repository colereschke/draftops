import {
  createIsolatedMigrationSchema,
  type MigrationTestSchema,
} from '../../../scripts/testDatabase';

const MIGRATION_NAME = '20260719120000_harden_ranking_match_uniqueness';

describe('ranking match uniqueness migration against PostgreSQL', () => {
  let schema: MigrationTestSchema;

  beforeEach(async () => {
    schema = await createIsolatedMigrationSchema(MIGRATION_NAME);
  });

  afterEach(async () => {
    await schema.dispose();
  });

  it('retains the lowest-id duplicate match and preserves null Sleeper IDs', async () => {
    const set = await schema.client.query<{ id: number }>(
      'INSERT INTO "UserRankingSet" ("userId") VALUES ($1) RETURNING id',
      [`migration-test-${crypto.randomUUID()}`],
    );
    const rankingSetId = set.rows[0].id;

    await schema.client.query(
      `INSERT INTO "UserRankingPlayer" (
        "rankingSetId", name, team, pos, "sfRank", budget, ceiling, floor, "sleeperId", "matchStatus"
      ) VALUES
        ($1, 'First', 'BUF', 'QB', 1, 10, 12, 8, 'sleeper-1', 'matched'),
        ($1, 'Later', 'BUF', 'QB', 2, 9, 11, 7, 'sleeper-1', 'manual'),
        ($1, 'Unmatched', 'BUF', 'QB', 3, 8, 10, 6, NULL, 'unmatched')`,
      [rankingSetId],
    );

    await schema.applyMigration(MIGRATION_NAME);

    const players = await schema.client.query<{
      name: string;
      sleeperId: string | null;
      matchStatus: string;
    }>(
      `SELECT name, "sleeperId", "matchStatus"
       FROM "UserRankingPlayer"
       WHERE "rankingSetId" = $1
       ORDER BY id`,
      [rankingSetId],
    );
    expect(players.rows).toEqual([
      { name: 'First', sleeperId: 'sleeper-1', matchStatus: 'matched' },
      { name: 'Later', sleeperId: null, matchStatus: 'unmatched' },
      { name: 'Unmatched', sleeperId: null, matchStatus: 'unmatched' },
    ]);

    await expect(
      schema.client.query(
        `INSERT INTO "UserRankingPlayer" (
          "rankingSetId", name, team, pos, "sfRank", budget, ceiling, floor, "sleeperId"
        ) VALUES ($1, 'Duplicate', 'BUF', 'QB', 4, 7, 9, 5, 'sleeper-1')`,
        [rankingSetId],
      ),
    ).rejects.toMatchObject({ code: '23505' });
  });
});
