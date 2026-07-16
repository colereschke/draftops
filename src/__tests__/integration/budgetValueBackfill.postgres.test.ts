import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Pool } from 'pg';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { runBudgetValueBackfill } from '@/lib/budgetValueBackfill';
import { applyProjectionValuesToDraft } from '@/lib/projectionApplication';
import { DEFAULT_SCORING_SETTINGS, DEFAULT_STARTING_LINEUP, DEFAULT_TARGET_ROSTER } from '@/types';
import { writeBudgetValueSnapshot } from '../../../prisma/backfill-budget-scaled-values';
import { runCleanupSteps } from '../../../scripts/testDatabase';

const FIXTURE_PREFIX = `budget-backfill-integration-${process.pid}`;
const FAILURE_TRIGGER = 'fail_budget_value_backfill_write';
const FAILURE_FUNCTION = 'fail_budget_value_backfill_write';
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

interface Fixture {
  draftId: number;
  playerId: number;
  projectionSourceId: number;
}

const snapshotDirectories: string[] = [];

async function createFixture(): Promise<Fixture> {
  const fixtureId = crypto.randomUUID();
  const draft = await prisma.draft.create({
    data: {
      name: `${FIXTURE_PREFIX}-${fixtureId}`,
      ownerId: `${FIXTURE_PREFIX}-${fixtureId}`,
      budget: 200,
      playerValueSourceBudget: 1000,
      teamCount: 12,
      rosterSize: 30,
      startingLineup: DEFAULT_STARTING_LINEUP,
      scoringSettings: DEFAULT_SCORING_SETTINGS,
      targetRoster: DEFAULT_TARGET_ROSTER,
    },
  });
  const player = await prisma.player.create({
    data: {
      name: `Fixture Player ${fixtureId}`,
      nflTeam: 'BUF',
      pos: 'QB',
      age: 25,
      sfRank: 1,
      budget: 100,
      ceiling: 115,
      floor: 87,
      baseBudget: 100,
      baseCeiling: 115,
      baseFloor: 87,
      sleeperId: `fixture-${fixtureId}`,
      notes: '',
      draftId: draft.id,
    },
  });
  const projectionSource = await prisma.projectionSource.create({
    data: {
      name: `${FIXTURE_PREFIX}-${fixtureId}`,
      season: 2026,
      projectionDate: new Date('2026-07-16T00:00:00.000Z'),
    },
  });
  await prisma.playerProjection.create({
    data: {
      sleeperId: player.sleeperId!,
      position: 'QB',
      games: 17,
      passAtt: 550,
      passCmp: 360,
      passYds: 4000,
      passTd: 28,
      passInt: 10,
      passSacks: 30,
      rushAtt: 70,
      rushYds: 350,
      rushTd: 4,
      targets: 0,
      receptions: 0,
      recYds: 0,
      recTd: 0,
      baseFantasyPoints: 276,
      projectionSourceId: projectionSource.id,
    },
  });
  await prisma.draftPlayerValue.create({
    data: {
      draftId: draft.id,
      playerId: player.id,
      projectionSourceId: projectionSource.id,
      projectedPoints: 276,
      fallbackAuctionValue: 100,
      activeAuctionValue: 100,
      valueSource: 'projection_adjusted_market',
    },
  });

  return {
    draftId: draft.id,
    playerId: player.id,
    projectionSourceId: projectionSource.id,
  };
}

async function createSnapshotDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), `${FIXTURE_PREFIX}-`));
  snapshotDirectories.push(directory);
  return directory;
}

async function runApply(fixture: Fixture): Promise<void> {
  await runBudgetValueBackfill(
    prisma,
    {
      apply: true,
      draftId: fixture.draftId,
      snapshotDir: await createSnapshotDirectory(),
    },
    {
      writeSnapshot: writeBudgetValueSnapshot,
      applyProjections: applyProjectionValuesToDraft,
    },
  );
}

async function dropFailureTrigger(): Promise<void> {
  await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${FAILURE_TRIGGER} ON "DraftPlayerValue"`);
}

async function dropFailureFunction(): Promise<void> {
  await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS ${FAILURE_FUNCTION}()`);
}

async function deleteFixtures(): Promise<void> {
  const drafts = await prisma.draft.findMany({
    where: { name: { startsWith: FIXTURE_PREFIX } },
    select: { id: true },
  });
  const draftIds = drafts.map((draft) => draft.id);
  if (draftIds.length > 0) {
    await prisma.draftPlayerValue.deleteMany({ where: { draftId: { in: draftIds } } });
    await prisma.player.deleteMany({ where: { draftId: { in: draftIds } } });
    await prisma.draft.deleteMany({ where: { id: { in: draftIds } } });
  }

  const sources = await prisma.projectionSource.findMany({
    where: { name: { startsWith: FIXTURE_PREFIX } },
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

async function deleteSnapshotDirectories(): Promise<void> {
  const directories = snapshotDirectories.splice(0);
  await runCleanupSteps(
    directories.map((directory) => () => rm(directory, { recursive: true, force: true })),
  );
}

async function cleanupTestResources(): Promise<void> {
  await runCleanupSteps([
    dropFailureTrigger,
    dropFailureFunction,
    deleteFixtures,
    deleteSnapshotDirectories,
  ]);
}

describe('budget value backfill against PostgreSQL', () => {
  afterEach(async () => {
    await cleanupTestResources();
  });

  afterAll(async () => {
    await runCleanupSteps([
      dropFailureTrigger,
      dropFailureFunction,
      deleteFixtures,
      deleteSnapshotDirectories,
      () => prisma.$disconnect(),
      () => pool.end(),
    ]);
  });

  it('scales fallback and active values once without duplicating projection values', async () => {
    const fixture = await createFixture();

    await runApply(fixture);

    await expect(
      prisma.player.findUnique({
        where: { id: fixture.playerId },
        select: { budget: true, ceiling: true, floor: true, baseBudget: true },
      }),
    ).resolves.toEqual({ budget: 20, ceiling: 23, floor: 17, baseBudget: 100 });
    await expect(
      prisma.draftPlayerValue.findFirst({
        where: { draftId: fixture.draftId, playerId: fixture.playerId },
        select: { fallbackAuctionValue: true, activeAuctionValue: true },
      }),
    ).resolves.toEqual({ fallbackAuctionValue: 20, activeAuctionValue: 20 });

    await runApply(fixture);

    await expect(
      prisma.player.findUnique({
        where: { id: fixture.playerId },
        select: { budget: true, ceiling: true, floor: true, baseBudget: true },
      }),
    ).resolves.toEqual({ budget: 20, ceiling: 23, floor: 17, baseBudget: 100 });
    await expect(
      prisma.draftPlayerValue.findFirst({
        where: { draftId: fixture.draftId, playerId: fixture.playerId },
        select: { fallbackAuctionValue: true, activeAuctionValue: true },
      }),
    ).resolves.toEqual({ fallbackAuctionValue: 20, activeAuctionValue: 20 });
    await expect(
      prisma.draftPlayerValue.count({
        where: {
          draftId: fixture.draftId,
          playerId: fixture.playerId,
          projectionSourceId: fixture.projectionSourceId,
        },
      }),
    ).resolves.toBe(1);
  });

  it('rolls back player fallback changes when projection value persistence fails', async () => {
    const fixture = await createFixture();
    await prisma.$executeRawUnsafe(`
      CREATE FUNCTION ${FAILURE_FUNCTION}() RETURNS trigger AS $$
      BEGIN
        IF NEW."draftId" = ${fixture.draftId} THEN
          RAISE EXCEPTION 'forced DraftPlayerValue failure';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER ${FAILURE_TRIGGER}
      BEFORE INSERT OR UPDATE ON "DraftPlayerValue"
      FOR EACH ROW EXECUTE FUNCTION ${FAILURE_FUNCTION}();
    `);

    await expect(runApply(fixture)).rejects.toThrow('forced DraftPlayerValue failure');
    await expect(
      prisma.player.findUnique({
        where: { id: fixture.playerId },
        select: { budget: true, ceiling: true, floor: true },
      }),
    ).resolves.toEqual({ budget: 100, ceiling: 115, floor: 87 });
    await expect(
      prisma.draftPlayerValue.findFirst({
        where: { draftId: fixture.draftId, playerId: fixture.playerId },
        select: { fallbackAuctionValue: true, activeAuctionValue: true },
      }),
    ).resolves.toEqual({ fallbackAuctionValue: 100, activeAuctionValue: 100 });
  });
});
