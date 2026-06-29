/**
 * @jest-environment node
 */
import { POST, DELETE } from '@/app/api/nominated/route';
import { NextRequest } from 'next/server';

const mockAuth = jest.fn();
const mockGetDraftForUser = jest.fn();
const mockUpsert = jest.fn();
const mockDelete = jest.fn();

jest.mock('@/auth', () => ({ auth: () => mockAuth() }));
jest.mock('@/lib/draft', () => ({
  getDraftForUser: (...args: unknown[]) => mockGetDraftForUser(...args),
}));
jest.mock('@/lib/db', () => ({
  prisma: {
    nominatedPlayer: {
      upsert: (...args: unknown[]) => mockUpsert(...args),
      delete: (...args: unknown[]) => mockDelete(...args),
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

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/nominated', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockResolvedValue(MOCK_SESSION);
  mockGetDraftForUser.mockResolvedValue(MOCK_DRAFT);
  mockUpsert.mockResolvedValue({ playerName: 'Josh Allen', draftId: 1 });
});

describe('POST /api/nominated', () => {
  it('returns 401 without session', async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST(makeRequest({ playerName: 'Josh Allen' }));
    expect(res.status).toBe(401);
  });

  it('returns 404 when no draft found', async () => {
    mockGetDraftForUser.mockResolvedValue(null);
    const res = await POST(makeRequest({ playerName: 'Josh Allen' }));
    expect(res.status).toBe(404);
  });

  it('upserts nominated entry scoped to draftId', async () => {
    await POST(makeRequest({ playerName: 'Josh Allen' }));
    expect(mockUpsert).toHaveBeenCalledWith({
      where: { playerName: 'Josh Allen' },
      create: { playerName: 'Josh Allen', draftId: 1 },
      update: {},
    });
  });
});

describe('DELETE /api/nominated', () => {
  it('returns 401 without session', async () => {
    mockAuth.mockResolvedValue(null);
    const res = await DELETE(makeRequest({ playerName: 'Josh Allen' }));
    expect(res.status).toBe(401);
  });

  it('returns 404 when no draft found', async () => {
    mockGetDraftForUser.mockResolvedValue(null);
    const res = await DELETE(makeRequest({ playerName: 'Josh Allen' }));
    expect(res.status).toBe(404);
  });
});
