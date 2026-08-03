import { getPrisma } from '@/lib/db';
import { DraftMutationFailure } from '@/lib/draftMutation';
import { getGeneratedPickYear, resolvePickHolder } from '@/lib/pickOwnership';

const mockTeamFindFirst = jest.fn();
const mockTradePickAssetFindFirst = jest.fn();
const mockAuctionResultFindFirst = jest.fn();
const mockPlayerAggregate = jest.fn();

jest.mock('@/lib/db', () => ({
  getPrisma: () => ({
    team: { findFirst: mockTeamFindFirst },
    tradePickAsset: { findFirst: mockTradePickAssetFindFirst },
    auctionResult: { findFirst: mockAuctionResultFindFirst },
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
