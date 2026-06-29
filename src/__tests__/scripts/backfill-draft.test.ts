/**
 * @jest-environment node
 */
// Tests for the backfill-draft script's core logic (DB calls mocked).
// The actual script is in prisma/scripts/backfill-draft.ts.

const mockDraftFindFirst = jest.fn();
const mockDraftCreate = jest.fn();
const mockTeamFindFirst = jest.fn();
const mockTeamUpdateMany = jest.fn();
const mockAuctionResultUpdateMany = jest.fn();
const mockPlayerWatchlistUpdateMany = jest.fn();
const mockNominatedPlayerUpdateMany = jest.fn();
const mockDraftUpdate = jest.fn();

const mockPrisma = {
  draft: { findFirst: mockDraftFindFirst, create: mockDraftCreate, update: mockDraftUpdate },
  team: { findFirst: mockTeamFindFirst, updateMany: mockTeamUpdateMany },
  auctionResult: { updateMany: mockAuctionResultUpdateMany },
  playerWatchlist: { updateMany: mockPlayerWatchlistUpdateMany },
  nominatedPlayer: { updateMany: mockNominatedPlayerUpdateMany },
};

// Import only the pure logic function — not the script entrypoint — to avoid running main()
import { runBackfill } from '../../../prisma/scripts/backfill-draft';

beforeEach(() => {
  jest.clearAllMocks();
  mockDraftFindFirst.mockResolvedValue(null);
  mockDraftCreate.mockResolvedValue({ id: 1 });
  mockTeamFindFirst.mockResolvedValue({ id: 7 }); // coreschke team id
  mockTeamUpdateMany.mockResolvedValue({ count: 12 });
  mockAuctionResultUpdateMany.mockResolvedValue({ count: 50 });
  mockPlayerWatchlistUpdateMany.mockResolvedValue({ count: 3 });
  mockNominatedPlayerUpdateMany.mockResolvedValue({ count: 0 });
  mockDraftUpdate.mockResolvedValue({});
});

describe('runBackfill', () => {
  it('creates a draft with the given name and ownerId from env', async () => {
    await runBackfill(mockPrisma as never, 'coreschke', 'discord-owner-999');
    expect(mockDraftCreate).toHaveBeenCalledWith({
      data: { name: "Cole's Draft 2025", ownerId: 'discord-owner-999', ownerTeamId: null },
    });
  });

  it('creates a draft with null ownerId when no ownerId provided', async () => {
    await runBackfill(mockPrisma as never, 'coreschke', null);
    expect(mockDraftCreate).toHaveBeenCalledWith({
      data: { name: "Cole's Draft 2025", ownerId: null, ownerTeamId: null },
    });
  });

  it('stamps draftId on all teams', async () => {
    await runBackfill(mockPrisma as never, 'coreschke', null);
    expect(mockTeamUpdateMany).toHaveBeenCalledWith({
      where: { draftId: null },
      data: { draftId: 1 },
    });
  });

  it('stamps draftId on all auction results', async () => {
    await runBackfill(mockPrisma as never, 'coreschke', null);
    expect(mockAuctionResultUpdateMany).toHaveBeenCalledWith({
      where: { draftId: null },
      data: { draftId: 1 },
    });
  });

  it('stamps draftId on all watchlist entries', async () => {
    await runBackfill(mockPrisma as never, 'coreschke', null);
    expect(mockPlayerWatchlistUpdateMany).toHaveBeenCalledWith({
      where: { draftId: null },
      data: { draftId: 1 },
    });
  });

  it('stamps draftId on all nominated players', async () => {
    await runBackfill(mockPrisma as never, 'coreschke', null);
    expect(mockNominatedPlayerUpdateMany).toHaveBeenCalledWith({
      where: { draftId: null },
      data: { draftId: 1 },
    });
  });

  it('sets ownerTeamId to the team with the given owner handle', async () => {
    await runBackfill(mockPrisma as never, 'coreschke', null);
    expect(mockTeamFindFirst).toHaveBeenCalledWith({ where: { handle: 'coreschke', draftId: 1 } });
    expect(mockDraftUpdate).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { ownerTeamId: 7 },
    });
  });

  it('skips ownerTeamId if owner team not found', async () => {
    mockTeamFindFirst.mockResolvedValue(null);
    await runBackfill(mockPrisma as never, 'coreschke', null);
    expect(mockDraftUpdate).not.toHaveBeenCalled();
  });

  it('skips backfill if a draft with the same name already exists', async () => {
    mockDraftFindFirst.mockResolvedValue({ id: 99 });
    await runBackfill(mockPrisma as never, 'coreschke', null);
    expect(mockDraftCreate).not.toHaveBeenCalled();
    expect(mockTeamUpdateMany).not.toHaveBeenCalled();
  });
});
