import { getPrisma } from '@/lib/db';
import { DraftMutationFailure } from '@/lib/draftMutation';
import {
  buildCurrentPickHoldings,
  getGeneratedPickYear,
  groupResolvedPicks,
  resolveAllPickHolders,
  resolvePickHolder,
} from '@/lib/pickOwnership';

const mockTeamFindFirst = jest.fn();
const mockTradePickAssetFindFirst = jest.fn();
const mockAuctionResultFindFirst = jest.fn();
const mockPlayerAggregate = jest.fn();
const mockTradePickAssetFindMany = jest.fn();
const mockAuctionResultFindMany = jest.fn();
const mockTeamFindMany = jest.fn();

jest.mock('@/lib/db', () => ({
  getPrisma: () => ({
    team: { findFirst: mockTeamFindFirst, findMany: mockTeamFindMany },
    tradePickAsset: {
      findFirst: mockTradePickAssetFindFirst,
      findMany: mockTradePickAssetFindMany,
    },
    auctionResult: { findFirst: mockAuctionResultFindFirst, findMany: mockAuctionResultFindMany },
    player: { aggregate: mockPlayerAggregate },
  }),
}));

const client = getPrisma() as never;

beforeEach(() => jest.clearAllMocks());

describe('resolvePickHolder', () => {
  it('resolves via the most recent trade when one exists', async () => {
    // budgetTeamId is the holder after a trade — that team sent budget and received the pick.
    // pickTeamId is the seller (the pre-trade holder), which is what PICK_NOT_HELD checks against.
    mockTradePickAssetFindFirst.mockResolvedValue({
      tradeId: 42,
      trade: { budgetTeamId: 9 },
    });
    const result = await resolvePickHolder(client, 1, 3, 2027, 1);
    expect(result).toEqual({ holderTeamId: 9, eventKind: 'trade', eventId: 42 });
    expect(mockTeamFindFirst).not.toHaveBeenCalled();
  });

  it('falls back to the auction win when no trade exists', async () => {
    mockTradePickAssetFindFirst.mockResolvedValue(null);
    mockTeamFindFirst.mockResolvedValue({ handle: 'origin-team' });
    mockAuctionResultFindFirst.mockResolvedValue({ id: 501, teamId: 6 });
    const result = await resolvePickHolder(client, 1, 3, 2027, 1);
    expect(result).toEqual({ holderTeamId: 6, eventKind: 'auction', eventId: 501 });
  });

  it('falls back to the origin team when neither exists', async () => {
    mockTradePickAssetFindFirst.mockResolvedValue(null);
    mockTeamFindFirst.mockResolvedValue({ handle: 'origin-team' });
    mockAuctionResultFindFirst.mockResolvedValue(null);
    const result = await resolvePickHolder(client, 1, 3, 2027, 1);
    expect(result).toEqual({ holderTeamId: 3, eventKind: 'default', eventId: null });
  });

  it('rejects with TEAM_NOT_FOUND for a stale or invalid originTeamId, instead of a raw Prisma error', async () => {
    // A caller can pass a stale/hand-crafted originTeamId (e.g. a manually-entered off-book pick
    // referencing a team that was somehow removed). `findFirstOrThrow` would throw a raw Prisma
    // P2025 here, which callers up the stack don't know how to map to a `DraftMutationResult` —
    // an explicit `findFirst` + `DraftMutationFailure` keeps this in the typed error vocabulary.
    mockTradePickAssetFindFirst.mockResolvedValue(null);
    mockTeamFindFirst.mockResolvedValue(null);
    await expect(resolvePickHolder(client, 1, 999, 2027, 1)).rejects.toThrow(DraftMutationFailure);
    await expect(resolvePickHolder(client, 1, 999, 2027, 1)).rejects.toMatchObject({
      code: 'TEAM_NOT_FOUND',
    });
  });
});

describe('getGeneratedPickYear', () => {
  it('returns the max futurePickYear for the draft', async () => {
    mockPlayerAggregate.mockResolvedValue({ _max: { futurePickYear: 2027 } });
    expect(await getGeneratedPickYear(client, 1)).toBe(2027);
  });

  it('returns null when the draft has no future-pick rows', async () => {
    mockPlayerAggregate.mockResolvedValue({ _max: { futurePickYear: null } });
    expect(await getGeneratedPickYear(client, 1)).toBeNull();
  });
});

describe('resolveAllPickHolders', () => {
  it('combines trade-touched and auction-touched picks, trade taking precedence', async () => {
    // trade: origin 3, 2027 round 1 -> team 9
    mockTradePickAssetFindMany.mockResolvedValue([
      {
        originTeamId: 3,
        futurePickYear: 2027,
        futurePickRound: 1,
        tradeId: 42,
        // budgetTeamId (9) is the holder — it sent budget and received the pick.
        trade: { budgetTeamId: 9, createdAt: new Date('2026-08-01T00:00:00Z') },
      },
    ]);
    // auction: origin 3's whole 2027 package won by team 6 (covers rounds 1,2,3)
    mockAuctionResultFindMany.mockResolvedValue([
      {
        id: 501,
        teamId: 6,
        playerRow: {
          futurePickOriginHandle: 'origin-team',
          futurePickYear: 2027,
          futurePickAssetKind: 'package',
          futurePickRound: null,
        },
      },
    ]);
    mockTeamFindMany.mockResolvedValue([{ id: 3, handle: 'origin-team' }]);

    const result = await resolveAllPickHolders(client, 1);

    expect(result).toContainEqual({
      originTeamId: 3,
      futurePickYear: 2027,
      futurePickRound: 1,
      holderTeamId: 9,
      eventKind: 'trade',
      eventId: 42,
    });
    expect(result).toContainEqual({
      originTeamId: 3,
      futurePickYear: 2027,
      futurePickRound: 2,
      holderTeamId: 6,
      eventKind: 'auction',
      eventId: 501,
    });
    expect(result).toContainEqual({
      originTeamId: 3,
      futurePickYear: 2027,
      futurePickRound: 3,
      holderTeamId: 6,
      eventKind: 'auction',
      eventId: 501,
    });
  });
});

describe('groupResolvedPicks', () => {
  it('groups three rounds sharing one auction event as an intact package', () => {
    const picks = [1, 2, 3].map((round) => ({
      originTeamId: 3,
      futurePickYear: 2027,
      futurePickRound: round as 1 | 2 | 3,
      holderTeamId: 6,
      eventKind: 'auction' as const,
      eventId: 501,
    }));
    const groups = groupResolvedPicks(picks);
    expect(groups).toEqual([
      {
        originTeamId: 3,
        futurePickYear: 2027,
        holderTeamId: 6,
        isIntactPackage: true,
        rounds: picks,
      },
    ]);
  });

  it('does not group rounds split across different holders', () => {
    const picks = [
      {
        originTeamId: 3,
        futurePickYear: 2027,
        futurePickRound: 1 as const,
        holderTeamId: 9,
        eventKind: 'trade' as const,
        eventId: 42,
      },
      {
        originTeamId: 3,
        futurePickYear: 2027,
        futurePickRound: 2 as const,
        holderTeamId: 6,
        eventKind: 'auction' as const,
        eventId: 501,
      },
      {
        originTeamId: 3,
        futurePickYear: 2027,
        futurePickRound: 3 as const,
        holderTeamId: 6,
        eventKind: 'auction' as const,
        eventId: 501,
      },
    ];
    const groups = groupResolvedPicks(picks);
    expect(groups.every((g) => !g.isIntactPackage)).toBe(true);
    expect(groups).toHaveLength(3);
  });
});

describe('buildCurrentPickHoldings', () => {
  const teams = [
    { id: 1, handle: 'alpha' },
    { id: 2, handle: 'beta' },
  ];

  it('groups untouched generated-year rounds into their origin team packages', () => {
    const holdings = buildCurrentPickHoldings(teams, 2027, []);

    expect(holdings).toEqual([
      {
        originTeamId: 1,
        originHandle: 'alpha',
        futurePickYear: 2027,
        holderTeamId: 1,
        isIntactPackage: true,
        rounds: [1, 2, 3],
      },
      {
        originTeamId: 2,
        originHandle: 'beta',
        futurePickYear: 2027,
        holderTeamId: 2,
        isIntactPackage: true,
        rounds: [1, 2, 3],
      },
    ]);
  });

  it('moves a traded round to its current holder while retaining other rounds at the origin', () => {
    const holdings = buildCurrentPickHoldings(teams, 2027, [
      {
        originTeamId: 1,
        futurePickYear: 2027,
        futurePickRound: 1,
        holderTeamId: 2,
        eventKind: 'trade',
        eventId: 42,
      },
    ]);

    expect(holdings.filter((holding) => holding.originTeamId === 1)).toEqual([
      {
        originTeamId: 1,
        originHandle: 'alpha',
        futurePickYear: 2027,
        holderTeamId: 1,
        isIntactPackage: false,
        rounds: [2],
      },
      {
        originTeamId: 1,
        originHandle: 'alpha',
        futurePickYear: 2027,
        holderTeamId: 1,
        isIntactPackage: false,
        rounds: [3],
      },
      {
        originTeamId: 1,
        originHandle: 'alpha',
        futurePickYear: 2027,
        holderTeamId: 2,
        isIntactPackage: false,
        rounds: [1],
      },
    ]);
  });

  it('includes touched off-book picks without inventing the other off-book rounds', () => {
    const holdings = buildCurrentPickHoldings(teams, 2027, [
      {
        originTeamId: 1,
        futurePickYear: 2028,
        futurePickRound: 2,
        holderTeamId: 2,
        eventKind: 'trade',
        eventId: 44,
      },
    ]);

    expect(holdings.filter((holding) => holding.futurePickYear === 2028)).toEqual([
      {
        originTeamId: 1,
        originHandle: 'alpha',
        futurePickYear: 2028,
        holderTeamId: 2,
        isIntactPackage: false,
        rounds: [2],
      },
    ]);
  });
});
