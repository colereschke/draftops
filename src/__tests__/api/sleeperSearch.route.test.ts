/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/rankings/sleeper-search/route';

const mockAuth = jest.fn();
const mockFindMany = jest.fn();

jest.mock('@/auth', () => ({ auth: () => mockAuth() }));
jest.mock('@/lib/db', () => ({
  prisma: { sleeperPlayer: { findMany: (...args: unknown[]) => mockFindMany(...args) } },
}));

describe('Sleeper search route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue({ user: { id: 'owner' } });
  });

  it('returns a bounded, position-filtered result set', async () => {
    mockFindMany.mockResolvedValue([{ id: '1', name: 'Josh Allen', team: 'BUF', pos: 'QB' }]);

    const response = await GET(
      new NextRequest('http://localhost/api/rankings/sleeper-search?q=Josh&position=QB'),
    );

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { normalizedName: { contains: 'josh' }, pos: 'QB' },
      select: { id: true, name: true, team: true, pos: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: 8,
    });
    await expect(response.json()).resolves.toEqual({
      results: [{ id: '1', name: 'Josh Allen', team: 'BUF', pos: 'QB' }],
    });
  });

  it('rejects unauthenticated and invalid searches before querying', async () => {
    mockAuth.mockResolvedValue(null);
    expect(
      (
        await GET(
          new NextRequest('http://localhost/api/rankings/sleeper-search?q=Josh&position=QB'),
        )
      ).status,
    ).toBe(401);
    mockAuth.mockResolvedValue({ user: { id: 'owner' } });
    await expect(
      (
        await GET(new NextRequest('http://localhost/api/rankings/sleeper-search?q=x&position=QB'))
      ).json(),
    ).resolves.toEqual({ error: 'Invalid search query' });
    await expect(
      (
        await GET(
          new NextRequest('http://localhost/api/rankings/sleeper-search?q=Josh&position=PICK'),
        )
      ).json(),
    ).resolves.toEqual({ error: 'Invalid position' });
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it('does not leak database failures', async () => {
    mockFindMany.mockRejectedValue(new Error('database offline'));

    const response = await GET(
      new NextRequest('http://localhost/api/rankings/sleeper-search?q=Josh&position=QB'),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'Unable to search players' });
  });
});
