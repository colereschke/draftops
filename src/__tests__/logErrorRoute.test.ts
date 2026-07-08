/**
 * @jest-environment node
 */

import { POST } from '@/app/api/log-error/route';

describe('log-error route', () => {
  it('rejects oversized client error payloads', async () => {
    const request = new Request('http://localhost/api/log-error', {
      method: 'POST',
      body: JSON.stringify({
        message: 'x'.repeat(300),
        url: 'https://example.com',
      }),
    });

    const response = await POST(request as Parameters<typeof POST>[0]);

    expect(response.status).toBe(400);
  });
});
