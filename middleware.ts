import { auth } from './src/auth';
import { NextResponse } from 'next/server';

export default auth((req) => {
  if (!req.auth) {
    const signInUrl = new URL('/sign-in', req.url);
    signInUrl.searchParams.set('callbackUrl', req.url);
    return NextResponse.redirect(signInUrl);
  }
});

export const config = {
  matcher: ['/((?!api|sign-in|_next/static|_next/image|favicon\\.ico).*)'],
};
