import { encode } from 'next-auth/jwt';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { BASE_URL, E2E_TEST_USER_ID } from './env';

const AUTH_FILE = path.join(__dirname, '.auth', 'user.json');

export default async function globalSetup(): Promise<void> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error('AUTH_SECRET must be set so Playwright can mint a test session cookie');
  }

  const token = await encode({
    secret,
    salt: 'authjs.session-token',
    token: { sub: E2E_TEST_USER_ID },
    maxAge: 60 * 60 * 24,
  });

  const domain = new URL(BASE_URL).hostname;
  const expires = Math.floor(Date.now() / 1000) + 60 * 60 * 24;

  mkdirSync(path.dirname(AUTH_FILE), { recursive: true });
  writeFileSync(
    AUTH_FILE,
    JSON.stringify({
      cookies: [
        {
          name: 'authjs.session-token',
          value: token,
          domain,
          path: '/',
          expires,
          httpOnly: true,
          secure: false,
          sameSite: 'Lax' as const,
        },
      ],
      origins: [],
    }),
  );
}
