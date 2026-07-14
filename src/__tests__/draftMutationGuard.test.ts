import {
  DraftMutationError,
  requireActiveDraft,
  requirePositiveInteger,
  requireAvailablePlayer,
  requirePlayerNotWon,
  isDuplicateAuctionResultError,
} from '@/lib/draftMutationGuard';

const mockGetDraft = jest.fn();
const mockPlayerFindFirst = jest.fn();
const mockAuctionResultFindFirst = jest.fn();

jest.mock('@/lib/draft', () => ({
  getDraft: (...args: unknown[]) => mockGetDraft(...args),
}));

jest.mock('@/lib/db', () => ({
  prisma: {
    player: {
      findFirst: (...args: unknown[]) => mockPlayerFindFirst(...args),
    },
    auctionResult: {
      findFirst: (...args: unknown[]) => mockAuctionResultFindFirst(...args),
    },
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
});

describe('requireActiveDraft', () => {
  it('returns the draft when found and ACTIVE', async () => {
    mockGetDraft.mockResolvedValue({ id: 1, status: 'ACTIVE' });
    await expect(requireActiveDraft('user-1', 1)).resolves.toEqual({ id: 1, status: 'ACTIVE' });
  });

  it('throws a 404 DraftMutationError when no draft is found', async () => {
    mockGetDraft.mockResolvedValue(null);
    await expect(requireActiveDraft('user-1', 1)).rejects.toMatchObject({
      message: 'No draft found',
      status: 404,
    });
  });

  it('throws a 409 DraftMutationError when the draft is COMPLETE', async () => {
    mockGetDraft.mockResolvedValue({ id: 1, status: 'COMPLETE' });
    await expect(requireActiveDraft('user-1', 1)).rejects.toMatchObject({
      message: 'Draft is not active',
      status: 409,
    });
  });
});

describe('requirePositiveInteger', () => {
  it('does not throw for a positive integer', () => {
    expect(() => requirePositiveInteger(1, 'price')).not.toThrow();
  });

  it.each([0, -5, 4.5, NaN])('throws a 400 DraftMutationError for %p', (value) => {
    expect(() => requirePositiveInteger(value, 'price')).toThrow(DraftMutationError);
    try {
      requirePositiveInteger(value, 'price');
    } catch (e) {
      expect((e as DraftMutationError).status).toBe(400);
      expect((e as DraftMutationError).message).toBe('price must be a positive integer');
    }
  });
});

describe('requirePlayerNotWon', () => {
  it('does not throw when no existing result is found', async () => {
    mockAuctionResultFindFirst.mockResolvedValue(null);
    await expect(requirePlayerNotWon(1, 10)).resolves.toBeUndefined();
    expect(mockAuctionResultFindFirst).toHaveBeenCalledWith({
      where: { playerId: 10, draftId: 1 },
    });
  });

  it('throws a 409 DraftMutationError when the player already has a winning bid', async () => {
    mockAuctionResultFindFirst.mockResolvedValue({ id: 9 });
    await expect(requirePlayerNotWon(1, 10)).rejects.toMatchObject({
      message: 'Player already has a winning bid',
      status: 409,
    });
  });
});

describe('requireAvailablePlayer', () => {
  it('returns the player when found and unclaimed', async () => {
    mockPlayerFindFirst.mockResolvedValue({
      id: 10,
      name: 'Josh Allen',
      pos: 'QB',
      nflTeam: 'BUF',
      sfRank: 1,
    });
    mockAuctionResultFindFirst.mockResolvedValue(null);
    await expect(requireAvailablePlayer(1, 10)).resolves.toEqual({
      id: 10,
      name: 'Josh Allen',
      pos: 'QB',
      nflTeam: 'BUF',
      sfRank: 1,
    });
    expect(mockPlayerFindFirst).toHaveBeenCalledWith({
      where: { id: 10, draftId: 1 },
      select: { id: true, name: true, pos: true, nflTeam: true, sfRank: true },
    });
    expect(mockAuctionResultFindFirst).toHaveBeenCalledWith({
      where: { playerId: 10, draftId: 1 },
    });
  });

  it('throws a 404 DraftMutationError when the player does not exist in the draft', async () => {
    mockPlayerFindFirst.mockResolvedValue(null);
    mockAuctionResultFindFirst.mockResolvedValue(null);
    await expect(requireAvailablePlayer(1, 999)).rejects.toMatchObject({
      message: 'Player not found in draft',
      status: 404,
    });
  });

  it('throws a 409 DraftMutationError when the player already has a winning bid', async () => {
    mockPlayerFindFirst.mockResolvedValue({
      id: 10,
      name: 'Josh Allen',
      pos: 'QB',
      nflTeam: 'BUF',
      sfRank: 1,
    });
    mockAuctionResultFindFirst.mockResolvedValue({ id: 9 });
    await expect(requireAvailablePlayer(1, 10)).rejects.toMatchObject({
      message: 'Player already has a winning bid',
      status: 409,
    });
  });
});

describe('isDuplicateAuctionResultError', () => {
  it('returns true for a P2002-shaped error', () => {
    expect(isDuplicateAuctionResultError({ code: 'P2002' })).toBe(true);
  });

  it('returns false for other errors', () => {
    expect(isDuplicateAuctionResultError(new Error('boom'))).toBe(false);
    expect(isDuplicateAuctionResultError({ code: 'P2025' })).toBe(false);
    expect(isDuplicateAuctionResultError(null)).toBe(false);
  });
});
