import NextAuth from 'next-auth';

import { reportAuthError } from '@/lib/authObservability';
import { discordProvider } from '@/lib/discordOAuth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [discordProvider()],
  session: { strategy: 'jwt' },
  callbacks: {
    jwt({ token, account }) {
      if (account) token.sub = account.providerAccountId;
      return token;
    },
    session({ session, token }) {
      session.user.id = token.sub ?? '';
      return session;
    },
  },
  pages: {
    signIn: '/sign-in',
  },
  // Auth.js catches its own failures and redirects, so they never reach Sentry on their own.
  logger: { error: reportAuthError },
});
