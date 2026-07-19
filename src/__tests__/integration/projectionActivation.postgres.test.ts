import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { prisma } from '@/lib/db';
import { applyProjectionValuesToDraft } from '@/lib/projectionApplication';
import { activateProjectionValueSet } from '@/lib/projectionValueSet';
import { DEFAULT_SCORING_SETTINGS, DEFAULT_STARTING_LINEUP, DEFAULT_TARGET_ROSTER } from '@/types';

const MIGRATION_PATH = resolve(
  'prisma/migrations/20260718200000_explicit_projection_activation/migration.sql',
);

interface MigratedValueRow {
  projectionSourceId: number;
  valueSetId: number;
  status: 'ACTIVE' | 'ARCHIVED';
  appliedPlayerCount: number;
  activeProjectionValueSetId: number;
}

describe('projection activation migration against PostgreSQL', () => {
  let client: Client;
  let schemaName: string;

  beforeEach(async () => {
    client = new Client({ connectionString: process.env.TEST_DATABASE_URL });
    await client.connect();
    schemaName = `hard006_${crypto.randomUUID().replaceAll('-', '')}`;
    await client.query(`CREATE SCHEMA "${schemaName}"`);
    await client.query(`SET search_path TO "${schemaName}"`);
  });

  afterEach(async () => {
    await client.query('SET search_path TO public');
    await client.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    await client.end();
  });

  it('preserves every historical row and activates the source with the newest value update', async () => {
    expect(existsSync(MIGRATION_PATH)).toBe(true);

    await createLegacyProjectionTables(client);
    await seedLegacyProjectionValues(client);
    await client.query(readFileSync(MIGRATION_PATH, 'utf8'));

    const result = await client.query<MigratedValueRow>(`
      SELECT
        value."projectionSourceId",
        value."valueSetId",
        value_set.status,
        value_set."appliedPlayerCount",
        draft."activeProjectionValueSetId"
      FROM "DraftPlayerValue" value
      JOIN "DraftProjectionValueSet" value_set ON value_set.id = value."valueSetId"
      JOIN "Draft" draft ON draft.id = value."draftId"
      ORDER BY value."projectionSourceId"
    `);

    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({
      projectionSourceId: 1,
      status: 'ARCHIVED',
      appliedPlayerCount: 1,
    });
    expect(result.rows[1]).toMatchObject({
      projectionSourceId: 2,
      status: 'ACTIVE',
      appliedPlayerCount: 1,
    });
    expect(result.rows[1].activeProjectionValueSetId).toBe(result.rows[1].valueSetId);
    expect(result.rows[0].activeProjectionValueSetId).toBe(result.rows[1].valueSetId);
  });
});

async function createLegacyProjectionTables(client: Client): Promise<void> {
  await client.query(`
    CREATE TABLE "Draft" (
      id SERIAL PRIMARY KEY
    );
    CREATE TABLE "Player" (
      id SERIAL PRIMARY KEY,
      "draftId" INTEGER NOT NULL REFERENCES "Draft"(id)
    );
    CREATE TABLE "ProjectionSource" (
      id SERIAL PRIMARY KEY
    );
    CREATE TABLE "DraftPlayerValue" (
      id SERIAL PRIMARY KEY,
      "draftId" INTEGER NOT NULL REFERENCES "Draft"(id),
      "playerId" INTEGER NOT NULL REFERENCES "Player"(id),
      "projectionSourceId" INTEGER REFERENCES "ProjectionSource"(id),
      "projectedPoints" DOUBLE PRECISION,
      "replacementPoints" DOUBLE PRECISION,
      vor DOUBLE PRECISION,
      "projectionAuctionValue" INTEGER,
      "fallbackAuctionValue" INTEGER NOT NULL,
      "activeAuctionValue" INTEGER NOT NULL,
      "valueSource" TEXT NOT NULL DEFAULT 'fallback',
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL
    );
    CREATE UNIQUE INDEX "DraftPlayerValue_draftId_playerId_projectionSourceId_key"
      ON "DraftPlayerValue"("draftId", "playerId", "projectionSourceId");
    CREATE INDEX "DraftPlayerValue_draftId_idx" ON "DraftPlayerValue"("draftId");
    CREATE INDEX "DraftPlayerValue_playerId_idx" ON "DraftPlayerValue"("playerId");
  `);
}

async function seedLegacyProjectionValues(client: Client): Promise<void> {
  await client.query(`
    INSERT INTO "Draft" (id) VALUES (1);
    INSERT INTO "Player" (id, "draftId") VALUES (1, 1);
    INSERT INTO "ProjectionSource" (id) VALUES (1), (2);
    INSERT INTO "DraftPlayerValue" (
      "draftId",
      "playerId",
      "projectionSourceId",
      "fallbackAuctionValue",
      "activeAuctionValue",
      "updatedAt"
    ) VALUES
      (1, 1, 1, 100, 105, '2026-07-17T12:00:00.000Z'),
      (1, 1, 2, 100, 110, '2026-07-18T12:00:00.000Z');
  `);
}

interface ApplicationFixture {
  draftId: number;
  projectionSourceId: number;
  playerIds: number[];
}

const APPLICATION_PREFIX = `hard-006-application-${process.pid}`;

async function createApplicationFixture(playerCount: number): Promise<ApplicationFixture> {
  const fixtureId = crypto.randomUUID();
  const draft = await prisma.draft.create({
    data: {
      name: `${APPLICATION_PREFIX}-${fixtureId}`,
      budget: 1000,
      playerValueSourceBudget: 1000,
      teamCount: 12,
      rosterSize: 30,
      startingLineup: DEFAULT_STARTING_LINEUP,
      scoringSettings: DEFAULT_SCORING_SETTINGS,
      targetRoster: DEFAULT_TARGET_ROSTER,
    },
  });
  const projectionSource = await prisma.projectionSource.create({
    data: { name: `${APPLICATION_PREFIX}-${fixtureId}`, season: 2026 },
  });
  await prisma.player.createMany({
    data: Array.from({ length: playerCount }, (_, index) => ({
      name: `Player ${fixtureId} ${index}`,
      nflTeam: 'BUF',
      pos: 'QB',
      sfRank: index + 1,
      budget: 10 + index,
      ceiling: 12 + index,
      floor: 8 + index,
      baseBudget: 10 + index,
      baseCeiling: 12 + index,
      baseFloor: 8 + index,
      sleeperId: `${fixtureId}-${index}`,
      notes: '',
      draftId: draft.id,
    })),
  });
  const players = await prisma.player.findMany({
    where: { draftId: draft.id },
    orderBy: { id: 'asc' },
    select: { id: true, sleeperId: true },
  });
  await prisma.playerProjection.createMany({
    data: players.map((player, index) => ({
      sleeperId: player.sleeperId!,
      position: 'QB',
      games: 17,
      passAtt: 500 + index,
      passCmp: 320,
      passYds: 3800 + index * 5,
      passTd: 25,
      passInt: 10,
      passSacks: 30,
      rushAtt: 60,
      rushYds: 300,
      rushTd: 3,
      targets: 0,
      receptions: 0,
      recYds: 0,
      recTd: 0,
      baseFantasyPoints: 250,
      projectionSourceId: projectionSource.id,
    })),
  });
  return {
    draftId: draft.id,
    projectionSourceId: projectionSource.id,
    playerIds: players.map((player) => player.id),
  };
}

async function deleteApplicationFixtures(): Promise<void> {
  const drafts = await prisma.draft.findMany({
    where: { name: { startsWith: APPLICATION_PREFIX } },
    select: { id: true },
  });
  const draftIds = drafts.map((draft) => draft.id);
  if (draftIds.length > 0) {
    await prisma.draft.updateMany({
      where: { id: { in: draftIds } },
      data: { activeProjectionValueSetId: null },
    });
    await prisma.draftPlayerValue.deleteMany({ where: { draftId: { in: draftIds } } });
    await prisma.draftProjectionValueSet.deleteMany({ where: { draftId: { in: draftIds } } });
    await prisma.player.deleteMany({ where: { draftId: { in: draftIds } } });
    await prisma.draft.deleteMany({ where: { id: { in: draftIds } } });
  }
  const sources = await prisma.projectionSource.findMany({
    where: { name: { startsWith: APPLICATION_PREFIX } },
    select: { id: true },
  });
  const sourceIds = sources.map((source) => source.id);
  if (sourceIds.length > 0) {
    await prisma.playerProjection.deleteMany({
      where: { projectionSourceId: { in: sourceIds } },
    });
    await prisma.projectionSource.deleteMany({ where: { id: { in: sourceIds } } });
  }
}

describe('projection value-set application against PostgreSQL', () => {
  afterEach(async () => {
    await prisma.$executeRawUnsafe(
      'DROP TRIGGER IF EXISTS hard006_fail_second_batch ON "DraftPlayerValue"',
    );
    await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS hard006_fail_second_batch()');
    await deleteApplicationFixtures();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('keeps the previous same-source set fully active after a later batch fails', async () => {
    const fixture = await createApplicationFixture(51);
    const first = await applyProjectionValuesToDraft(prisma, {
      draftId: fixture.draftId,
      projectionSourceId: fixture.projectionSourceId,
    });
    const failedPlayerId = fixture.playerIds[50];
    await prisma.$executeRawUnsafe(`
      CREATE FUNCTION hard006_fail_second_batch() RETURNS trigger AS $$
      BEGIN
        IF NEW."playerId" = ${failedPlayerId} THEN
          RAISE EXCEPTION 'forced second projection batch failure';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER hard006_fail_second_batch
      BEFORE INSERT ON "DraftPlayerValue"
      FOR EACH ROW EXECUTE FUNCTION hard006_fail_second_batch();
    `);

    await expect(
      applyProjectionValuesToDraft(prisma, {
        draftId: fixture.draftId,
        projectionSourceId: fixture.projectionSourceId,
      }),
    ).rejects.toMatchObject({ code: 'PERSISTENCE_FAILURE' });

    await expect(
      prisma.draft.findUniqueOrThrow({
        where: { id: fixture.draftId },
        select: { activeProjectionValueSetId: true },
      }),
    ).resolves.toEqual({ activeProjectionValueSetId: first.valueSetId });
    await expect(
      prisma.draftPlayerValue.count({ where: { valueSetId: first.valueSetId } }),
    ).resolves.toBe(51);
    const failedSet = await prisma.draftProjectionValueSet.findFirstOrThrow({
      where: { draftId: fixture.draftId, status: 'FAILED' },
      select: { id: true, failureCode: true },
    });
    expect(failedSet.failureCode).toBe('PERSISTENCE_FAILURE');
    await expect(
      prisma.draftPlayerValue.count({ where: { valueSetId: failedSet.id } }),
    ).resolves.toBe(0);
  });

  it('serializes two valid candidate activations under the shared draft lock', async () => {
    const fixture = await createApplicationFixture(1);
    const first = await applyProjectionValuesToDraft(prisma, {
      draftId: fixture.draftId,
      projectionSourceId: fixture.projectionSourceId,
    });
    const candidates = await Promise.all(
      [0, 1].map(async () => {
        const set = await prisma.draftProjectionValueSet.create({
          data: {
            draftId: fixture.draftId,
            projectionSourceId: fixture.projectionSourceId,
            expectedPlayerCount: 1,
          },
        });
        await prisma.draftPlayerValue.create({
          data: {
            draftId: fixture.draftId,
            playerId: fixture.playerIds[0],
            projectionSourceId: fixture.projectionSourceId,
            valueSetId: set.id,
            fallbackAuctionValue: 10,
            activeAuctionValue: 11,
          },
        });
        return set.id;
      }),
    );

    await Promise.all(
      candidates.map((valueSetId) =>
        prisma.$transaction((tx) =>
          activateProjectionValueSet(tx as never, {
            draftId: fixture.draftId,
            projectionSourceId: fixture.projectionSourceId,
            valueSetId,
          }),
        ),
      ),
    );

    const draft = await prisma.draft.findUniqueOrThrow({
      where: { id: fixture.draftId },
      select: { activeProjectionValueSetId: true },
    });
    const activeSets = await prisma.draftProjectionValueSet.findMany({
      where: { draftId: fixture.draftId, status: 'ACTIVE' },
      select: { id: true },
    });
    expect(activeSets).toEqual([{ id: draft.activeProjectionValueSetId }]);
    expect(candidates).toContain(draft.activeProjectionValueSetId);
    await expect(
      prisma.draftProjectionValueSet.findUniqueOrThrow({
        where: { id: first.valueSetId },
        select: { status: true },
      }),
    ).resolves.toEqual({ status: 'ARCHIVED' });
  });

  it('retains all activation metadata but only active plus three archived value rows', async () => {
    const fixture = await createApplicationFixture(1);

    for (let run = 0; run < 5; run += 1) {
      await applyProjectionValuesToDraft(prisma, {
        draftId: fixture.draftId,
        projectionSourceId: fixture.projectionSourceId,
      });
    }

    await expect(
      prisma.draftProjectionValueSet.count({ where: { draftId: fixture.draftId } }),
    ).resolves.toBe(5);
    await expect(
      prisma.draftPlayerValue.count({ where: { draftId: fixture.draftId } }),
    ).resolves.toBe(4);
    await expect(
      prisma.draftProjectionValueSet.count({
        where: { draftId: fixture.draftId, status: 'ACTIVE' },
      }),
    ).resolves.toBe(1);
  });
});
