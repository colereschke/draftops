import { completeDraft } from '@/lib/actions';

const mockUpdate = jest.fn().mockResolvedValue({});
const mockFindFirst = jest.fn();
const mockRevalidatePath = jest.fn();
const mockAuth = jest.fn();

jest.mock('@/lib/db', () => ({
  prisma: {
    draft: {
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
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
const MOCK_DRAFT = { id: 3, name: "Cole's Draft 2025", ownerId: '123456789', status: 'ACTIVE' };

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockResolvedValue(MOCK_SESSION);
  mockFindFirst.mockResolvedValue(MOCK_DRAFT);
});

describe('completeDraft', () => {
  it('throws when called without a session', async () => {
    mockAuth.mockResolvedValue(null);
    await expect(completeDraft(3)).rejects.toThrow('Unauthorized');
  });

  it('throws when draft not found or not owned by user', async () => {
    mockFindFirst.mockResolvedValue(null);
    await expect(completeDraft(3)).rejects.toThrow('Draft not found');
  });

  it('updates draft status to COMPLETE', async () => {
    await completeDraft(3);
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 3 },
      data: { status: 'COMPLETE' },
    });
  });

  it('revalidates /drafts after marking complete', async () => {
    await completeDraft(3);
    expect(mockRevalidatePath).toHaveBeenCalledWith('/drafts');
  });
});
