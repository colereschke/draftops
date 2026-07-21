import * as Sentry from '@sentry/nextjs';

jest.mock('@sentry/nextjs', () => ({
  captureRouterTransitionStart: jest.fn(),
  init: jest.fn(),
}));

describe('Sentry client configuration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('initializes without PII, tracing, or log forwarding', async () => {
    await import('@/instrumentation-client');

    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({
        sendDefaultPii: false,
        tracesSampleRate: 0,
        enableLogs: false,
      }),
    );
  });
});
