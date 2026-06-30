import { logBid, updateBid, deleteBid } from '@/lib/actions';

const mockCreate = jest.fn().mockResolvedValue({});
const mockUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
const mockDeleteMany = jest.fn().mockResolvedValue({ count: 1 });
const mockNomDeleteMany = jest.fn().mockResolvedValue({});
const mockTeamFindFirst = jest.fn();
const mockRevalidatePath = jest.fn();
const mockAuth = jest.fn();
const mockGetDraft = jest.fn();

jest.mock('@/lib/db', () => ({
  prisma: {
    auctionResult: {
      create: (...args: unknown[]) => mockCreate(...args),
      updateMany: (...args: unknown[]) => mockUpdateMany(...args),
      deleteMany: (...args: unknown[]) => mockDeleteMany(...args),
    },
    nominatedPlayer: {
      deleteMany: (...args: unknown[]) => mockNomDeleteMany(...args),
    },
    team: {
      findFirst: (...args: unknown[]) => mockTeamFindFirst(...args),
    },
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
};

const BID_DATA = {
  player: 'Josh Allen',
  position: 'QB',
  nflTeam: 'BUF',
  price: 120,
  sfRank: 1,
  teamId: 3,
  draftId: 1,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockResolvedValue(MOCK_SESSION);
  mockGetDraft.mockResolvedValue(MOCK_DRAFT);
  mockTeamFindFirst.mockResolvedValue({ id: 3 });
});

describe('logBid', () => {
  it('inserts a bid record with all fields including draftId', async () => {
    await logBid(BID_DATA);
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

  it('throws when teamId does not belong to the draft', async () => {
    mockTeamFindFirst.mockResolvedValue(null);
    await expect(logBid(BID_DATA)).rejects.toThrow('Team not found in draft');
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

  it('throws when teamId does not belong to the draft', async () => {
    mockTeamFindFirst.mockResolvedValue(null);
    await expect(updateBid({ id: 5, price: 95, teamId: 2, draftId: 1 })).rejects.toThrow(
      'Team not found in draft',
    );
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
});
