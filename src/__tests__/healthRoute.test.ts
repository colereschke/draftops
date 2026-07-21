/**
 * @jest-environment node
 */

import { GET } from '@/app/api/health/route';
import { prisma } from '@/lib/db';
import { logServerError } from '@/lib/observability';

jest.mock('@/lib/db', () => ({
  prisma: {
    $queryRaw: jest.fn(),
  },
}));

jest.mock('@/lib/observability', () => ({
  logServerError: jest.fn(),
}));

const mockQueryRaw = jest.mocked(prisma.$queryRaw);
const mockLogServerError = jest.mocked(logServerError);

describe('GET /api/health', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns only ok true after a database probe', async () => {
    mockQueryRaw.mockResolvedValue([{ '?column?': 1 }]);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(mockLogServerError).not.toHaveBeenCalled();
  });

  it('returns only ok false and logs a generic failure when the database fails', async () => {
    mockQueryRaw.mockRejectedValue(new Error('Neon password=secret'));

    const response = await GET();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false });
    expect(mockLogServerError).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'health_check',
        routePath: '/api/health',
        error: expect.any(Error),
        incidentId: expect.stringMatching(/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i),
      }),
    );
  });

  it('returns only ok false when the database probe exceeds its deadline', async () => {
    jest.useFakeTimers();
    mockQueryRaw.mockReturnValue(new Promise(() => {}) as never);

    try {
      const responsePromise = GET();
      await jest.advanceTimersByTimeAsync(2_000);
      const response = await responsePromise;

      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ ok: false });
      expect(mockLogServerError).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'health_check', routePath: '/api/health' }),
      );
    } finally {
      jest.useRealTimers();
    }
  });
});
