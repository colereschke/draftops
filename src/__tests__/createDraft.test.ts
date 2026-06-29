import { createDraft } from '@/lib/actions';

const mockAuth = jest.fn();
const mockTransaction = jest.fn();
const mockRevalidatePath = jest.fn();
const mockRedirect = jest.fn();

// Mock tx client
const mockTxDraftCreate = jest.fn();
const mockTxDraftUpdate = jest.fn();
const mockTxTeamCreate = jest.fn();

jest.mock('@/auth', () => ({ auth: () => mockAuth() }));
jest.mock('next/navigation', () => ({ redirect: (...args: unknown[]) => mockRedirect(...args) }));
jest.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => mockRevalidatePath(...args),
}));
jest.mock('@/lib/db', () => ({
  prisma: {
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

const MOCK_SESSION = { user: { id: '123456789', name: 'Cole' } };

const VALID_INPUT = {
  name: "Cole's Draft 2025",
  budgetPerTeam: 1000,
  teams: [
    { handle: 'coreschke', displayName: 'Cole', isMine: true },
    { handle: 'team2', displayName: 'Team Two', isMine: false },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockResolvedValue(MOCK_SESSION);
  mockTxDraftCreate.mockResolvedValue({ id: 5 });
  mockTxTeamCreate
    .mockResolvedValueOnce({ id: 10, handle: 'coreschke' })
    .mockResolvedValueOnce({ id: 11, handle: 'team2' });
  mockTxDraftUpdate.mockResolvedValue({});
  mockTransaction.mockImplementation((callback) =>
    callback({
      draft: { create: mockTxDraftCreate, update: mockTxDraftUpdate },
      team: { create: mockTxTeamCreate },
    }),
  );
});

describe('createDraft', () => {
  it('throws when called without a session', async () => {
    mockAuth.mockResolvedValue(null);
    await expect(createDraft(VALID_INPUT)).rejects.toThrow('Unauthorized');
  });

  it('throws when handles contain duplicates', async () => {
    await expect(
      createDraft({
        ...VALID_INPUT,
        teams: [
          { handle: 'dup', displayName: '', isMine: true },
          { handle: 'dup', displayName: '', isMine: false },
        ],
      }),
    ).rejects.toThrow('Duplicate handles');
  });

  it('throws when no team is marked as mine', async () => {
    await expect(
      createDraft({
        ...VALID_INPUT,
        teams: VALID_INPUT.teams.map((t) => ({ ...t, isMine: false })),
      }),
    ).rejects.toThrow('No team marked as mine');
  });

  it('creates the draft inside the transaction', async () => {
    await createDraft(VALID_INPUT);
    expect(mockTxDraftCreate).toHaveBeenCalledWith({
      data: { name: "Cole's Draft 2025", ownerId: '123456789', status: 'ACTIVE' },
    });
  });

  it('creates all teams with correct budget scoped to the draft', async () => {
    await createDraft(VALID_INPUT);
    expect(mockTxTeamCreate).toHaveBeenCalledTimes(2);
    expect(mockTxTeamCreate).toHaveBeenCalledWith({
      data: { handle: 'coreschke', displayName: 'Cole', budget: 1000, draftId: 5 },
    });
  });

  it('sets ownerTeamId to the "mine" team', async () => {
    await createDraft(VALID_INPUT);
    expect(mockTxDraftUpdate).toHaveBeenCalledWith({
      where: { id: 5 },
      data: { ownerTeamId: 10 },
    });
  });

  it('coerces blank displayName to the handle', async () => {
    await createDraft({
      ...VALID_INPUT,
      teams: [
        { handle: 'coreschke', displayName: '  ', isMine: true },
        { handle: 'team2', displayName: '', isMine: false },
      ],
    });
    expect(mockTxTeamCreate).toHaveBeenCalledWith({
      data: { handle: 'coreschke', displayName: 'coreschke', budget: 1000, draftId: 5 },
    });
  });

  it('redirects to /draft/[id] after creation', async () => {
    await createDraft(VALID_INPUT);
    expect(mockRedirect).toHaveBeenCalledWith('/draft/5');
  });
});
