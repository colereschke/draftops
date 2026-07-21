import { completeDraft } from '@/lib/actions';

const mockUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
const mockRevalidatePath = jest.fn();
const mockAuth = jest.fn();
const mockCompleteOwnedDraft = jest.fn();

jest.mock('@/lib/db', () => ({
  getPrisma: () => ({
    draft: {
      updateMany: (...args: unknown[]) => mockUpdateMany(...args),
    },
  }),
}));

jest.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => mockRevalidatePath(...args),
}));

jest.mock('@/auth', () => ({
  auth: () => mockAuth(),
}));
jest.mock('@/lib/draftMutation', () => ({
  completeOwnedDraft: (...args: unknown[]) => mockCompleteOwnedDraft(...args),
}));

const MOCK_SESSION = { user: { id: '123456789', name: 'Cole' } };

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockResolvedValue(MOCK_SESSION);
  mockCompleteOwnedDraft.mockResolvedValue({ ok: true, data: null });
});

describe('completeDraft', () => {
  it('throws when called without a session', async () => {
    mockAuth.mockResolvedValue(null);
    await expect(completeDraft(3)).rejects.toThrow('Unauthorized');
  });

  it('throws when draft not found or not owned by user', async () => {
    mockCompleteOwnedDraft.mockResolvedValueOnce({ ok: false, code: 'NOT_FOUND' });
    await expect(completeDraft(3)).rejects.toThrow('Draft not found');
  });

  it('completes through the serialized draft mutation boundary', async () => {
    await completeDraft(3);
    expect(mockCompleteOwnedDraft).toHaveBeenCalledWith('123456789', 3);
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  it('revalidates /drafts after marking complete', async () => {
    await completeDraft(3);
    expect(mockRevalidatePath).toHaveBeenCalledWith('/drafts');
  });
});
