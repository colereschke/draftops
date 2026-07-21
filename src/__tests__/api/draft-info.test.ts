/**
 * @jest-environment node
 */
import { GET } from '@/app/api/draft/[draftId]/info/route';
import { NextRequest } from 'next/server';

const mockAuth = jest.fn();
const mockFindFirst = jest.fn();

jest.mock('@/auth', () => ({ auth: () => mockAuth() }));
jest.mock('@/lib/db', () => ({
  getPrisma: () => ({
    draft: { findFirst: (...args: unknown[]) => mockFindFirst(...args) },
  }),
}));

const MOCK_SESSION = { user: { id: '123456789', name: 'Cole' } };
const MOCK_PARAMS = { params: Promise.resolve({ draftId: '1' }) };

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockResolvedValue(MOCK_SESSION);
  mockFindFirst.mockResolvedValue({ id: 1, name: "Cole's Draft 2025", status: 'ACTIVE' });
});

describe('GET /api/draft/[draftId]/info', () => {
  it('returns 401 without session', async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET(new NextRequest('http://localhost/'), MOCK_PARAMS);
    expect(res.status).toBe(401);
  });

  it('returns 404 when draft not found or not owned', async () => {
    mockFindFirst.mockResolvedValue(null);
    const res = await GET(new NextRequest('http://localhost/'), MOCK_PARAMS);
    expect(res.status).toBe(404);
  });

  it('returns draft id, name, and status', async () => {
    const res = await GET(new NextRequest('http://localhost/'), MOCK_PARAMS);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ id: 1, name: "Cole's Draft 2025", status: 'ACTIVE' });
  });

  it('returns COMPLETE draft (switcher chip must work for finished drafts)', async () => {
    mockFindFirst.mockResolvedValue({ id: 1, name: 'Old Draft', status: 'COMPLETE' });
    const res = await GET(new NextRequest('http://localhost/'), MOCK_PARAMS);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('COMPLETE');
  });
});
