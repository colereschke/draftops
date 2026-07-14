import { logBid, updateBid, deleteBid } from '@/lib/actions';

const mockCreate = jest.fn().mockResolvedValue({});
const mockUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
const mockDeleteMany = jest.fn().mockResolvedValue({ count: 1 });
const mockNomDeleteMany = jest.fn().mockResolvedValue({});
const mockTeamFindFirst = jest.fn();
const mockPlayerFindUnique = jest.fn();
const mockAuctionResultFindFirst = jest.fn();
const mockRevalidatePath = jest.fn();
const mockAuth = jest.fn();
const mockGetDraft = jest.fn();

jest.mock('@/lib/db', () => ({
  prisma: {
    auctionResult: {
      create: (...args: unknown[]) => mockCreate(...args),
      updateMany: (...args: unknown[]) => mockUpdateMany(...args),
      deleteMany: (...args: unknown[]) => mockDeleteMany(...args),
      findFirst: (...args: unknown[]) => mockAuctionResultFindFirst(...args),
    },
    nominatedPlayer: {
      deleteMany: (...args: unknown[]) => mockNomDeleteMany(...args),
    },
    team: {
      findFirst: (...args: unknown[]) => mockTeamFindFirst(...args),
    },
    player: {
      findUnique: (...args: unknown[]) => mockPlayerFindUnique(...args),
    },
    $transaction: (cb: (tx: unknown) => unknown) =>
      cb({
        auctionResult: { create: mockCreate },
        nominatedPlayer: { deleteMany: mockNomDeleteMany },
      }),
  },
}));

jest.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => mockRevalidatePath(...args),
}));

jest.mock('@/auth', () => ({
  auth: () => mockAuth(),
}));

jest.mock('@/lib/draft', () => ({
  getDraft: (...args: unknown[]) => mockGetDraft(...args),
}));

const MOCK_SESSION = { user: { id: '123456789', name: 'Cole' } };
const MOCK_DRAFT = {
  id: 1,
  name: "Cole's Draft 2025",
  ownerId: '123456789',
  ownerTeamId: 7,
  ownerTeam: null,
  status: 'ACTIVE',
};
const MOCK_COMPLETE_DRAFT = { ...MOCK_DRAFT, status: 'COMPLETE' };

const MOCK_PLAYER = { name: 'Josh Allen', pos: 'QB', nflTeam: 'BUF', sfRank: 1 };

const BID_DATA = {
  player: 'Josh Allen',
  price: 120,
  teamId: 3,
  draftId: 1,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockResolvedValue(MOCK_SESSION);
  mockGetDraft.mockResolvedValue(MOCK_DRAFT);
  mockTeamFindFirst.mockResolvedValue({ id: 3 });
  mockPlayerFindUnique.mockResolvedValue(MOCK_PLAYER);
  mockAuctionResultFindFirst.mockResolvedValue(null);
});

describe('logBid', () => {
  it('resolves the player from the database and inserts a bid using DB-derived fields', async () => {
    await logBid(BID_DATA);
    expect(mockPlayerFindUnique).toHaveBeenCalledWith({
      where: { name_draftId: { name: 'Josh Allen', draftId: 1 } },
    });
    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        player: 'Josh Allen',
        position: 'QB',
        nflTeam: 'BUF',
        price: 120,
        sfRank: 1,
        teamId: 3,
        draftId: 1,
      },
    });
  });

  it('ignores extra client-supplied fields and uses the DB record instead', async () => {
    const craftedPayload = { ...BID_DATA, position: 'RB', nflTeam: 'ZZZ', sfRank: 999 };
    await logBid(craftedPayload);
    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ position: 'QB', nflTeam: 'BUF', sfRank: 1 }),
    });
  });

  it('calls revalidatePath scoped to the draft', async () => {
    await logBid(BID_DATA);
    expect(mockRevalidatePath).toHaveBeenCalledWith('/draft/1');
  });

  it('clears nomination for the player scoped to the draft', async () => {
    await logBid(BID_DATA);
    expect(mockNomDeleteMany).toHaveBeenCalledWith({
      where: { playerName: 'Josh Allen', draftId: 1 },
    });
  });

  it('throws when called without a session', async () => {
    mockAuth.mockResolvedValue(null);
    await expect(logBid(BID_DATA)).rejects.toThrow('Unauthorized');
  });

  it('throws when no draft found for user', async () => {
    mockGetDraft.mockResolvedValue(null);
    await expect(logBid(BID_DATA)).rejects.toThrow('No draft found');
  });

  it('throws when the draft is not ACTIVE', async () => {
    mockGetDraft.mockResolvedValue(MOCK_COMPLETE_DRAFT);
    await expect(logBid(BID_DATA)).rejects.toThrow('Draft is not active');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('throws when teamId does not belong to the draft', async () => {
    mockTeamFindFirst.mockResolvedValue(null);
    await expect(logBid(BID_DATA)).rejects.toThrow('Team not found in draft');
  });

  it('throws when the player does not exist in the draft', async () => {
    mockPlayerFindUnique.mockResolvedValue(null);
    await expect(logBid(BID_DATA)).rejects.toThrow('Player not found in draft');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it.each([0, -5, 4.5])('rejects a non-positive/non-integer price (%p)', async (price) => {
    await expect(logBid({ ...BID_DATA, price })).rejects.toThrow(
      'price must be a positive integer',
    );
    expect(mockTeamFindFirst).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('surfaces a clear conflict error on a duplicate insert and leaves nomination state unchanged', async () => {
    mockCreate.mockRejectedValueOnce({ code: 'P2002' });
    await expect(logBid(BID_DATA)).rejects.toThrow('Player already has a winning bid');
    expect(mockNomDeleteMany).not.toHaveBeenCalled();
  });
});

describe('updateBid', () => {
  it('updates price and teamId scoped to the draft', async () => {
    await updateBid({ id: 5, price: 95, teamId: 2, draftId: 1 });
    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { id: 5, draftId: 1 },
      data: { price: 95, teamId: 2 },
    });
  });

  it('calls revalidatePath scoped to the draft', async () => {
    await updateBid({ id: 5, price: 95, teamId: 2, draftId: 1 });
    expect(mockRevalidatePath).toHaveBeenCalledWith('/draft/1');
  });

  it('throws when called without a session', async () => {
    mockAuth.mockResolvedValue(null);
    await expect(updateBid({ id: 5, price: 95, teamId: 2, draftId: 1 })).rejects.toThrow(
      'Unauthorized',
    );
  });

  it('throws when no draft found for user', async () => {
    mockGetDraft.mockResolvedValue(null);
    await expect(updateBid({ id: 5, price: 95, teamId: 2, draftId: 1 })).rejects.toThrow(
      'No draft found',
    );
  });

  it('throws when the draft is not ACTIVE', async () => {
    mockGetDraft.mockResolvedValue(MOCK_COMPLETE_DRAFT);
    await expect(updateBid({ id: 5, price: 95, teamId: 2, draftId: 1 })).rejects.toThrow(
      'Draft is not active',
    );
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  it('throws when teamId does not belong to the draft', async () => {
    mockTeamFindFirst.mockResolvedValue(null);
    await expect(updateBid({ id: 5, price: 95, teamId: 2, draftId: 1 })).rejects.toThrow(
      'Team not found in draft',
    );
  });

  it.each([0, -5, 4.5])('rejects a non-positive/non-integer price (%p)', async (price) => {
    await expect(updateBid({ id: 5, price, teamId: 2, draftId: 1 })).rejects.toThrow(
      'price must be a positive integer',
    );
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });
});

describe('deleteBid', () => {
  it('deletes the bid scoped to the draft', async () => {
    await deleteBid({ id: 7, draftId: 1 });
    expect(mockDeleteMany).toHaveBeenCalledWith({ where: { id: 7, draftId: 1 } });
  });

  it('calls revalidatePath scoped to the draft', async () => {
    await deleteBid({ id: 7, draftId: 1 });
    expect(mockRevalidatePath).toHaveBeenCalledWith('/draft/1');
  });

  it('throws when called without a session', async () => {
    mockAuth.mockResolvedValue(null);
    await expect(deleteBid({ id: 7, draftId: 1 })).rejects.toThrow('Unauthorized');
  });

  it('throws when no draft found for user', async () => {
    mockGetDraft.mockResolvedValue(null);
    await expect(deleteBid({ id: 7, draftId: 1 })).rejects.toThrow('No draft found');
  });

  it('throws when the draft is not ACTIVE', async () => {
    mockGetDraft.mockResolvedValue(MOCK_COMPLETE_DRAFT);
    await expect(deleteBid({ id: 7, draftId: 1 })).rejects.toThrow('Draft is not active');
    expect(mockDeleteMany).not.toHaveBeenCalled();
  });
});
