/**
 * @jest-environment node
 */
import { GET as jsonGet } from '@/app/api/draft/[draftId]/export/json/route';
import { GET as csvGet } from '@/app/api/draft/[draftId]/export/csv/route';
import { NextRequest } from 'next/server';

const mockAuth = jest.fn();
const mockGetDraft = jest.fn();
const mockAuctionFindMany = jest.fn();
const mockAuditFindMany = jest.fn();
const mockSnapshotFindUnique = jest.fn();

jest.mock('@/auth', () => ({ auth: () => mockAuth() }));
jest.mock('@/lib/draft', () => ({ getDraft: (...args: unknown[]) => mockGetDraft(...args) }));
jest.mock('@/lib/db', () => ({
  prisma: {
    auctionResult: { findMany: (...args: unknown[]) => mockAuctionFindMany(...args) },
    bidAuditEvent: { findMany: (...args: unknown[]) => mockAuditFindMany(...args) },
    draftCompletionSnapshot: {
      findUnique: (...args: unknown[]) => mockSnapshotFindUnique(...args),
    },
  },
}));

const PARAMS = { params: Promise.resolve({ draftId: '4' }) };
const REQUEST = new NextRequest('http://localhost/api/draft/4/export/json');
const BID = {
  id: 12,
  draftId: 4,
  playerId: 10,
  player: 'Josh Allen',
  position: 'QB',
  nflTeam: 'BUF',
  price: 120,
  sfRank: 1,
  notes: null,
  teamId: 7,
  createdAt: new Date('2026-07-21T12:00:00.000Z'),
  updatedAt: new Date('2026-07-21T13:00:00.000Z'),
  deletedAt: null,
  supersededAt: null,
  team: { id: 7, handle: 'coreschke', displayName: 'Cole' },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.mockResolvedValue({ user: { id: 'owner-1' } });
  mockGetDraft.mockResolvedValue({
    id: 4,
    name: 'Startup',
    status: 'ACTIVE',
    budget: 1000,
    teamCount: 12,
    rosterSize: 30,
    playerValueSourceBudget: 1000,
    startingLineup: { QB: 1, RB: 2 },
    scoringSettings: { ppr: 1 },
    targetRoster: { QB: 3, RB: 8 },
    futurePickAuctionMode: 'PACKAGES',
    sleeperLeagueId: 'sleeper-league',
    activeProjectionValueSetId: 5,
  });
  mockAuctionFindMany.mockResolvedValue([BID]);
  mockAuditFindMany.mockResolvedValue([]);
  mockSnapshotFindUnique.mockResolvedValue(null);
});

describe('draft export routes', () => {
  it('returns 401 without a session', async () => {
    mockAuth.mockResolvedValue(null);

    const response = await jsonGet(REQUEST, PARAMS);

    expect(response.status).toBe(401);
    expect(mockGetDraft).not.toHaveBeenCalled();
  });

  it('returns 404 when the requested draft is not owned by the session user', async () => {
    mockGetDraft.mockResolvedValue(null);

    const response = await jsonGet(REQUEST, PARAMS);

    expect(response.status).toBe(404);
    expect(mockAuctionFindMany).not.toHaveBeenCalled();
  });

  it('exports JSON with no-store attachment headers and ordered audit history', async () => {
    const response = await jsonGet(REQUEST, PARAMS);

    expect(mockAuctionFindMany).toHaveBeenCalledWith({
      where: { draftId: 4, deletedAt: null },
      include: { team: { select: { id: true, handle: true, displayName: true } } },
      orderBy: { id: 'asc' },
    });
    expect(mockAuditFindMany).toHaveBeenCalledWith({
      where: { draftId: 4 },
      orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
    });
    await expect(response.json()).resolves.toMatchObject({
      draft: {
        teamCount: 12,
        rosterSize: 30,
        playerValueSourceBudget: 1000,
        startingLineup: { QB: 1, RB: 2 },
        scoringSettings: { ppr: 1 },
        targetRoster: { QB: 3, RB: 8 },
        futurePickAuctionMode: 'PACKAGES',
        sleeperLeagueId: 'sleeper-league',
        activeProjectionValueSetId: 5,
      },
    });
  });

  it('exports active bids as a no-store CSV attachment', async () => {
    const response = await csvGet(REQUEST, PARAMS);

    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('content-disposition')).toMatch(
      /^attachment; filename="draft-4-\d{4}-\d{2}-\d{2}\.csv"$/,
    );
    await expect(response.text()).resolves.toContain('Josh Allen');
    expect(mockAuditFindMany).not.toHaveBeenCalled();
    expect(mockSnapshotFindUnique).not.toHaveBeenCalled();
  });
});
