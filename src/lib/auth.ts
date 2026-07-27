/**
 * TRADE//OS Authentication
 *
 * Development preview login — email-only, no verification.
 * NOT production-ready. Replace with proper authentication before release.
 */

import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/db";
import { users, accounts, sessions, verificationTokens } from "@/db/schema";
import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  providers: [
    Credentials({
      name: "Email",
      credentials: {
        email: { label: "Email", type: "email" },
      },
      async authorize(credentials) {
        if (!credentials?.email) return null;
        const email = (credentials.email as string).toLowerCase().trim();

        // Find or create user
        let user = await db.query.users.findFirst({
          where: eq(users.email, email),
        });

        if (!user) {
          const id = uuidv4();
          await db.insert(users).values({
            id,
            email,
            name: email.split("@")[0],
          });
          user = { id, email, name: email.split("@")[0], emailVerified: null, image: null };
        }

        return user;
      },
    }),
  ],
  pages: {
    signIn: "/auth/signin",
    newUser: "/welcome",
  },
  session: {
    strategy: "jwt",
    maxAge: 7 * 24 * 60 * 60, // 7 days
  },
  callbacks: {
    async signIn({ user }) {
      // Development preview: allow any existing or newly created user
      return !!user.email;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
        session.user.name = typeof token.name === "string" ? token.name : session.user.name;
        session.user.email = typeof token.email === "string" ? token.email : session.user.email;
      }
      return session;
    },
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        token.name = user.name;
        token.email = user.email;
      }
      return token;
    },
  },
});
