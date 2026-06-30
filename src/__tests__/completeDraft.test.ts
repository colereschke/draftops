import { completeDraft } from '@/lib/actions';

const mockUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
const mockRevalidatePath = jest.fn();
const mockAuth = jest.fn();

jest.mock('@/lib/db', () => ({
  prisma: {
    draft: {
      updateMany: (...args: unknown[]) => mockUpdateMany(...args),
    },
  },
}));

jest.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => mockRevalidatePath(...args),
}));

jest.mock('@/auth', () => ({
  auth: () => mockAuth(),
}));

const MOCK_SESSION = { user: { id: '123456789', name: 'Cole' } };

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockResolvedValue(MOCK_SESSION);
});

describe('completeDraft', () => {
  it('throws when called without a session', async () => {
    mockAuth.mockResolvedValue(null);
    await expect(completeDraft(3)).rejects.toThrow('Unauthorized');
  });

  it('throws when draft not found or not owned by user', async () => {
    mockUpdateMany.mockResolvedValueOnce({ count: 0 });
    await expect(completeDraft(3)).rejects.toThrow('Draft not found');
  });

  it('updates draft status to COMPLETE scoped to the owner', async () => {
    await completeDraft(3);
    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: { id: 3, ownerId: '123456789' },
      data: { status: 'COMPLETE' },
    });
  });

  it('revalidates /drafts after marking complete', async () => {
    await completeDraft(3);
    expect(mockRevalidatePath).toHaveBeenCalledWith('/drafts');
  });
});
