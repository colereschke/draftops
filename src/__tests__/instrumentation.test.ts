/**
 * @jest-environment node
 */

import * as Sentry from '@sentry/nextjs';

import { onRequestError } from '@/instrumentation';
import { logServerError } from '@/lib/observability';

const mockSetTag = jest.fn();

jest.mock('@sentry/nextjs', () => ({
  captureRequestError: jest.fn(),
  withScope: jest.fn((callback) =>
    callback({
      setTag: mockSetTag,
    }),
  ),
}));

jest.mock('@/lib/observability', () => ({
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
});
