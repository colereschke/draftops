import { createUserCorrelationId, logServerError } from '@/lib/observability';

describe('server observability', () => {
  const originalHashKey = process.env.OBSERVABILITY_HASH_KEY;
  const originalDeploymentId = process.env.VERCEL_DEPLOYMENT_ID;
  const originalVercelEnvironment = process.env.VERCEL_ENV;

  beforeEach(() => {
    jest.restoreAllMocks();
    delete process.env.OBSERVABILITY_HASH_KEY;
    delete process.env.VERCEL_DEPLOYMENT_ID;
    delete process.env.VERCEL_ENV;
  });

  afterAll(() => {
    if (originalHashKey === undefined) {
      delete process.env.OBSERVABILITY_HASH_KEY;
    } else {
      process.env.OBSERVABILITY_HASH_KEY = originalHashKey;
    }

    if (originalDeploymentId === undefined) {
      delete process.env.VERCEL_DEPLOYMENT_ID;
    } else {
      process.env.VERCEL_DEPLOYMENT_ID = originalDeploymentId;
    }

    if (originalVercelEnvironment === undefined) {
      delete process.env.VERCEL_ENV;
    } else {
      process.env.VERCEL_ENV = originalVercelEnvironment;
    }
  });

  it('creates a 64-character HMAC only when configured', () => {
    expect(createUserCorrelationId('discord-123')).toBeUndefined();

    process.env.OBSERVABILITY_HASH_KEY = 'test-observability-key';

    expect(createUserCorrelationId('discord-123')).toMatch(/^[a-f0-9]{64}$/);
  });

  it('emits one sanitized JSON error record', () => {
    const error = jest.spyOn(console, 'error').mockImplementation();

    logServerError({
      incidentId: 'incident-123',
      action: 'render',
      routePath: '/draft/7?token=secret',
      draftId: '7',
      requestId: 'iad1::request',
      userId: 'discord-123',
      error: new Error('password=private'),
    });

    expect(error).toHaveBeenCalledTimes(1);
    const record = JSON.parse(error.mock.calls[0]?.[0] as string) as Record<string, unknown>;
    expect(record).toEqual(
      expect.objectContaining({
        incidentId: 'incident-123',
        action: 'render',
        routePath: '/draft/7',
        draftId: '7',
        requestId: 'iad1::request',
      }),
    );
    expect(JSON.stringify(record)).not.toMatch(/secret|private|discord-123/i);
  });

  it('includes safe deployment correlation from the runtime environment', () => {
    const error = jest.spyOn(console, 'error').mockImplementation();
    process.env.VERCEL_DEPLOYMENT_ID = 'deployment-123';
    process.env.VERCEL_ENV = 'production';

    logServerError({
      incidentId: 'incident-123',
      action: 'render',
      routePath: '/draft/7',
      error: new Error('safe failure'),
    });

    expect(JSON.parse(error.mock.calls[0]?.[0] as string)).toEqual(
      expect.objectContaining({
        deploymentEnvironment: 'production',
        deploymentId: 'deployment-123',
      }),
    );
  });

  it('drops malformed and oversized correlation values from server logs', () => {
    const error = jest.spyOn(console, 'error').mockImplementation();
    process.env.VERCEL_DEPLOYMENT_ID = 'deployment?token=secret';
    process.env.VERCEL_ENV = 'production?token=secret';

    logServerError({
      incidentId: 'incident?token=secret',
      action: 'render?token=secret',
      routePath: '/draft/7?token=secret#fragment',
      draftId: 'draft?token=secret',
      requestId: 'request-7'.repeat(50),
      error: new Error('safe failure'),
    });

    expect(JSON.parse(error.mock.calls[0]?.[0] as string)).toEqual({
      event: 'server_error',
      routePath: '/draft/7',
      errorSummary: 'safe failure',
    });
  });

  it('redacts unlabelled Discord-style snowflakes from server error summaries', () => {
    const error = jest.spyOn(console, 'error').mockImplementation();

    logServerError({
      incidentId: 'incident-123',
      action: 'render',
      routePath: '/draft/7',
      error: new Error('Failed for user 123456789012345678'),
    });

    expect(JSON.parse(error.mock.calls[0]?.[0] as string)).toEqual(
      expect.objectContaining({ errorSummary: 'Failed for user [redacted-user-id]' }),
    );
  });

  it('drops structured-log correlation fields containing Discord-style snowflakes', () => {
    const error = jest.spyOn(console, 'error').mockImplementation();
    const snowflake = '123456789012345678';
    process.env.VERCEL_DEPLOYMENT_ID = `deployment-${snowflake}`;

    logServerError({
      incidentId: `incident-${snowflake}`,
      action: 'render',
      routePath: '/draft/7',
      draftId: `draft-${snowflake}`,
      requestId: `request-${snowflake}`,
      error: new Error('safe failure'),
    });

    expect(JSON.parse(error.mock.calls[0]?.[0] as string)).toEqual({
      event: 'server_error',
      action: 'render',
      routePath: '/draft/7',
      errorSummary: 'safe failure',
    });
  });

  it('redacts sensitive paths, bearer tokens, and credentialed URLs from server logs', () => {
    const error = jest.spyOn(console, 'error').mockImplementation();

    logServerError({
      incidentId: 'incident-123',
      action: 'render',
      routePath: '/draft/ckv2x4n9j0000qwertyuiop12/teams/secret-token',
      error: new Error(
        'Authorization: Bearer very-secret-token failed for postgres://draftops:db-password@db.example.test/app',
      ),
    });

    expect(JSON.parse(error.mock.calls[0]?.[0] as string)).toEqual(
      expect.objectContaining({
        routePath: '/draft/[redacted]/teams/[redacted]',
        errorSummary: 'authorization=[redacted] failed for [redacted-credential-url]',
      }),
    );
    expect(error.mock.calls[0]?.[0]).not.toMatch(
      /ckv2x4n9j|secret-token|very-secret-token|db-password|db\.example/i,
    );
  });

  it('redacts standalone bearer tokens and URL fragments from server logs', () => {
    const error = jest.spyOn(console, 'error').mockImplementation();

    logServerError({
      incidentId: 'incident-123',
      action: 'render',
      routePath: '/draft/7',
      error: new Error(
        'Bearer standalone-secret failed at https://draftops.app/draft/7#private-fragment',
      ),
    });

    expect(JSON.parse(error.mock.calls[0]?.[0] as string)).toEqual(
      expect.objectContaining({
        errorSummary: 'bearer [redacted] failed at https://draftops.app/draft/7',
      }),
    );
    expect(error.mock.calls[0]?.[0]).not.toMatch(/standalone-secret|private-fragment/i);
  });
});
