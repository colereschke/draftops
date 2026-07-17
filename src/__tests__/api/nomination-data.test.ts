/**
 * @jest-environment node
 */
import { GET } from '@/app/api/draft/[draftId]/nomination-data/route';
import {
  CANONICAL_STATS_PLAYERS,
  CANONICAL_STATS_TEAMS,
} from '@/__tests__/fixtures/draftTeamStats';
import { NextRequest } from 'next/server';

const mockAuth = jest.fn();
const mockGetDraft = jest.fn();
const mockTeamFindMany = jest.fn();
const mockWatchlistFindMany = jest.fn();
const mockNominatedFindMany = jest.fn();
const mockGetActiveDraftPlayers = jest.fn();

jest.mock('@/auth', () => ({
  auth: () => mockAuth(),
}));

jest.mock('@/lib/draft', () => ({
  getDraft: (...args: unknown[]) => mockGetDraft(...args),
}));

jest.mock('@/lib/activeDraftPlayers', () => ({
  getActiveDraftPlayers: (...args: unknown[]) => mockGetActiveDraftPlayers(...args),
}));

jest.mock('@/lib/db', () => ({
  prisma: {
    team: { findMany: (...args: unknown[]) => mockTeamFindMany(...args) },
    playerWatchlist: { findMany: (...args: unknown[]) => mockWatchlistFindMany(...args) },
    nominatedPlayer: { findMany: (...args: unknown[]) => mockNominatedFindMany(...args) },
  },
}));

const MOCK_SESSION = { user: { id: '123456789', name: 'Cole' } };
const MOCK_DRAFT = {
  id: 1,
  name: "Cole's Draft 2025",
  ownerId: '123456789',
  ownerTeamId: 7,
  ownerTeam: { id: 7, handle: 'coreschke', displayName: 'Cole' },
  rosterSize: 30,
  startingLineup: null,
  futurePickAuctionMode: 'PACKAGES',
  targetRoster: null,
};
const MOCK_PARAMS = { params: Promise.resolve({ draftId: '1' }) };

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockResolvedValue(MOCK_SESSION);
  mockGetDraft.mockResolvedValue(MOCK_DRAFT);
  mockTeamFindMany.mockResolvedValue([]);
  mockWatchlistFindMany.mockResolvedValue([]);
  mockNominatedFindMany.mockResolvedValue([]);
  mockGetActiveDraftPlayers.mockResolvedValue([]);
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

  it('uses canonical roster and spending policy for nomination stats', async () => {
    mockTeamFindMany.mockResolvedValue(
      CANONICAL_STATS_TEAMS.map((team) => ({
        ...team,
        results: team.results.map((result) => ({
          ...result,
          createdAt: new Date('2026-07-17T00:00:00Z'),
        })),
      })),
    );
    mockGetActiveDraftPlayers.mockResolvedValue(CANONICAL_STATS_PLAYERS);

    const response = await GET(new NextRequest('http://localhost/'), MOCK_PARAMS);
    const body = await response.json();

    expect(body.teamStats[0]).toMatchObject({
      spent: 480,
      remaining: 520,
      rosterCount: 2,
      rosterRemaining: 28,
      buyingPower: 492,
      pkgCount: 1,
      avgAge: 25,
    });
    expect(mockGetActiveDraftPlayers).toHaveBeenCalledWith(
      expect.objectContaining({
        draftId: 1,
        futurePickAuctionMode: 'packages',
        bids: expect.arrayContaining([
          expect.objectContaining({ player: 'Active QB', price: 200, teamHandle: 'manager' }),
        ]),
      }),
    );
  });
});
