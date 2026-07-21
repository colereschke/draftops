import * as Sentry from '@sentry/nextjs';

jest.mock('@sentry/nextjs', () => ({
  captureRouterTransitionStart: jest.fn(),
  init: jest.fn(),
}));

describe('Sentry client configuration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    ['client', '@/instrumentation-client'],
    ['server', '@/sentry.server.config'],
    ['edge', '@/sentry.edge.config'],
  ])(
    'initializes the %s runtime without PII, tracing, logs, or replay',
    async (_runtime, module) => {
      await import(module);

      expect(Sentry.init).toHaveBeenCalledWith(
        expect.objectContaining({
          sendDefaultPii: false,
          tracesSampleRate: 0,
          enableLogs: false,
          replaysSessionSampleRate: 0,
          replaysOnErrorSampleRate: 0,
        }),
      );
    },
  );
});
