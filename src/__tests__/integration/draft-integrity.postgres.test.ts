import { Client } from 'pg';
import { disconnectPrisma, getPrisma } from '@/lib/db';
import { createBidRecord } from '@/lib/bidMutation';
import { completeOwnedDraft, withActiveOwnedDraftMutation } from '@/lib/draftMutation';

const LOCK_NAMESPACE = 1_144_002_001;
const ownerId = `integration-owner-${Date.now()}`;

interface Fixture {
  draftId: number;
  firstTeamId: number;
  secondTeamId: number;
  firstPlayerId: number;
  secondPlayerId: number;
}

async function createFixture(options?: { budget?: number; rosterSize?: number }): Promise<Fixture> {
  const budget = options?.budget ?? 1000;
  const rosterSize = options?.rosterSize ?? 2;
  const draft = await getPrisma().draft.create({
    data: {
      name: `Integration ${crypto.randomUUID()}`,
      ownerId,
      budget,
      rosterSize,
      teamCount: 2,
    },
  });
  const [firstTeam, secondTeam] = await Promise.all([
    getPrisma().team.create({
      data: { handle: `first-${draft.id}`, budget, draftId: draft.id },
    }),
    getPrisma().team.create({
      data: { handle: `second-${draft.id}`, budget, draftId: draft.id },
    }),
  ]);
  const basePlayer = {
    nflTeam: 'BUF',
    pos: 'QB',
    age: 25,
    budget: 10,
    ceiling: 12,
    floor: 8,
    baseBudget: 10,
    baseCeiling: 12,
    baseFloor: 8,
    notes: '',
    draftId: draft.id,
  };
  const [firstPlayer, secondPlayer] = await Promise.all([
    getPrisma().player.create({
      data: { ...basePlayer, name: `Player A ${draft.id}`, sfRank: 1 },
    }),
    getPrisma().player.create({
      data: { ...basePlayer, name: `Player B ${draft.id}`, sfRank: 2 },
    }),
  ]);
  return {
    draftId: draft.id,
    firstTeamId: firstTeam.id,
    secondTeamId: secondTeam.id,
    firstPlayerId: firstPlayer.id,
    secondPlayerId: secondPlayer.id,
  };
}

async function deleteFixture(draftId: number): Promise<void> {
  await getPrisma().$transaction([
    getPrisma().bidAuditEvent.deleteMany({ where: { draftId } }),
    getPrisma().draftCompletionSnapshot.deleteMany({ where: { draftId } }),
    getPrisma().auctionResult.deleteMany({ where: { draftId } }),
    getPrisma().nominatedPlayer.deleteMany({ where: { draftId } }),
    getPrisma().playerWatchlist.deleteMany({ where: { draftId } }),
    getPrisma().draftPlayerValue.deleteMany({ where: { draftId } }),
    getPrisma().player.deleteMany({ where: { draftId } }),
    getPrisma().draft.update({ where: { id: draftId }, data: { ownerTeamId: null } }),
    getPrisma().team.deleteMany({ where: { draftId } }),
    getPrisma().draft.delete({ where: { id: draftId } }),
  ]);
}

async function holdDraftLock(draftId: number): Promise<Client> {
  const client = new Client({ connectionString: process.env.TEST_DATABASE_URL });
  await client.connect();
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock($1, $2)', [LOCK_NAMESPACE, draftId]);
  return client;
}

async function letOperationQueue(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 75));
}

describe('draft integrity against PostgreSQL', () => {
  const fixtureIds: number[] = [];

  afterEach(async () => {
    while (fixtureIds.length > 0) await deleteFixture(fixtureIds.pop()!);
  });

  afterAll(async () => {
    await disconnectPrisma();
  });

  it('rejects a bid queued after completion acquires the draft lock', async () => {
    const fixture = await createFixture();
    fixtureIds.push(fixture.draftId);
    const lockClient = await holdDraftLock(fixture.draftId);
    const completion = completeOwnedDraft(ownerId, fixture.draftId);
    await letOperationQueue();
    const bid = createBidRecord({
      userId: ownerId,
      draftId: fixture.draftId,
      playerId: fixture.firstPlayerId,
      teamId: fixture.firstTeamId,
      price: 10,
    });
    await letOperationQueue();
    await lockClient.query('COMMIT');
    await lockClient.end();

    await expect(completion).resolves.toMatchObject({ ok: true });
    await expect(bid).resolves.toEqual({ ok: false, code: 'DRAFT_COMPLETE' });
    await expect(
      getPrisma().auctionResult.count({ where: { draftId: fixture.draftId } }),
    ).resolves.toBe(0);
  });

  it('commits a bid queued before completion and then closes the draft', async () => {
    const fixture = await createFixture();
    fixtureIds.push(fixture.draftId);
    const lockClient = await holdDraftLock(fixture.draftId);
    const bid = createBidRecord({
      userId: ownerId,
      draftId: fixture.draftId,
      playerId: fixture.firstPlayerId,
      teamId: fixture.firstTeamId,
      price: 10,
    });
    await letOperationQueue();
    const completion = completeOwnedDraft(ownerId, fixture.draftId);
    await letOperationQueue();
    await lockClient.query('COMMIT');
    await lockClient.end();

    await expect(bid).resolves.toMatchObject({ ok: true });
    await expect(completion).resolves.toMatchObject({ ok: true });
    await expect(
      getPrisma().draft.findUnique({ where: { id: fixture.draftId }, select: { status: true } }),
    ).resolves.toEqual({ status: 'COMPLETE' });
  });

  it('prevents a Sleeper-shaped team write queued after completion', async () => {
    const fixture = await createFixture();
    fixtureIds.push(fixture.draftId);
    const lockClient = await holdDraftLock(fixture.draftId);
    const completion = completeOwnedDraft(ownerId, fixture.draftId);
    await letOperationQueue();
    const sleeperWrite = withActiveOwnedDraftMutation(ownerId, fixture.draftId, async (tx) => {
      await tx.team.update({
        where: { id: fixture.firstTeamId },
        data: { sleeperRosterId: 99 },
      });
      return null;
    });
    await letOperationQueue();
    await lockClient.query('COMMIT');
    await lockClient.end();

    await expect(completion).resolves.toMatchObject({ ok: true });
    await expect(sleeperWrite).resolves.toEqual({ ok: false, code: 'DRAFT_COMPLETE' });
    await expect(
      getPrisma().team.findUnique({
        where: { id: fixture.firstTeamId },
        select: { sleeperRosterId: true },
      }),
    ).resolves.toEqual({ sleeperRosterId: null });
  });

  it('allows exactly one winner from concurrent claims for one player', async () => {
    const fixture = await createFixture();
    fixtureIds.push(fixture.draftId);
    const results = await Promise.all([
      createBidRecord({
        userId: ownerId,
        draftId: fixture.draftId,
        playerId: fixture.firstPlayerId,
        teamId: fixture.firstTeamId,
        price: 10,
      }),
      createBidRecord({
        userId: ownerId,
        draftId: fixture.draftId,
        playerId: fixture.firstPlayerId,
        teamId: fixture.secondTeamId,
        price: 10,
      }),
    ]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toEqual([
      { ok: false, code: 'PLAYER_ALREADY_CLAIMED' },
    ]);
    await expect(
      getPrisma().auctionResult.count({ where: { draftId: fixture.draftId } }),
    ).resolves.toBe(1);
  });

  it('serializes concurrent team spending so only one bid can consume the maximum', async () => {
    const fixture = await createFixture({ budget: 10, rosterSize: 2 });
    fixtureIds.push(fixture.draftId);
    const results = await Promise.all([
      createBidRecord({
        userId: ownerId,
        draftId: fixture.draftId,
        playerId: fixture.firstPlayerId,
        teamId: fixture.firstTeamId,
        price: 6,
      }),
      createBidRecord({
        userId: ownerId,
        draftId: fixture.draftId,
        playerId: fixture.secondPlayerId,
        teamId: fixture.firstTeamId,
        price: 6,
      }),
    ]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toEqual([
      { ok: false, code: 'BID_EXCEEDS_MAX' },
    ]);
  });

  it('rolls back bid creation when nomination cleanup fails', async () => {
    const fixture = await createFixture();
    fixtureIds.push(fixture.draftId);
    await getPrisma().nominatedPlayer.create({
      data: {
        playerId: fixture.firstPlayerId,
        playerName: `Player A ${fixture.draftId}`,
        draftId: fixture.draftId,
      },
    });
    await getPrisma().$executeRawUnsafe(`
      CREATE FUNCTION fail_integrity_nomination_delete() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'forced nomination cleanup failure';
      END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER fail_integrity_nomination_delete
      BEFORE DELETE ON "NominatedPlayer"
      FOR EACH ROW EXECUTE FUNCTION fail_integrity_nomination_delete();
    `);

    try {
      await expect(
        createBidRecord({
          userId: ownerId,
          draftId: fixture.draftId,
          playerId: fixture.firstPlayerId,
          teamId: fixture.firstTeamId,
          price: 10,
        }),
      ).rejects.toThrow('forced nomination cleanup failure');
      await expect(
        getPrisma().auctionResult.count({ where: { draftId: fixture.draftId } }),
      ).resolves.toBe(0);
      await expect(
        getPrisma().nominatedPlayer.count({ where: { draftId: fixture.draftId } }),
      ).resolves.toBe(1);
    } finally {
      await getPrisma().$executeRawUnsafe(`
        DROP TRIGGER IF EXISTS fail_integrity_nomination_delete ON "NominatedPlayer";
        DROP FUNCTION IF EXISTS fail_integrity_nomination_delete();
      `);
    }
  });
});
