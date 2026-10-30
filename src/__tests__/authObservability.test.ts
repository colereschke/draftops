import * as Sentry from '@sentry/nextjs';

import { reportAuthError } from '@/lib/authObservability';

const mockScope = { setTag: jest.fn() };

jest.mock('@sentry/nextjs', () => ({
  captureException: jest.fn(),
  withScope: jest.fn((callback: (scope: typeof mockScope) => void) => callback(mockScope)),
}));

class CallbackRouteError extends Error {
  type = 'CallbackRouteError';
}

function callbackRouteError(cause: Error): CallbackRouteError {
  const error = new CallbackRouteError(
    'Read more at https://errors.authjs.dev#callbackrouteerror',
    { cause: { err: cause, provider: 'discord', parameters: { code: 'oauth-code' } } },
  );
  return error;
}

describe('reportAuthError', () => {
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it('captures the Auth.js error type with its root-cause message', () => {
    reportAuthError(
      callbackRouteError(new Error('unexpected "iss" (issuer) response parameter value')),
    );

    const captured = (Sentry.captureException as jest.Mock).mock.calls[0][0] as Error;
    expect(captured.name).toBe('CallbackRouteError');
    expect(captured.message).toBe('unexpected "iss" (issuer) response parameter value');
    expect(mockScope.setTag).toHaveBeenCalledWith('action', 'auth.callbackrouteerror');
    expect(mockScope.setTag).toHaveBeenCalledWith('route.path', '/api/auth');
    expect(mockScope.setTag).toHaveBeenCalledWith('incident.id', expect.any(String));
  });

  it('falls back to the error itself when there is no wrapped cause', () => {
    reportAuthError(new Error('Missing AUTH_SECRET'));

    const captured = (Sentry.captureException as jest.Mock).mock.calls[0][0] as Error;
    expect(captured.name).toBe('Error');
    expect(captured.message).toBe('Missing AUTH_SECRET');
  });

  it('logs a scrubbed record without provider parameters or user identifiers', () => {
    reportAuthError(
      callbackRouteError(new Error('profile lookup failed for 123456789012345678 a@b.com')),
    );

    const record = JSON.parse(consoleError.mock.calls[0][0] as string);
    expect(record).toMatchObject({
      event: 'server_error',
      action: 'auth.callbackrouteerror',
      routePath: '/api/auth',
      errorSummary: 'profile lookup failed for [redacted-user-id] [redacted-email]',
    });
    expect(JSON.stringify(record)).not.toContain('oauth-code');
  });
});
