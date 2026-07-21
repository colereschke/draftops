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
});
