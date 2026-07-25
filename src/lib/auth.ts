/**
 * TRADE//OS Authentication
 *
 * Secure email-based login with one-time verification codes.
 * No passwordless direct login — every access requires code verification.
 */

import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/db";
import { users, accounts, sessions, verificationTokens, loginCodes } from "@/db/schema";
import { eq, and, lt, gte } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import crypto from "crypto";

/* ──────────────────────────────
   Rate limiting (in-memory fallback)
   ────────────────────────────── */

const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 5;
const CODE_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

const rateLimitMap = new Map<string, { count: number; windowStart: number }>();

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW) {
    rateLimitMap.set(key, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= MAX_ATTEMPTS) return false;
  entry.count++;
  return true;
}

// Periodic cleanup to prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap) {
    if (now - entry.windowStart > RATE_LIMIT_WINDOW) rateLimitMap.delete(key);
  }
}, 60_000);

/* ──────────────────────────────
   Verification code helpers
   ────────────────────────────── */

function generateCode(): string {
  return crypto.randomInt(100000, 999999).toString();
}

async function cleanExpiredCodes(email: string): Promise<void> {
  await db
    .delete(loginCodes)
    .where(
      and(
        eq(loginCodes.email, email),
        lt(loginCodes.expiresAt, Date.now())
      )
    );
}

export async function sendVerificationCode(email: string): Promise<{ success: boolean; message: string }> {
  const normalizedEmail = email.toLowerCase().trim();

  // Rate limit by email
  if (!checkRateLimit(`code:${normalizedEmail}`)) {
    return { success: false, message: "Too many requests. Please try again in 15 minutes." };
  }

  // Clean expired codes for this email
  await cleanExpiredCodes(normalizedEmail);

  // Check for existing valid code
  const existing = await db.query.loginCodes.findFirst({
    where: and(
      eq(loginCodes.email, normalizedEmail),
      gte(loginCodes.expiresAt, Date.now()),
    ),
    orderBy: (codes, { desc }) => [desc(codes.createdAt)],
  });

  if (existing) {
    // Re-send same code if still valid
    console.log(`[TRADE//OS Auth] Verification code for ${normalizedEmail}: ${existing.code}`);
    return { success: true, message: "Verification code sent to your email." };
  }

  const code = generateCode();
  const id = uuidv4();

  await db.insert(loginCodes).values({
    id,
    email: normalizedEmail,
    code,
    expiresAt: Date.now() + CODE_EXPIRY_MS,
    attempts: 0,
    createdAt: Date.now(),
  });

  // In production, send via email service. For now, log to console.
  console.log(`[TRADE//OS Auth] Verification code for ${normalizedEmail}: ${code}`);

  return { success: true, message: "Verification code sent to your email." };
}

export async function verifyCode(email: string, code: string): Promise<{ valid: boolean; userId?: string }> {
  const normalizedEmail = email.toLowerCase().trim();

  // Rate limit verification attempts
  if (!checkRateLimit(`verify:${normalizedEmail}`)) {
    return { valid: false };
  }

  // Find the latest valid code
  const validCode = await db.query.loginCodes.findFirst({
    where: and(
      eq(loginCodes.email, normalizedEmail),
      eq(loginCodes.code, code.trim()),
      gte(loginCodes.expiresAt, Date.now()),
      eq(loginCodes.usedAt, null as unknown as number),
    ),
    orderBy: (codes, { desc }) => [desc(codes.createdAt)],
  });

  if (!validCode) {
    return { valid: false };
  }

  // Mark code as used
  await db
    .update(loginCodes)
    .set({ usedAt: Date.now() })
    .where(eq(loginCodes.id, validCode.id));

  // Find or create user
  let user = await db.query.users.findFirst({
    where: eq(users.email, normalizedEmail),
  });

  if (!user) {
    const id = uuidv4();
    await db.insert(users).values({
      id,
      email: normalizedEmail,
      name: normalizedEmail.split("@")[0],
    });
    user = { id, email: normalizedEmail, name: normalizedEmail.split("@")[0], emailVerified: new Date(), image: null };
  } else if (!user.emailVerified) {
    // Mark email as verified on first successful login
    await db
      .update(users)
      .set({ emailVerified: new Date() })
      .where(eq(users.id, user.id));
    user.emailVerified = new Date();
  }

  return { valid: true, userId: user.id };
}

/* ──────────────────────────────
   NextAuth configuration
   ────────────────────────────── */

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  providers: [
    Credentials({
      name: "Verification Code",
      credentials: {
        email: { label: "Email", type: "email" },
        code: { label: "Verification Code", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.code) return null;

        const email = (credentials.email as string).toLowerCase().trim();
        const code = (credentials.code as string).trim();

        const result = await verifyCode(email, code);
        if (!result.valid || !result.userId) return null;

        const user = await db.query.users.findFirst({
          where: eq(users.id, result.userId),
        });

        return user ?? null;
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
      if (!user.email) return false;
      // Only allow users who have verified their email via code
      const dbUser = await db.query.users.findFirst({
        where: eq(users.email, user.email.toLowerCase().trim()),
      });
      return !!dbUser?.emailVerified;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        const user = await db.query.users.findFirst({
          where: eq(users.id, token.sub),
        });
        if (user) {
          session.user = {
            ...session.user,
            id: token.sub,
            name: user.name,
            email: user.email,
          };
        } else {
          session.user.id = token.sub;
        }
      }
      return session;
    },
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
      }
      return token;
    },
  },
});
