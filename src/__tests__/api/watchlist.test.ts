/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';
import { POST, DELETE } from '@/app/api/watchlist/route';

const mockAuth = jest.fn();
const mockUpsert = jest.fn().mockResolvedValue({ playerName: 'Josh Allen' });
const mockDelete = jest.fn().mockResolvedValue({});

jest.mock('@/auth', () => ({
  auth: () => mockAuth(),
}));

jest.mock('@/lib/db', () => ({
  prisma: {
    playerWatchlist: {
      upsert: (...args: unknown[]) => mockUpsert(...args),
      delete: (...args: unknown[]) => mockDelete(...args),
    },
  },
}));

const MOCK_SESSION = { user: { id: '123456789', name: 'Cole' } };

function makeRequest(method: string, body: unknown) {
  return new NextRequest(`http://localhost/api/watchlist`, {
    method,
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockResolvedValue(MOCK_SESSION);
});

describe('POST /api/watchlist', () => {
  it('returns 401 without a session', async () => {
    mockAuth.mockResolvedValue(null);
    const res = await POST(makeRequest('POST', { playerName: 'Josh Allen' }));
    expect(res.status).toBe(401);
  });

  it('upserts and returns playerName when authenticated', async () => {
    const res = await POST(makeRequest('POST', { playerName: 'Josh Allen' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ playerName: 'Josh Allen' });
  });

  it('returns 400 when playerName is missing', async () => {
    const res = await POST(makeRequest('POST', {}));
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/watchlist', () => {
  it('returns 401 without a session', async () => {
    mockAuth.mockResolvedValue(null);
    const res = await DELETE(makeRequest('DELETE', { playerName: 'Josh Allen' }));
    expect(res.status).toBe(401);
  });

  it('deletes and returns ok when authenticated', async () => {
    const res = await DELETE(makeRequest('DELETE', { playerName: 'Josh Allen' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('returns 400 when playerName is missing', async () => {
    const res = await DELETE(makeRequest('DELETE', {}));
    expect(res.status).toBe(400);
  });
});
