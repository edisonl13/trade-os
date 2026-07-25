import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { users, userSettings } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * Only these fields are user-modifiable via the settings API.
 * subscriptionPlan and twoFactorEnabled are NOT user-modifiable —
 * they are set by server-side logic only.
 */
const ALLOWED_UPDATE_FIELDS = ["locale", "billingEmail"] as const;
const SUPPORTED_LOCALES = new Set(["en-US", "zh-CN"]);

interface SettingsUpdate {
  locale?: string;
  billingEmail?: string;
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json(null, { status: 401 });

  const user = await db.query.users.findFirst({ where: eq(users.id, session.user.id) });
  if (!user) return NextResponse.json(null, { status: 404 });

  const row = await db.query.userSettings.findFirst({ where: eq(userSettings.userId, session.user.id) });

  // subscriptionPlan and twoFactorEnabled are always server-determined
  const settings = {
    locale: row?.locale ?? null,
    billingEmail: row?.billingEmail ?? user.email,
    subscriptionPlan: "Free",
    twoFactorEnabled: false,
    twoFactorAvailable: false, // 2FA not yet implemented
  };

  return NextResponse.json(settings);
}

export async function PUT(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json() as SettingsUpdate & {
      subscriptionPlan?: unknown;
      twoFactorEnabled?: unknown;
    };

    // Only allow explicitly whitelisted fields
    const updates: SettingsUpdate = {};
    for (const field of ALLOWED_UPDATE_FIELDS) {
      if (body[field] !== undefined) {
        updates[field] = body[field];
      }
    }

    if (updates.locale && !SUPPORTED_LOCALES.has(updates.locale)) {
      return NextResponse.json({ error: "Unsupported locale" }, { status: 400 });
    }
    if (updates.billingEmail !== undefined) {
      updates.billingEmail = updates.billingEmail.trim();
    }

    // Reject attempts to modify protected fields
    const protectedFields = ["subscriptionPlan", "twoFactorEnabled"] as const;
    for (const field of protectedFields) {
      if (body[field] !== undefined && body[field] !== false) {
        return NextResponse.json(
          { error: `'${field}' is managed server-side and cannot be modified via this endpoint` },
          { status: 403 }
        );
      }
    }

    if (Object.keys(updates).length > 0) {
      await db
        .update(userSettings)
        .set({ ...updates, updatedAt: Date.now() })
        .where(eq(userSettings.userId, session.user.id));

      const existing = await db.query.userSettings.findFirst({
        where: eq(userSettings.userId, session.user.id),
      });

      if (!existing) {
        await db.insert(userSettings).values({
          userId: session.user.id,
          locale: updates.locale ?? null,
          billingEmail: updates.billingEmail ?? null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Save settings error:", err);
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
  }
}
