/**
 * @jest-environment node
 */
import { POST, DELETE } from '@/app/api/draft/[draftId]/watchlist/route';
import { NextRequest } from 'next/server';

const mockAuth = jest.fn();
const mockGetDraft = jest.fn();
const mockWithActiveOwnedDraftMutation = jest.fn();
const mockUpsert = jest.fn();
const mockDelete = jest.fn();
const mockDeleteMany = jest.fn();
const mockFindMany = jest.fn();
const mockPlayerFindFirst = jest.fn();
const mockAuctionResultFindFirst = jest.fn();

jest.mock('@/auth', () => ({ auth: () => mockAuth() }));
jest.mock('@/lib/draft', () => ({
  getDraft: (...args: unknown[]) => mockGetDraft(...args),
}));
jest.mock('@/lib/draftMutation', () => ({
  ...jest.requireActual('@/lib/draftMutation'),
  withActiveOwnedDraftMutation: (...args: unknown[]) => mockWithActiveOwnedDraftMutation(...args),
}));
jest.mock('@/lib/db', () => ({
  prisma: {
    playerWatchlist: {
      upsert: (...args: unknown[]) => mockUpsert(...args),
      delete: (...args: unknown[]) => mockDelete(...args),
      deleteMany: (...args: unknown[]) => mockDeleteMany(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
    player: {
      findFirst: (...args: unknown[]) => mockPlayerFindFirst(...args),
    },
    auctionResult: {
      findFirst: (...args: unknown[]) => mockAuctionResultFindFirst(...args),
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

function makeMalformedRequest(): NextRequest {
  return new NextRequest('http://localhost/api/draft/1/watchlist', {
    method: 'POST',
    body: '{',
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockResolvedValue(MOCK_SESSION);
  mockGetDraft.mockResolvedValue(MOCK_DRAFT);
  mockPlayerFindFirst.mockResolvedValue({ id: 10, name: 'Josh Allen' });
  mockAuctionResultFindFirst.mockResolvedValue(null);
  mockUpsert.mockResolvedValue({ playerId: 10, playerName: 'Josh Allen', draftId: 1 });
  mockDeleteMany.mockResolvedValue({ count: 1 });
  mockWithActiveOwnedDraftMutation.mockImplementation(
    async (
      _userId: string,
      _draftId: number,
      operation: (
        tx: (typeof import('@/lib/db'))['prisma'],
        draft: typeof MOCK_DRAFT,
      ) => Promise<unknown>,
    ) => {
      try {
        return {
          ok: true,
          data: await operation((await import('@/lib/db')).prisma, MOCK_DRAFT),
        };
      } catch (error) {
        if (error instanceof (await import('@/lib/draftMutation')).DraftMutationFailure) {
          return { ok: false, code: error.code };
        }
        throw error;
      }
    },
  );
});

describe('POST /api/draft/[draftId]/watchlist', () => {
  it('returns 401 without session', async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST(makeRequest({ playerId: 10 }), MOCK_PARAMS);
    expect(res.status).toBe(401);
  });

  it('returns 404 when no draft found', async () => {
    mockGetDraft.mockResolvedValue(null);
    mockWithActiveOwnedDraftMutation.mockResolvedValue({ ok: false, code: 'NOT_FOUND' });
    const res = await POST(makeRequest({ playerId: 10 }), MOCK_PARAMS);
    expect(res.status).toBe(404);
  });

  it('returns a stable conflict without writing when the draft is complete', async () => {
    mockGetDraft.mockResolvedValue({ ...MOCK_DRAFT, status: 'COMPLETE' });
    mockWithActiveOwnedDraftMutation.mockResolvedValue({
      ok: false,
      code: 'DRAFT_COMPLETE',
    });

    const res = await POST(makeRequest({ playerId: 10 }), MOCK_PARAMS);

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({ ok: false, code: 'DRAFT_COMPLETE' });
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('returns 400 without playerId', async () => {
    const res = await POST(makeRequest({}), MOCK_PARAMS);
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ ok: false, code: 'INVALID_INPUT' });
  });

  it('returns 400 for malformed JSON', async () => {
    const res = await POST(makeMalformedRequest(), MOCK_PARAMS);
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ ok: false, code: 'INVALID_INPUT' });
  });

  it('returns 404 when playerId is outside the draft', async () => {
    mockPlayerFindFirst.mockResolvedValue(null);
    const res = await POST(makeRequest({ playerId: 10 }), MOCK_PARAMS);
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ ok: false, code: 'PLAYER_NOT_FOUND' });
  });

  it('upserts watchlist entry scoped to playerId and draftId', async () => {
    await POST(makeRequest({ playerId: 10 }), MOCK_PARAMS);
    expect(mockPlayerFindFirst).toHaveBeenCalledWith({
      where: { id: 10, draftId: 1 },
      select: { id: true, name: true },
    });
    expect(mockAuctionResultFindFirst).toHaveBeenCalledWith({
      where: { playerId: 10, draftId: 1, deletedAt: null },
      select: { id: true },
    });
    expect(mockUpsert).toHaveBeenCalledWith({
      where: { playerId_draftId: { playerId: 10, draftId: 1 } },
      create: { playerId: 10, playerName: 'Josh Allen', draftId: 1 },
      update: { playerName: 'Josh Allen' },
    });
  });
});

describe('DELETE /api/draft/[draftId]/watchlist', () => {
  it('returns 401 without session', async () => {
    mockAuth.mockResolvedValue(null);
    const res = await DELETE(makeRequest({ playerId: 10 }, 'DELETE'), MOCK_PARAMS);
    expect(res.status).toBe(401);
  });

  it('returns 404 when no draft found', async () => {
    mockGetDraft.mockResolvedValue(null);
    mockWithActiveOwnedDraftMutation.mockResolvedValue({ ok: false, code: 'NOT_FOUND' });
    const res = await DELETE(makeRequest({ playerId: 10 }, 'DELETE'), MOCK_PARAMS);
    expect(res.status).toBe(404);
  });

  it('returns a stable conflict without deleting when the draft is complete', async () => {
    mockGetDraft.mockResolvedValue({ ...MOCK_DRAFT, status: 'COMPLETE' });
    mockWithActiveOwnedDraftMutation.mockResolvedValue({
      ok: false,
      code: 'DRAFT_COMPLETE',
    });

    const res = await DELETE(makeRequest({ playerId: 10 }, 'DELETE'), MOCK_PARAMS);

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({ ok: false, code: 'DRAFT_COMPLETE' });
    expect(mockDelete).not.toHaveBeenCalled();
    expect(mockDeleteMany).not.toHaveBeenCalled();
  });

  it('deletes watchlist entry scoped to playerId and draftId', async () => {
    const res = await DELETE(makeRequest({ playerId: 10 }, 'DELETE'), MOCK_PARAMS);
    expect(res.status).toBe(200);
    expect(mockDeleteMany).toHaveBeenCalledWith({
      where: { playerId: 10, draftId: 1 },
    });
  });
});
