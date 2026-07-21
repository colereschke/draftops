import type { NextAuthRequest } from 'next-auth';
import { NextResponse, type NextFetchEvent } from 'next/server';
import { auth } from './auth';

export const proxy = auth((request: NextAuthRequest, _event: NextFetchEvent) => {
  if (!request.auth) {
    const signInUrl = new URL('/sign-in', request.url);
    signInUrl.searchParams.set('callbackUrl', request.url);
    return NextResponse.redirect(signInUrl);
  }
});

export const config = {
  matcher: ['/((?!api|sign-in|_next/static|_next/image|icon\\.svg|favicon\\.ico).*)'],
};
