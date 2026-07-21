import { serializeDraftCsv, serializeDraftExport } from '@/lib/draftExport';

const CREATED_AT = new Date('2026-07-21T12:00:00.000Z');
const UPDATED_AT = new Date('2026-07-21T13:00:00.000Z');

const BID = {
  id: 12,
  draftId: 4,
  playerId: 10,
  player: 'Josh Allen',
  position: 'QB',
  nflTeam: 'BUF',
  price: 120,
  sfRank: 1,
  notes: 'Elite',
  teamId: 7,
  createdAt: CREATED_AT,
  updatedAt: UPDATED_AT,
  deletedAt: null,
  supersededAt: null,
  team: { id: 7, handle: 'coreschke', displayName: 'Cole' },
};

describe('serializeDraftExport', () => {
  it('uses ISO timestamps and deterministically orders audit events', () => {
    const exported = serializeDraftExport({
      draft: {
        id: 4,
        name: 'Startup',
        status: 'ACTIVE',
        budget: 1000,
        teamCount: 12,
        rosterSize: 30,
        playerValueSourceBudget: 1000,
        startingLineup: { QB: 1, RB: 2, WR: 3, TE: 1, FLEX: 2, SUPER_FLEX: 1 },
        scoringSettings: { ppr: 1, tightEndPremium: 1 },
        targetRoster: { QB: 3, RB: 8, WR: 10, TE: 4 },
        futurePickAuctionMode: 'PACKAGES',
        sleeperLeagueId: '12345',
        activeProjectionValueSetId: 9,
      },
      bids: [BID],
      auditEvents: [
        {
          id: 8,
          bidId: 12,
          actorId: 'owner',
          type: 'UPDATE',
          before: null,
          after: { price: 120 },
          occurredAt: new Date('2026-07-21T15:00:00.000Z'),
        },
        {
          id: 3,
          bidId: 12,
          actorId: 'owner',
          type: 'CREATE',
          before: null,
          after: { price: 100 },
          occurredAt: new Date('2026-07-21T15:00:00.000Z'),
        },
      ],
      completionSnapshot: {
        schemaVersion: 1,
        capturedAt: new Date('2026-07-22T12:00:00.000Z'),
        payload: { draftId: 4 },
      },
    });

    expect(exported.activeBids[0]).toMatchObject({
      createdAt: '2026-07-21T12:00:00.000Z',
      updatedAt: '2026-07-21T13:00:00.000Z',
      team: { handle: 'coreschke', displayName: 'Cole' },
    });
    expect(exported.draft).toEqual({
      id: 4,
      name: 'Startup',
      status: 'ACTIVE',
      budget: 1000,
      teamCount: 12,
      rosterSize: 30,
      playerValueSourceBudget: 1000,
      startingLineup: { QB: 1, RB: 2, WR: 3, TE: 1, FLEX: 2, SUPER_FLEX: 1 },
      scoringSettings: { ppr: 1, tightEndPremium: 1 },
      targetRoster: { QB: 3, RB: 8, WR: 10, TE: 4 },
      futurePickAuctionMode: 'PACKAGES',
      sleeperLeagueId: '12345',
      activeProjectionValueSetId: 9,
    });
    expect(exported.auditEvents.map((event) => event.id)).toEqual([3, 8]);
    expect(exported.completionSnapshot).toEqual({
      schemaVersion: 1,
      capturedAt: '2026-07-22T12:00:00.000Z',
      payload: { draftId: 4 },
    });
  });
});

describe('serializeDraftCsv', () => {
  it('writes stable columns and neutralizes formula cells while escaping CSV text', () => {
    const csv = serializeDraftCsv([
      {
        ...BID,
        player: '=SUM(A1)',
        nflTeam: 'BUF,NY',
        notes: 'Ignored by the CSV export',
        team: { id: 7, handle: '@coreschke', displayName: 'Cole "The Owner"' },
      },
    ]);

    expect(csv).toBe(
      'Player,Position,NFL Team,Price,Team,Logged At,Updated At\n' +
        '\'=SUM(A1),QB,"BUF,NY",120,\'@coreschke,2026-07-21T12:00:00.000Z,2026-07-21T13:00:00.000Z\n',
    );
  });
});
