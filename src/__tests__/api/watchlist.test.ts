/**
 * @jest-environment node
 */
import { POST, DELETE } from '@/app/api/draft/[draftId]/watchlist/route';
import { NextRequest } from 'next/server';

const mockAuth = jest.fn();
const mockGetDraft = jest.fn();
const mockUpsert = jest.fn();
const mockDelete = jest.fn();
const mockFindMany = jest.fn();

jest.mock('@/auth', () => ({ auth: () => mockAuth() }));
jest.mock('@/lib/draft', () => ({
  getDraft: (...args: unknown[]) => mockGetDraft(...args),
}));
jest.mock('@/lib/db', () => ({
  prisma: {
    playerWatchlist: {
      upsert: (...args: unknown[]) => mockUpsert(...args),
      delete: (...args: unknown[]) => mockDelete(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
  },
}));

const MOCK_SESSION = { user: { id: '123456789', name: 'Cole' } };
const MOCK_DRAFT = {
  id: 1,
  name: "Cole's Draft 2025",
  ownerId: '123456789',
  ownerTeamId: 7,
  ownerTeam: null,
};
const MOCK_PARAMS = { params: Promise.resolve({ draftId: '1' }) };

function makeRequest(body: unknown, method = 'POST'): NextRequest {
  return new NextRequest('http://localhost/api/draft/1/watchlist', {
    method,
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockResolvedValue(MOCK_SESSION);
  mockGetDraft.mockResolvedValue(MOCK_DRAFT);
  mockUpsert.mockResolvedValue({ playerName: 'Josh Allen', draftId: 1 });
});

describe('POST /api/draft/[draftId]/watchlist', () => {
  it('returns 401 without session', async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST(makeRequest({ playerName: 'Josh Allen' }), MOCK_PARAMS);
    expect(res.status).toBe(401);
  });

  it('returns 404 when no draft found', async () => {
    mockGetDraft.mockResolvedValue(null);
    const res = await POST(makeRequest({ playerName: 'Josh Allen' }), MOCK_PARAMS);
    expect(res.status).toBe(404);
  });

  it('returns 400 without playerName', async () => {
    const res = await POST(makeRequest({}), MOCK_PARAMS);
    expect(res.status).toBe(400);
  });

  it('upserts watchlist entry scoped to draftId', async () => {
    await POST(makeRequest({ playerName: 'Josh Allen' }), MOCK_PARAMS);
    expect(mockUpsert).toHaveBeenCalledWith({
      where: { playerName_draftId: { playerName: 'Josh Allen', draftId: 1 } },
      create: { playerName: 'Josh Allen', draftId: 1 },
      update: {},
    });
  });
});

describe('DELETE /api/draft/[draftId]/watchlist', () => {
  it('returns 401 without session', async () => {
    mockAuth.mockResolvedValue(null);
    const res = await DELETE(makeRequest({ playerName: 'Josh Allen' }, 'DELETE'), MOCK_PARAMS);
    expect(res.status).toBe(401);
  });

  it('returns 404 when no draft found', async () => {
    mockGetDraft.mockResolvedValue(null);
    const res = await DELETE(makeRequest({ playerName: 'Josh Allen' }, 'DELETE'), MOCK_PARAMS);
    expect(res.status).toBe(404);
  });
});
