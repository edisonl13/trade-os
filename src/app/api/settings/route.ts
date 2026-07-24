import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { users, userSettings } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json(null, { status: 401 });

  const user = await db.query.users.findFirst({ where: eq(users.id, session.user.id) });
  if (!user) return NextResponse.json(null, { status: 404 });

  // Read persisted per-user settings from user_settings when present
  const row = await db.query.userSettings.findFirst({ where: eq(userSettings.userId, session.user.id) });

  const settings = {
    locale: row?.locale ?? null,
    billingEmail: row?.billingEmail ?? user.email,
    subscriptionPlan: row?.subscriptionPlan ?? "Free",
    twoFactorEnabled: Boolean(row?.twoFactorEnabled),
  };

  return NextResponse.json(settings);
}

export async function PUT(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();

    const updates: Record<string, any> = {};
    if (body.locale !== undefined) updates.locale = body.locale;
    if (body.billingEmail !== undefined) updates.billingEmail = body.billingEmail;
    if (body.subscriptionPlan !== undefined) updates.subscriptionPlan = body.subscriptionPlan;
    if (body.twoFactorEnabled !== undefined) updates.twoFactorEnabled = body.twoFactorEnabled ? 1 : 0;

    if (Object.keys(updates).length > 0) {
      // Try update; if no rows were updated, insert a new settings row
      await db.update(userSettings).set({ ...updates, updatedAt: Date.now() }).where(eq(userSettings.userId, session.user.id));

      const existing = await db.query.userSettings.findFirst({ where: eq(userSettings.userId, session.user.id) });
      if (!existing) {
        await db.insert(userSettings).values({
          userId: session.user.id,
          locale: updates.locale ?? null,
          billingEmail: updates.billingEmail ?? null,
          subscriptionPlan: updates.subscriptionPlan ?? "Free",
          twoFactorEnabled: updates.twoFactorEnabled ?? 0,
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
