import { logBid, updateBid, deleteBid } from '@/lib/actions';

const mockCreate = jest.fn().mockResolvedValue({});
const mockUpdate = jest.fn().mockResolvedValue({});
const mockDelete = jest.fn().mockResolvedValue({});
const mockDeleteMany = jest.fn().mockResolvedValue({});
const mockRevalidatePath = jest.fn();

jest.mock('@/lib/db', () => ({
  prisma: {
    auctionResult: {
      create: (...args: unknown[]) => mockCreate(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
      delete: (...args: unknown[]) => mockDelete(...args),
    },
    nominatedPlayer: {
      deleteMany: (...args: unknown[]) => mockDeleteMany(...args),
    },
  },
}));

jest.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => mockRevalidatePath(...args),
}));

beforeEach(() => {
  jest.clearAllMocks();
});

describe('logBid', () => {
  it('inserts a bid record with all fields', async () => {
    await logBid({
      player: 'Josh Allen',
      position: 'QB',
      nflTeam: 'BUF',
      price: 120,
      sfRank: 1,
      teamId: 3,
    });

    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        player: 'Josh Allen',
        position: 'QB',
        nflTeam: 'BUF',
        price: 120,
        sfRank: 1,
        teamId: 3,
      },
    });
  });

  it('calls revalidatePath after insert', async () => {
    await logBid({
      player: 'Josh Allen',
      position: 'QB',
      nflTeam: 'BUF',
      price: 120,
      sfRank: 1,
      teamId: 3,
    });

    expect(mockRevalidatePath).toHaveBeenCalledWith('/');
  });
});

describe('updateBid', () => {
  it('updates price and teamId for the given id', async () => {
    await updateBid({ id: 5, price: 95, teamId: 2 });

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 5 },
      data: { price: 95, teamId: 2 },
    });
  });

  it('calls revalidatePath after update', async () => {
    await updateBid({ id: 5, price: 95, teamId: 2 });

    expect(mockRevalidatePath).toHaveBeenCalledWith('/');
  });
});

describe('deleteBid', () => {
  it('deletes the record for the given id', async () => {
    await deleteBid({ id: 7 });

    expect(mockDelete).toHaveBeenCalledWith({ where: { id: 7 } });
  });

  it('calls revalidatePath after delete', async () => {
    await deleteBid({ id: 7 });

    expect(mockRevalidatePath).toHaveBeenCalledWith('/');
  });
});
