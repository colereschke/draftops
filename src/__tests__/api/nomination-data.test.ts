/**
 * @jest-environment node
 */
import { GET } from '@/app/api/nomination-data/route';

const mockAuth = jest.fn();

jest.mock('@/auth', () => ({
  auth: () => mockAuth(),
}));

jest.mock('@/lib/db', () => ({
  prisma: {
    team: { findMany: jest.fn().mockResolvedValue([]) },
    playerWatchlist: { findMany: jest.fn().mockResolvedValue([]) },
    nominatedPlayer: { findMany: jest.fn().mockResolvedValue([]) },
  },
}));

const MOCK_SESSION = { user: { id: '123456789', name: 'Cole' } };

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockResolvedValue(MOCK_SESSION);
});

describe('GET /api/nomination-data', () => {
  it('returns 401 without a session', async () => {
    mockAuth.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('returns 200 with valid session', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
  });
});
