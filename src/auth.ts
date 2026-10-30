import NextAuth from 'next-auth';
import Discord from 'next-auth/providers/discord';

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
  // Discord now returns an RFC 9207 `iss` callback parameter. The built-in provider has no
  // issuer, so Auth.js compares against its https://authjs.dev placeholder and rejects it.
  providers: [Discord({ issuer: 'https://discord.com' })],
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
});
