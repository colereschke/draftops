/** @jest-environment node */

import { getRedirectUrl, unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';
import { NextRequest, type NextFetchEvent, type NextResponse } from 'next/server';

jest.mock('@/auth', () => ({
  auth: (callback: (request: NextRequest & { auth?: unknown }) => Response | undefined) => callback,
}));

import { config, proxy } from '@/proxy';

describe('proxy matcher', () => {
  it.each([
    ['/', true],
    ['/draft/1', true],
    ['/sign-in', false],
    ['/api/health', false],
    ['/_next/static/chunk.js', false],
    ['/_next/image?url=%2Fplayer.png', false],
    ['/icon.svg', false],
    ['/favicon.ico', false],
  ])('matches %s: %s', (url, expected) => {
    expect(unstable_doesMiddlewareMatch({ config, url })).toBe(expected);
  });

  it('redirects an unauthenticated document request with its complete callback URL', async () => {
    const request = new NextRequest('https://draftops.test/draft/1?view=budget');
    const response = await proxy(request, {} as NextFetchEvent);
    const redirectUrl = getRedirectUrl(response as NextResponse);
    expect(redirectUrl).not.toBeNull();
    const redirect = new URL(redirectUrl ?? 'https://draftops.test');

    expect(redirect.pathname).toBe('/sign-in');
    expect(redirect.searchParams.get('callbackUrl')).toBe(
      'https://draftops.test/draft/1?view=budget',
    );
  });
});
