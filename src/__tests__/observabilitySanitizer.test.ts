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
});
