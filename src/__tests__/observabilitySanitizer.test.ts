import { sanitizeSentryEvent } from '@/lib/observabilitySanitizer';

describe('sanitizeSentryEvent', () => {
  it('removes queries, bodies, headers, user data, and secrets', () => {
    const event = sanitizeSentryEvent({
      exception: {
        values: [{ type: 'Error', value: 'password=private cole@example.test failure' }],
      },
      request: {
        url: 'https://draftops.app/draft/7?token=secret#x',
        data: 'private',
        headers: { authorization: 'Bearer secret' },
      },
      user: { id: 'discord-123', email: 'cole@example.test' },
      tags: { 'incident.id': 'incident-7', ignored: 'secret' },
      extra: { private: 'secret' },
    } as never);

    expect(event).toEqual(
      expect.objectContaining({
        request: { url: '/draft/7' },
        tags: { 'incident.id': 'incident-7' },
      }),
    );
    expect(JSON.stringify(event)).not.toMatch(/secret|private|discord-123|cole@example/i);
  });

  it('retains only approved tags and a bounded error summary', () => {
    const event = sanitizeSentryEvent({
      exception: { values: [{ type: 'Error', value: 'x'.repeat(1_000) }] },
      tags: {
        action: 'render',
        'route.path': '/draft/[draftId]',
        'draft.id': 'draft-1',
        'request.id': 'request-1',
        'deployment.id': 'deployment-1',
        'deployment.environment': 'production',
        'user.correlation_id': 'a'.repeat(64),
        rejected: 'nope',
      },
    } as never);

    expect(event?.tags).toEqual({
      action: 'render',
      'route.path': '/draft/[draftId]',
      'draft.id': 'draft-1',
      'request.id': 'request-1',
      'deployment.id': 'deployment-1',
      'deployment.environment': 'production',
      'user.correlation_id': 'a'.repeat(64),
    });
    expect(event?.exception?.values?.[0]?.value).toHaveLength(500);
  });

  it('validates every approved tag value before retaining it', () => {
    const event = sanitizeSentryEvent({
      type: 'Error?token=secret',
      exception: { values: [{ type: 'DatabaseError password=private', value: 'safe' }] },
      tags: {
        'incident.id': 'incident-123',
        action: 'render?token=secret',
        'route.path': '/draft/7?token=secret#fragment',
        'draft.id': 'draft-7?token=secret',
        'request.id': 'request-7'.repeat(50),
        'deployment.id': 'deployment-7?token=secret',
        'deployment.environment': 'production?token=secret',
        'user.correlation_id': 'A'.repeat(64),
      },
    } as never);

    expect(event).toEqual({
      type: 'Error',
      exception: { values: [{ type: 'DatabaseError', value: 'safe' }] },
      tags: {
        'incident.id': 'incident-123',
        'route.path': '/draft/7',
      },
    });
  });

  it('redacts unlabelled Discord-style snowflakes from error summaries', () => {
    const event = sanitizeSentryEvent({
      exception: {
        values: [{ type: 'Error', value: 'Failed for user 123456789012345678 with token=secret' }],
      },
    });

    expect(event?.exception?.values?.[0]?.value).toBe(
      'Failed for user [redacted-user-id] with token=[redacted]',
    );
  });

  it('drops correlation tags and exception types containing Discord-style snowflakes', () => {
    const snowflake = '123456789012345678';
    const event = sanitizeSentryEvent({
      type: `RequestError-${snowflake}`,
      exception: { values: [{ type: `DatabaseError-${snowflake}`, value: 'safe failure' }] },
      tags: {
        'incident.id': `incident-${snowflake}`,
        action: 'render',
        'route.path': '/draft/7',
        'draft.id': `draft-${snowflake}`,
        'request.id': `request-${snowflake}`,
        'deployment.id': `deployment-${snowflake}`,
      },
    });

    expect(event).toEqual({
      exception: { values: [{ value: 'safe failure' }] },
      tags: {
        action: 'render',
        'route.path': '/draft/7',
      },
    });
    expect(JSON.stringify(event)).not.toContain(snowflake);
  });

  it.each(['mailto:cole@example.test', 'javascript:alert(secret)', 'data:text/plain,secret'])(
    'rejects opaque request URL schemes: %s',
    (url) => {
      const event = sanitizeSentryEvent({ request: { url } });

      expect(event?.request).toBeUndefined();
      expect(JSON.stringify(event)).not.toMatch(/cole@example|secret/i);
    },
  );

  it('redacts sensitive and opaque path segments while retaining route structure', () => {
    const event = sanitizeSentryEvent({
      request: {
        url: 'https://draftops.app/draft/ckv2x4n9j0000qwertyuiop12/teams/secret-token',
      },
    });

    expect(event?.request).toEqual({ url: '/draft/[redacted]/teams/[redacted]' });
    expect(JSON.stringify(event)).not.toMatch(/ckv2x4n9j|secret-token/i);
  });

  it('fully redacts authorization bearer tokens and credentialed URLs from summaries', () => {
    const event = sanitizeSentryEvent({
      exception: {
        values: [
          {
            type: 'DatabaseError',
            value:
              'Authorization: Bearer very-secret-token failed for postgres://draftops:db-password@db.example.test/app',
          },
        ],
      },
    });

    expect(event?.exception?.values?.[0]?.value).toBe(
      'authorization=[redacted] failed for [redacted-credential-url]',
    );
    expect(JSON.stringify(event)).not.toMatch(/very-secret-token|db-password|db\.example/i);
  });
});
