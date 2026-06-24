import type { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import GitHubProvider from 'next-auth/providers/github';
import AzureADProvider from 'next-auth/providers/azure-ad';

const ADMIN_WHITELIST: string[] = [
  'lucaairoldi92@gmail.com',
];

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    GitHubProvider({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    }),
    AzureADProvider({
      clientId: process.env.AZURE_AD_CLIENT_ID!,
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET!,
      tenantId: process.env.AZURE_AD_TENANT_ID ?? 'common',
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false;
      if (ADMIN_WHITELIST.includes(user.email)) return true;

      try {
        const { neon } = await import('@neondatabase/serverless');
        const sql = neon(process.env.DATABASE_URL!);
        const rows = await sql`SELECT email FROM admin_whitelist WHERE email = ${user.email} LIMIT 1`;
        return rows.length > 0;
      } catch {
        return false;
      }
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.email = token.email;
      }
      return session;
    },
    async jwt({ token, user }) {
      if (user) token.email = user.email;
      return token;
    },
  },
  pages: {
    signIn: '/admin/login',
    error: '/admin/login',
  },
  secret: process.env.NEXTAUTH_SECRET,
};