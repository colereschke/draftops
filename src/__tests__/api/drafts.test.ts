/**
 * @jest-environment node
 */
import { GET } from '@/app/api/drafts/route';

const mockAuth = jest.fn();
const mockGetActiveDraftsForUser = jest.fn();

jest.mock('@/auth', () => ({ auth: () => mockAuth() }));
jest.mock('@/lib/draft', () => ({
  getActiveDraftsForUser: (...args: unknown[]) => mockGetActiveDraftsForUser(...args),
}));

const MOCK_SESSION = { user: { id: '123456789', name: 'Cole' } };

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockResolvedValue(MOCK_SESSION);
  mockGetActiveDraftsForUser.mockResolvedValue([{ id: 1, name: "Cole's Draft 2025" }]);
});

describe('GET /api/drafts', () => {
  it('returns 401 without session', async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns active drafts for the user', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([{ id: 1, name: "Cole's Draft 2025" }]);
  });
});
