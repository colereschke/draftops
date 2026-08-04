/**
 * @jest-environment node
 */
import { getActiveDraftPlayers } from '@/lib/activeDraftPlayers';
import { computeFutureCapitalByHandle } from '@/lib/pickCapital';
import type { StartingSlot } from '@/types';

// Wrap (not replace) the real implementation so every other test in this file keeps exercising
// real future-capital behavior; only this file's one fallbackScale-focused test inspects calls.
jest.mock('@/lib/pickCapital', () => {
  const actual = jest.requireActual('@/lib/pickCapital');
  return { ...actual, computeFutureCapitalByHandle: jest.fn(actual.computeFutureCapitalByHandle) };
});

const mockPlayerFindMany = jest.fn();
const mockPlayerAggregate = jest.fn();
const mockDraftPlayerValueFindMany = jest.fn();
const mockDraftFindUnique = jest.fn();
const mockTeamFindMany = jest.fn();
const mockTradePickAssetFindMany = jest.fn();
const mockAuctionResultFindMany = jest.fn();

jest.mock('@/lib/db', () => ({
  getPrisma: () => ({
    draft: { findUnique: (...args: unknown[]) => mockDraftFindUnique(...args) },
    player: {
      findMany: (...args: unknown[]) => mockPlayerFindMany(...args),
      aggregate: (...args: unknown[]) => mockPlayerAggregate(...args),
    },
    draftPlayerValue: {
      findMany: (...args: unknown[]) => mockDraftPlayerValueFindMany(...args),
    },
    team: { findMany: (...args: unknown[]) => mockTeamFindMany(...args) },
    tradePickAsset: { findMany: (...args: unknown[]) => mockTradePickAssetFindMany(...args) },
    auctionResult: { findMany: (...args: unknown[]) => mockAuctionResultFindMany(...args) },
  }),
}));

const dbPlayer = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  name: 'Projected QB',
  nflTeam: 'BUF',
  pos: 'QB',
  age: 27,
  sfRank: 1,
  budget: 150,
  ceiling: 173,
  floor: 131,
  baseBudget: 150,
  baseCeiling: 173,
  baseFloor: 131,
  notes: '',
  sleeperId: 's1',
  customKey: null,
  futurePickYear: null,
  futurePickRound: null,
  futurePickOriginHandle: null,
  futurePickAssetKind: null,
  ...overrides,
});

const input = {
  draftId: 44,
  startingLineup: ['QB', 'RB', 'WR', 'TE', 'SUPER_FLEX'] as StartingSlot[],
  futurePickAuctionMode: 'packages' as const,
  bids: [],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockDraftFindUnique.mockResolvedValue({ activeProjectionValueSetId: 11 });
  mockTeamFindMany.mockResolvedValue([]);
  mockPlayerAggregate.mockResolvedValue({ _max: { futurePickYear: null } });
  mockTradePickAssetFindMany.mockResolvedValue([]);
  mockAuctionResultFindMany.mockResolvedValue([]);
});

describe('getActiveDraftPlayers', () => {
  it('maps projection and fallback values from one draft-scoped query', async () => {
    mockPlayerFindMany.mockResolvedValue([
      dbPlayer(),
      dbPlayer({ id: 2, name: 'Fallback WR', pos: 'WR', budget: 90, sfRank: 2 }),
    ]);
    mockDraftPlayerValueFindMany.mockResolvedValue([
      {
        playerId: 1,
        projectionSourceId: 7,
        projectedPoints: 300,
        replacementPoints: 180,
        vor: 120,
        projectionAuctionValue: 170,
        fallbackAuctionValue: 150,
        activeAuctionValue: 165,
        valueSource: 'projection',
        updatedAt: new Date('2026-07-17T00:00:00Z'),
      },
    ]);

    const players = await getActiveDraftPlayers(input);

    expect(mockPlayerFindMany).toHaveBeenCalledWith({
      where: { draftId: 44 },
      orderBy: { sfRank: 'asc' },
    });
    expect(mockDraftPlayerValueFindMany).toHaveBeenCalledWith({
      where: { draftId: 44, valueSetId: 11 },
      select: {
        playerId: true,
        projectedPoints: true,
        replacementPoints: true,
        vor: true,
        projectionAuctionValue: true,
        fallbackAuctionValue: true,
        activeAuctionValue: true,
        valueSource: true,
      },
    });
    expect(players.map((player) => player.budget)).toEqual([165, 90]);
  });

  it('uses fallback values without loading value rows when no set is active', async () => {
    mockDraftFindUnique.mockResolvedValue({ activeProjectionValueSetId: null });
    mockPlayerFindMany.mockResolvedValue([dbPlayer()]);

    const players = await getActiveDraftPlayers(input);

    expect(mockDraftPlayerValueFindMany).not.toHaveBeenCalled();
    expect(players[0].budget).toBe(150);
    expect(players[0].valueSource).toBe('fallback');
  });

  it('reuses prefetched teams and resolved ownership without duplicate ownership queries', async () => {
    mockDraftFindUnique.mockResolvedValue({ activeProjectionValueSetId: null });
    mockPlayerFindMany.mockResolvedValue([dbPlayer()]);

    await getActiveDraftPlayers({
      ...input,
      preFetchedTeams: [{ id: 7, handle: 'owner' }],
      preResolvedPicks: [],
    });

    expect(mockTeamFindMany).not.toHaveBeenCalled();
    expect(mockTradePickAssetFindMany).not.toHaveBeenCalled();
    expect(mockAuctionResultFindMany).not.toHaveBeenCalled();
  });

  it('applies dynamic pick values before auction-mode filtering', async () => {
    mockPlayerFindMany.mockResolvedValue([
      dbPlayer({ name: 'Origin QB', nflTeam: 'origin' }),
      dbPlayer({
        id: 2,
        name: "origin's 2027 package",
        nflTeam: 'origin',
        pos: 'PKG',
        budget: 109,
        baseBudget: 109,
        futurePickYear: 2027,
        futurePickOriginHandle: 'origin',
        futurePickAssetKind: 'package',
      }),
      dbPlayer({
        id: 3,
        name: 'origin 2027 1st',
        nflTeam: 'origin',
        pos: 'PICK',
        budget: 75,
        baseBudget: 75,
        futurePickYear: 2027,
        futurePickRound: 1,
        futurePickOriginHandle: 'origin',
        futurePickAssetKind: 'pick',
      }),
    ]);
    mockDraftPlayerValueFindMany.mockResolvedValue([]);

    const players = await getActiveDraftPlayers({
      ...input,
      bids: [{ player: 'Origin QB', price: 80, teamHandle: 'origin' }],
    });

    expect(players.map((player) => player.player)).toEqual(['Origin QB', "origin's 2027 package"]);
    expect(players[1].dynamicPickValue?.direction).toBe('down');
  });

  it.each([
    ['individual', ['Origin QB', 'origin 2027 1st']],
    ['none', ['Origin QB']],
  ] as const)('filters future pick assets in %s mode', async (futurePickAuctionMode, names) => {
    mockPlayerFindMany.mockResolvedValue([
      dbPlayer({ name: 'Origin QB', nflTeam: 'origin' }),
      dbPlayer({
        id: 2,
        name: "origin's 2027 package",
        nflTeam: 'origin',
        pos: 'PKG',
        budget: 109,
        baseBudget: 109,
        futurePickYear: 2027,
        futurePickOriginHandle: 'origin',
        futurePickAssetKind: 'package',
      }),
      dbPlayer({
        id: 3,
        name: 'origin 2027 1st',
        nflTeam: 'origin',
        pos: 'PICK',
        budget: 75,
        baseBudget: 75,
        futurePickYear: 2027,
        futurePickRound: 1,
        futurePickOriginHandle: 'origin',
        futurePickAssetKind: 'pick',
      }),
    ]);
    mockDraftPlayerValueFindMany.mockResolvedValue([]);

    const players = await getActiveDraftPlayers({ ...input, futurePickAuctionMode });

    expect(players.map((player) => player.player)).toEqual(names);
  });

  it('scales the no-generated-year-data future-capital fallback against the $1,000 source economy, not playerValueSourceBudget', async () => {
    // PACKAGE_BASELINE/ROUND_BASELINES are hardcoded constants always denominated in the $1,000
    // ranking-source economy (see the inline comment in activeDraftPlayers.ts), so the fallback
    // scale must be draftBudget / DEFAULT_RANKING_SOURCE_BUDGET (2000 / 1000 = 2) — never
    // draftBudget / playerValueSourceBudget (2000 / 500 = 4), even though a draft's real
    // playerValueSourceBudget is 1000 for every ranking source in this codebase today.
    mockDraftFindUnique.mockResolvedValue({
      activeProjectionValueSetId: null,
      playerValueSourceBudget: 500,
      budget: 2000,
    });
    mockPlayerFindMany.mockResolvedValue([dbPlayer()]);

    await getActiveDraftPlayers(input);

    expect(computeFutureCapitalByHandle).toHaveBeenCalledWith(
      expect.objectContaining({ fallbackScale: 2 }),
    );
  });

  it('propagates player query failures', async () => {
    const error = new Error('player query failed');
    mockPlayerFindMany.mockRejectedValue(error);
    mockDraftPlayerValueFindMany.mockResolvedValue([]);

    await expect(getActiveDraftPlayers(input)).rejects.toBe(error);
  });
});
