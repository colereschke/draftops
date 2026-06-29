/**
 * @jest-environment node
 */
import { GET } from '@/app/api/draft/[draftId]/nomination-data/route';
import { NextRequest } from 'next/server';

const mockAuth = jest.fn();
const mockGetDraft = jest.fn();

jest.mock('@/auth', () => ({
  auth: () => mockAuth(),
}));

jest.mock('@/lib/draft', () => ({
  getDraft: (...args: unknown[]) => mockGetDraft(...args),
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
const MOCK_PARAMS = { params: Promise.resolve({ draftId: '1' }) };

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockResolvedValue(MOCK_SESSION);
  mockGetDraft.mockResolvedValue(MOCK_DRAFT);
});

describe('GET /api/draft/[draftId]/nomination-data', () => {
  it('returns 401 without a session', async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET(new NextRequest('http://localhost/'), MOCK_PARAMS);
    expect(res.status).toBe(401);
  });

  it('returns 404 when no draft found for user', async () => {
    mockGetDraft.mockResolvedValue(null);
    const res = await GET(new NextRequest('http://localhost/'), MOCK_PARAMS);
    expect(res.status).toBe(404);
  });

  it('returns 200 with valid session and draft', async () => {
    const res = await GET(new NextRequest('http://localhost/'), MOCK_PARAMS);
    expect(res.status).toBe(200);
  });

  it('includes ownerHandle in the response', async () => {
    const res = await GET(new NextRequest('http://localhost/'), MOCK_PARAMS);
    const body = await res.json();
    expect(body.ownerHandle).toBe('coreschke');
  });

  it('returns null ownerHandle when ownerTeam is not set', async () => {
    mockGetDraft.mockResolvedValue({ ...MOCK_DRAFT, ownerTeam: null });
    const res = await GET(new NextRequest('http://localhost/'), MOCK_PARAMS);
    const body = await res.json();
    expect(body.ownerHandle).toBeNull();
  });
});
