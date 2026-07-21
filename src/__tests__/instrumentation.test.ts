/**
 * @jest-environment node
 */

import * as Sentry from '@sentry/nextjs';

import { onRequestError } from '@/instrumentation';
import { logServerError } from '@/lib/observabilityLogger';

const mockSetTag = jest.fn();

jest.mock('@sentry/nextjs', () => ({
  captureRequestError: jest.fn(),
  withScope: jest.fn((callback) =>
    callback({
      setTag: mockSetTag,
    }),
  ),
}));

jest.mock('@/lib/observabilityLogger', () => ({
  logServerError: jest.fn(),
}));

describe('onRequestError', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('captures a server digest once and logs matching correlation', async () => {
    await onRequestError(
      Object.assign(new Error('database password=secret'), { digest: 'digest-123' }),
      {
        path: '/draft/42?token=secret',
        method: 'GET',
        headers: { 'x-vercel-id': 'iad1::abc' },
      },
      { routePath: '/draft/[draftId]', routeType: 'render' } as never,
    );

    expect(Sentry.captureRequestError).toHaveBeenCalledTimes(1);
    expect(mockSetTag).toHaveBeenCalledWith('incident.id', 'digest-123');
    expect(mockSetTag).toHaveBeenCalledWith('action', 'render');
    expect(mockSetTag).toHaveBeenCalledWith('route.path', '/draft/[draftId]');
    expect(logServerError).toHaveBeenCalledWith(
      expect.objectContaining({
        incidentId: 'digest-123',
        action: 'render',
        draftId: '42',
        requestId: 'iad1::abc',
        routePath: '/draft/[draftId]',
      }),
    );
  });

  it('replaces an unsafe digest with an opaque incident ID before tagging or logging', async () => {
    await onRequestError(
      Object.assign(new Error('database unavailable'), { digest: 'password=secret' }),
      {
        path: '/draft/42',
        method: 'GET',
        headers: {},
      },
      { routePath: '/draft/[draftId]', routeType: 'render' } as never,
    );

    const incidentId = mockSetTag.mock.calls.find(([key]) => key === 'incident.id')?.[1];
    expect(incidentId).toMatch(/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i);
    expect(incidentId).not.toContain('password');
    expect(logServerError).toHaveBeenCalledWith(expect.objectContaining({ incidentId }));
  });

  it('registers the Edge Sentry configuration without loading Node-only observability', async () => {
    const originalRuntime = process.env.NEXT_RUNTIME;
    process.env.NEXT_RUNTIME = 'edge';

    jest.resetModules();
    jest.doMock('@/sentry.edge.config', () => ({}));
    const { register } = await import('@/instrumentation');

    await expect(register()).resolves.toBeUndefined();

    if (originalRuntime === undefined) {
      delete process.env.NEXT_RUNTIME;
    } else {
      process.env.NEXT_RUNTIME = originalRuntime;
    }
  });
});
