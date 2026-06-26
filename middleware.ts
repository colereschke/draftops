export { auth as middleware } from './src/auth';

export const config = {
  matcher: ['/((?!api|sign-in|_next/static|_next/image|favicon\\.ico).*)'],
};
