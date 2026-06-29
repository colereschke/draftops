/**
 * @jest-environment node
 */
import { GET } from '@/app/api/nomination-data/route';

const mockAuth = jest.fn();
const mockGetDraftForUser = jest.fn();

jest.mock('@/auth', () => ({
  auth: () => mockAuth(),
}));

jest.mock('@/lib/draft', () => ({
  getDraftForUser: (...args: unknown[]) => mockGetDraftForUser(...args),
}));

jest.mock('@/lib/db', () => ({
  prisma: {
    team: { findMany: jest.fn().mockResolvedValue([]) },
    playerWatchlist: { findMany: jest.fn().mockResolvedValue([]) },
    nominatedPlayer: { findMany: jest.fn().mockResolvedValue([]) },
  },
}));

const MOCK_SESSION = { user: { id: '123456789', name: 'Cole' } };
const MOCK_DRAFT = {
  id: 1,
  name: "Cole's Draft 2025",
  ownerId: '123456789',
  ownerTeamId: 7,
  ownerTeam: { id: 7, handle: 'coreschke', displayName: 'Cole' },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockResolvedValue(MOCK_SESSION);
  mockGetDraftForUser.mockResolvedValue(MOCK_DRAFT);
});

describe('GET /api/nomination-data', () => {
  it('returns 401 without a session', async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns 404 when no draft found for user', async () => {
    mockGetDraftForUser.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(404);
  });

  it('returns 200 with valid session and draft', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
  });

  it('includes ownerHandle in the response', async () => {
    const res = await GET();
    const body = await res.json();
    expect(body.ownerHandle).toBe('coreschke');
  });

  it('returns null ownerHandle when ownerTeam is not set', async () => {
    mockGetDraftForUser.mockResolvedValue({ ...MOCK_DRAFT, ownerTeam: null });
    const res = await GET();
    const body = await res.json();
    expect(body.ownerHandle).toBeNull();
  });
});
