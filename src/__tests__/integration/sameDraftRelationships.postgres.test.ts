import { disconnectPrisma, getPrisma } from '@/lib/db';

interface DraftFixture {
  draftId: number;
  teamId: number;
  playerId: number;
  playerName: string;
}

interface RelationshipFixture {
  first: DraftFixture;
  second: DraftFixture;
  projectionSourceId: number;
  valueSetId: number;
}

interface QueryPlanNode {
  'Index Name'?: string;
  Plans?: QueryPlanNode[];
}

interface QueryPlanRow {
  'QUERY PLAN': Array<{ Plan: QueryPlanNode }>;
}

function usesIndex(plan: QueryPlanNode, indexName: string): boolean {
  if (plan['Index Name'] === indexName) return true;
  return plan.Plans?.some((child) => usesIndex(child, indexName)) ?? false;
}

async function createDraftFixture(label: string): Promise<DraftFixture> {
  const draft = await getPrisma().draft.create({
    data: { name: `${label} ${crypto.randomUUID()}`, budget: 1000, rosterSize: 30 },
  });
  const team = await getPrisma().team.create({
    data: { handle: `${label}-${draft.id}`, budget: 1000, draftId: draft.id },
  });
  const playerName = `${label} Player ${draft.id}`;
  const player = await getPrisma().player.create({
    data: {
      name: playerName,
      nflTeam: 'BUF',
      pos: 'QB',
      age: 25,
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

  return { draftId: draft.id, teamId: team.id, playerId: player.id, playerName };
}

async function createFixture(): Promise<RelationshipFixture> {
  const [first, second, projectionSource] = await Promise.all([
    createDraftFixture('first'),
    createDraftFixture('second'),
    getPrisma().projectionSource.create({
      data: { name: `hard-005-${crypto.randomUUID()}`, season: 2026 },
    }),
  ]);
  const valueSet = await getPrisma().draftProjectionValueSet.create({
    data: {
      draftId: first.draftId,
      projectionSourceId: projectionSource.id,
      expectedPlayerCount: 1,
    },
  });
  return {
    first,
    second,
    projectionSourceId: projectionSource.id,
    valueSetId: valueSet.id,
  };
}

function bidData(input: { draftId: number; teamId: number; playerId: number; playerName: string }) {
  return {
    player: input.playerName,
    playerId: input.playerId,
    position: 'QB',
    nflTeam: 'BUF',
    price: 10,
    sfRank: 1,
    teamId: input.teamId,
    draftId: input.draftId,
  };
}

async function deleteFixture(fixture: RelationshipFixture): Promise<void> {
  const draftIds = [fixture.first.draftId, fixture.second.draftId];
  const teamIds = [fixture.first.teamId, fixture.second.teamId];
  const playerIds = [fixture.first.playerId, fixture.second.playerId];

  await getPrisma().bidAuditEvent.deleteMany({ where: { draftId: { in: draftIds } } });
  await getPrisma().draftCompletionSnapshot.deleteMany({ where: { draftId: { in: draftIds } } });
  await getPrisma().auctionResult.deleteMany({
    where: {
      OR: [
        { draftId: { in: draftIds } },
        { teamId: { in: teamIds } },
        { playerId: { in: playerIds } },
      ],
    },
  });
  await getPrisma().playerWatchlist.deleteMany({
    where: { OR: [{ draftId: { in: draftIds } }, { playerId: { in: playerIds } }] },
  });
  await getPrisma().nominatedPlayer.deleteMany({
    where: { OR: [{ draftId: { in: draftIds } }, { playerId: { in: playerIds } }] },
  });
  await getPrisma().draftPlayerValue.deleteMany({
    where: { OR: [{ draftId: { in: draftIds } }, { playerId: { in: playerIds } }] },
  });
  await getPrisma().draftProjectionValueSet.deleteMany({ where: { id: fixture.valueSetId } });
  await getPrisma().draft.updateMany({
    where: { id: { in: draftIds } },
    data: { ownerTeamId: null },
  });
  await getPrisma().player.deleteMany({ where: { id: { in: playerIds } } });
  await getPrisma().team.deleteMany({ where: { id: { in: teamIds } } });
  await getPrisma().draft.deleteMany({ where: { id: { in: draftIds } } });
  await getPrisma().projectionSource.deleteMany({ where: { id: fixture.projectionSourceId } });
}

describe('same-draft relationships against PostgreSQL', () => {
  let fixture: RelationshipFixture;

  beforeEach(async () => {
    fixture = await createFixture();
  });

  afterEach(async () => {
    await deleteFixture(fixture);
  });

  afterAll(async () => {
    await disconnectPrisma();
  });

  it('rejects an owner team from another draft', async () => {
    await expect(
      getPrisma().draft.update({
        where: { id: fixture.first.draftId },
        data: { ownerTeamId: fixture.second.teamId },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });

  it('rejects a bid team from another draft', async () => {
    await expect(
      getPrisma().auctionResult.create({
        data: bidData({
          draftId: fixture.first.draftId,
          teamId: fixture.second.teamId,
          playerId: fixture.first.playerId,
          playerName: fixture.first.playerName,
        }),
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });

  it('rejects a bid player from another draft', async () => {
    await expect(
      getPrisma().auctionResult.create({
        data: bidData({
          draftId: fixture.first.draftId,
          teamId: fixture.first.teamId,
          playerId: fixture.second.playerId,
          playerName: fixture.second.playerName,
        }),
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });

  it('rejects a watchlist player from another draft', async () => {
    await expect(
      getPrisma().playerWatchlist.create({
        data: {
          draftId: fixture.first.draftId,
          playerId: fixture.second.playerId,
          playerName: fixture.second.playerName,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });

  it('rejects a nominated player from another draft', async () => {
    await expect(
      getPrisma().nominatedPlayer.create({
        data: {
          draftId: fixture.first.draftId,
          playerId: fixture.second.playerId,
          playerName: fixture.second.playerName,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });

  it('rejects a draft player value for a player from another draft', async () => {
    await expect(
      getPrisma().draftPlayerValue.create({
        data: {
          draftId: fixture.first.draftId,
          playerId: fixture.second.playerId,
          projectionSourceId: fixture.projectionSourceId,
          valueSetId: fixture.valueSetId,
          fallbackAuctionValue: 10,
          activeAuctionValue: 10,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });

  it('allows matching same-draft relationships', async () => {
    await expect(
      getPrisma().draft.update({
        where: { id: fixture.first.draftId },
        data: { ownerTeamId: fixture.first.teamId },
      }),
    ).resolves.toMatchObject({ ownerTeamId: fixture.first.teamId });
    await expect(
      getPrisma().auctionResult.create({
        data: bidData({
          draftId: fixture.first.draftId,
          teamId: fixture.first.teamId,
          playerId: fixture.first.playerId,
          playerName: fixture.first.playerName,
        }),
      }),
    ).resolves.toMatchObject({ draftId: fixture.first.draftId });
    await expect(
      getPrisma().playerWatchlist.create({
        data: {
          draftId: fixture.first.draftId,
          playerId: fixture.first.playerId,
          playerName: fixture.first.playerName,
        },
      }),
    ).resolves.toMatchObject({ draftId: fixture.first.draftId });
    await expect(
      getPrisma().nominatedPlayer.create({
        data: {
          draftId: fixture.first.draftId,
          playerId: fixture.first.playerId,
          playerName: fixture.first.playerName,
        },
      }),
    ).resolves.toMatchObject({ draftId: fixture.first.draftId });
    await expect(
      getPrisma().draftPlayerValue.create({
        data: {
          draftId: fixture.first.draftId,
          playerId: fixture.first.playerId,
          projectionSourceId: fixture.projectionSourceId,
          valueSetId: fixture.valueSetId,
          fallbackAuctionValue: 10,
          activeAuctionValue: 10,
        },
      }),
    ).resolves.toMatchObject({ draftId: fixture.first.draftId });
  });

  it('restricts deleting a referenced player', async () => {
    await getPrisma().playerWatchlist.create({
      data: {
        draftId: fixture.first.draftId,
        playerId: fixture.first.playerId,
        playerName: fixture.first.playerName,
      },
    });

    await expect(
      getPrisma().player.delete({ where: { id: fixture.first.playerId } }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });

  it('restricts changing a referenced player draft', async () => {
    await getPrisma().playerWatchlist.create({
      data: {
        draftId: fixture.first.draftId,
        playerId: fixture.first.playerId,
        playerName: fixture.first.playerName,
      },
    });

    await expect(
      getPrisma().player.update({
        where: { id: fixture.first.playerId },
        data: { draftId: fixture.second.draftId },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });

  it('provides a draft-leading index for every common child query', async () => {
    const indexes = await getPrisma().$queryRaw<Array<{ indexname: string; tablename: string }>>`
      SELECT indexname, tablename
      FROM pg_indexes
      WHERE schemaname = current_schema()
        AND indexname = ANY(ARRAY[
          'Team_draftId_sleeperRosterId_key',
          'AuctionResult_draftId_playerId_key',
          'AuctionResult_active_draft_player_key',
          'Player_draftId_futurePickOriginHandle_idx',
          'PlayerWatchlist_draftId_idx',
          'NominatedPlayer_draftId_idx',
          'DraftPlayerValue_draftId_idx'
        ])
    `;

    expect(new Set(indexes.map((index) => index.indexname))).toEqual(
      new Set([
        'Team_draftId_sleeperRosterId_key',
        'AuctionResult_active_draft_player_key',
        'Player_draftId_futurePickOriginHandle_idx',
        'PlayerWatchlist_draftId_idx',
        'NominatedPlayer_draftId_idx',
        'DraftPlayerValue_draftId_idx',
      ]),
    );

    const activeBidIndex = await getPrisma().$queryRaw<Array<{ indexdef: string }>>`
      SELECT indexdef
      FROM pg_indexes
      WHERE schemaname = current_schema()
        AND indexname = 'AuctionResult_active_draft_player_key'
    `;

    expect(activeBidIndex).toHaveLength(1);
    expect(activeBidIndex[0].indexdef).toContain('WHERE ("deletedAt" IS NULL)');
  });

  it.each([
    ['PlayerWatchlist', 'PlayerWatchlist_draftId_idx'],
    ['NominatedPlayer', 'NominatedPlayer_draftId_idx'],
  ])('offers an index plan for %s draft lookups', async (tableName, indexName) => {
    const rows = await getPrisma().$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET LOCAL enable_seqscan = off');
      return tx.$queryRawUnsafe<QueryPlanRow[]>(
        `EXPLAIN (FORMAT JSON) SELECT id FROM "${tableName}" WHERE "draftId" = $1`,
        fixture.first.draftId,
      );
    });

    expect(usesIndex(rows[0]['QUERY PLAN'][0].Plan, indexName)).toBe(true);
  });
});
