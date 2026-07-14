/**
 * @jest-environment node
 */
import { POST, DELETE } from '@/app/api/draft/[draftId]/nominated/route';
import { NextRequest } from 'next/server';

const mockAuth = jest.fn();
const mockGetDraft = jest.fn();
const mockUpsert = jest.fn();
const mockDelete = jest.fn();
const mockPlayerFindFirst = jest.fn();

jest.mock('@/auth', () => ({ auth: () => mockAuth() }));
jest.mock('@/lib/draft', () => ({
  getDraft: (...args: unknown[]) => mockGetDraft(...args),
}));
jest.mock('@/lib/db', () => ({
  prisma: {
    nominatedPlayer: {
      upsert: (...args: unknown[]) => mockUpsert(...args),
      delete: (...args: unknown[]) => mockDelete(...args),
    },
    player: {
      findFirst: (...args: unknown[]) => mockPlayerFindFirst(...args),
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
  return new NextRequest('http://localhost/api/draft/1/nominated', {
    method,
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockResolvedValue(MOCK_SESSION);
  mockGetDraft.mockResolvedValue(MOCK_DRAFT);
  mockPlayerFindFirst.mockResolvedValue({ id: 10, name: 'Josh Allen' });
  mockUpsert.mockResolvedValue({ playerId: 10, playerName: 'Josh Allen', draftId: 1 });
});

describe('POST /api/draft/[draftId]/nominated', () => {
  it('returns 401 without session', async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST(makeRequest({ playerId: 10 }), MOCK_PARAMS);
    expect(res.status).toBe(401);
  });

  it('returns 404 when no draft found', async () => {
    mockGetDraft.mockResolvedValue(null);
    const res = await POST(makeRequest({ playerId: 10 }), MOCK_PARAMS);
    expect(res.status).toBe(404);
  });

  it('returns 400 without playerId', async () => {
    const res = await POST(makeRequest({}), MOCK_PARAMS);
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'playerId required' });
  });

  it('returns 404 when playerId is outside the draft', async () => {
    mockPlayerFindFirst.mockResolvedValue(null);
    const res = await POST(makeRequest({ playerId: 10 }), MOCK_PARAMS);
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: 'Player not found' });
  });

  it('upserts nominated entry scoped to playerId and draftId', async () => {
    await POST(makeRequest({ playerId: 10 }), MOCK_PARAMS);
    expect(mockPlayerFindFirst).toHaveBeenCalledWith({
      where: { id: 10, draftId: 1 },
      select: { id: true, name: true },
    });
    expect(mockUpsert).toHaveBeenCalledWith({
      where: { playerId_draftId: { playerId: 10, draftId: 1 } },
      create: { playerId: 10, playerName: 'Josh Allen', draftId: 1 },
      update: { playerName: 'Josh Allen' },
    });
  });
});

describe('DELETE /api/draft/[draftId]/nominated', () => {
  it('returns 401 without session', async () => {
    mockAuth.mockResolvedValue(null);
    const res = await DELETE(makeRequest({ playerId: 10 }, 'DELETE'), MOCK_PARAMS);
    expect(res.status).toBe(401);
  });

  it('returns 404 when no draft found', async () => {
    mockGetDraft.mockResolvedValue(null);
    const res = await DELETE(makeRequest({ playerId: 10 }, 'DELETE'), MOCK_PARAMS);
    expect(res.status).toBe(404);
  });

  it('deletes nominated entry scoped to playerId and draftId', async () => {
    const res = await DELETE(makeRequest({ playerId: 10 }, 'DELETE'), MOCK_PARAMS);
    expect(res.status).toBe(200);
    expect(mockDelete).toHaveBeenCalledWith({
      where: { playerId_draftId: { playerId: 10, draftId: 1 } },
    });
  });
});
