import { Client } from 'pg';
import { disconnectPrisma, getPrisma } from '@/lib/db';
import { createBidRecord, deleteBidRecord, restoreBidRecord } from '@/lib/bidMutation';
import { completeOwnedDraft } from '@/lib/draftMutation';

const LOCK_NAMESPACE = 1_144_002_001;
const ownerId = `bid-recovery-owner-${Date.now()}`;

interface Fixture {
  draftId: number;
  firstTeamId: number;
  secondTeamId: number;
  playerId: number;
}

async function createFixture(): Promise<Fixture> {
  const draft = await getPrisma().draft.create({
    data: {
      name: `Bid recovery ${crypto.randomUUID()}`,
      ownerId,
      budget: 1000,
      rosterSize: 2,
      teamCount: 2,
    },
  });
  const [firstTeam, secondTeam] = await Promise.all([
    getPrisma().team.create({
      data: { handle: `first-${draft.id}`, budget: 1000, draftId: draft.id },
    }),
    getPrisma().team.create({
      data: { handle: `second-${draft.id}`, budget: 1000, draftId: draft.id },
    }),
  ]);
  const player = await getPrisma().player.create({
    data: {
      name: `Recovery player ${draft.id}`,
      nflTeam: 'BUF',
      pos: 'QB',
      sfRank: 1,
      budget: 10,
      ceiling: 12,
      floor: 8,
      baseBudget: 10,
      baseCeiling: 12,
      baseFloor: 8,
      notes: '',
      draftId: draft.id,
    },
  });
  return {
    draftId: draft.id,
    firstTeamId: firstTeam.id,
    secondTeamId: secondTeam.id,
    playerId: player.id,
  };
}

async function deleteFixture(draftId: number): Promise<void> {
  await getPrisma().$transaction([
    getPrisma().bidAuditEvent.deleteMany({ where: { draftId } }),
    getPrisma().draftCompletionSnapshot.deleteMany({ where: { draftId } }),
    getPrisma().auctionResult.deleteMany({ where: { draftId } }),
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

describe('bid recovery against PostgreSQL', () => {
  const fixtureIds: number[] = [];

  afterEach(async () => {
    while (fixtureIds.length > 0) await deleteFixture(fixtureIds.pop()!);
  });

  afterAll(async () => {
    await disconnectPrisma();
  });

  it('supersedes a deleted bid when a replacement claims its player and rejects restoration', async () => {
    const fixture = await createFixture();
    fixtureIds.push(fixture.draftId);
    const firstBid = await createBidRecord({
      userId: ownerId,
      draftId: fixture.draftId,
      playerId: fixture.playerId,
      teamId: fixture.firstTeamId,
      price: 100,
    });
    if (!firstBid.ok) throw new Error(`Could not create fixture bid: ${firstBid.code}`);

    await expect(
      deleteBidRecord({ userId: ownerId, draftId: fixture.draftId, bidId: firstBid.data.bidId }),
    ).resolves.toEqual({ ok: true, data: null });
    await expect(
      createBidRecord({
        userId: ownerId,
        draftId: fixture.draftId,
        playerId: fixture.playerId,
        teamId: fixture.secondTeamId,
        price: 125,
      }),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      restoreBidRecord({ userId: ownerId, draftId: fixture.draftId, bidId: firstBid.data.bidId }),
    ).resolves.toEqual({ ok: false, code: 'BID_SUPERSEDED' });

    await expect(
      getPrisma().auctionResult.findUnique({
        where: { id: firstBid.data.bidId },
        select: { deletedAt: true, supersededAt: true },
      }),
    ).resolves.toEqual({ deletedAt: expect.any(Date), supersededAt: expect.any(Date) });
    await expect(
      getPrisma().bidAuditEvent.findMany({
        where: { draftId: fixture.draftId, bidId: firstBid.data.bidId },
        select: { type: true },
        orderBy: { id: 'asc' },
      }),
    ).resolves.toEqual([{ type: 'CREATE' }, { type: 'DELETE' }, { type: 'SUPERSEDE' }]);
  });

  it('rejects a restore queued after draft completion takes the advisory lock', async () => {
    const fixture = await createFixture();
    fixtureIds.push(fixture.draftId);
    const bid = await createBidRecord({
      userId: ownerId,
      draftId: fixture.draftId,
      playerId: fixture.playerId,
      teamId: fixture.firstTeamId,
      price: 100,
    });
    if (!bid.ok) throw new Error(`Could not create fixture bid: ${bid.code}`);
    await deleteBidRecord({ userId: ownerId, draftId: fixture.draftId, bidId: bid.data.bidId });

    const lockClient = await holdDraftLock(fixture.draftId);
    const completion = completeOwnedDraft(ownerId, fixture.draftId);
    await letOperationQueue();
    const restore = restoreBidRecord({
      userId: ownerId,
      draftId: fixture.draftId,
      bidId: bid.data.bidId,
    });
    await letOperationQueue();
    await lockClient.query('COMMIT');
    await lockClient.end();

    await expect(completion).resolves.toEqual({ ok: true, data: null });
    await expect(restore).resolves.toEqual({ ok: false, code: 'DRAFT_COMPLETE' });
    await expect(
      getPrisma().draftCompletionSnapshot.count({ where: { draftId: fixture.draftId } }),
    ).resolves.toBe(1);
  });

  it('rolls back a soft delete when its audit write fails', async () => {
    const fixture = await createFixture();
    fixtureIds.push(fixture.draftId);
    const bid = await createBidRecord({
      userId: ownerId,
      draftId: fixture.draftId,
      playerId: fixture.playerId,
      teamId: fixture.firstTeamId,
      price: 100,
    });
    if (!bid.ok) throw new Error(`Could not create fixture bid: ${bid.code}`);

    await getPrisma().$executeRawUnsafe(`
      CREATE FUNCTION fail_bid_recovery_audit_insert() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'forced audit insert failure';
      END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER fail_bid_recovery_audit_insert
      BEFORE INSERT ON "BidAuditEvent"
      FOR EACH ROW EXECUTE FUNCTION fail_bid_recovery_audit_insert();
    `);
    try {
      await expect(
        deleteBidRecord({ userId: ownerId, draftId: fixture.draftId, bidId: bid.data.bidId }),
      ).rejects.toThrow('forced audit insert failure');
      await expect(
        getPrisma().auctionResult.findUnique({
          where: { id: bid.data.bidId },
          select: { deletedAt: true },
        }),
      ).resolves.toEqual({ deletedAt: null });
    } finally {
      await getPrisma().$executeRawUnsafe(`
        DROP TRIGGER IF EXISTS fail_bid_recovery_audit_insert ON "BidAuditEvent";
        DROP FUNCTION IF EXISTS fail_bid_recovery_audit_insert();
      `);
    }
  });

  it('rolls back completion when its snapshot write fails', async () => {
    const fixture = await createFixture();
    fixtureIds.push(fixture.draftId);
    await getPrisma().$executeRawUnsafe(`
      CREATE FUNCTION fail_bid_recovery_snapshot_insert() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'forced snapshot insert failure';
      END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER fail_bid_recovery_snapshot_insert
      BEFORE INSERT ON "DraftCompletionSnapshot"
      FOR EACH ROW EXECUTE FUNCTION fail_bid_recovery_snapshot_insert();
    `);
    try {
      await expect(completeOwnedDraft(ownerId, fixture.draftId)).rejects.toThrow(
        'forced snapshot insert failure',
      );
      await expect(
        getPrisma().draft.findUnique({
          where: { id: fixture.draftId },
          select: { status: true },
        }),
      ).resolves.toEqual({ status: 'ACTIVE' });
    } finally {
      await getPrisma().$executeRawUnsafe(`
        DROP TRIGGER IF EXISTS fail_bid_recovery_snapshot_insert ON "DraftCompletionSnapshot";
        DROP FUNCTION IF EXISTS fail_bid_recovery_snapshot_insert();
      `);
    }
  });
});
