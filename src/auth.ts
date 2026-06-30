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
  providers: [Discord],
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
