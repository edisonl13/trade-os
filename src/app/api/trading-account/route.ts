import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { tradingAccounts } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { isValidTimezone } from "@/lib/timezone";

/**
 * GET /api/trading-account
 * Returns the user's default trading account, or 404 if none exists.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const account = await db.query.tradingAccounts.findFirst({
    where: eq(tradingAccounts.userId, session.user.id),
  });

  if (!account) {
    return NextResponse.json(null, { status: 404 });
  }

  // Only return safe fields
  const { id, label, broker, currency, initialBalance, monthlyProfitTarget, timezone } = account;
  return NextResponse.json({ id, label, broker, currency, initialBalance, monthlyProfitTarget, timezone });
}

/**
 * POST /api/trading-account
 * Create a new trading account for the user.
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    if (body.timezone !== undefined && !isValidTimezone(body.timezone)) {
      return NextResponse.json({ error: "Invalid IANA timezone" }, { status: 400 });
    }
    const id = uuidv4();

    await db.insert(tradingAccounts).values({
      id,
      userId: session.user.id,
      label: body.label ?? "Default",
      broker: body.broker ?? "",
      currency: body.currency ?? "USD",
      initialBalance: body.initialBalance ?? 0,
      monthlyProfitTarget: body.monthlyProfitTarget ?? 0,
      timezone: body.timezone ?? "UTC",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const created = await db.query.tradingAccounts.findFirst({
      where: eq(tradingAccounts.id, id),
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("Create trading account error:", error);
    return NextResponse.json(
      { error: "Failed to create trading account" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/trading-account
 * Update the user's default trading account.
 * Verifies ownership — can only update own account.
 */
export async function PUT(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    if (body.timezone !== undefined && !isValidTimezone(body.timezone)) {
      return NextResponse.json({ error: "Invalid IANA timezone" }, { status: 400 });
    }

    // Find account — always restrict to current user's accounts
    let account: typeof tradingAccounts.$inferSelect | null = null;

    if (body.id) {
      // If a specific ID is provided, verify it belongs to this user
      const result = await db.query.tradingAccounts.findFirst({
        where: and(
          eq(tradingAccounts.id, body.id),
          eq(tradingAccounts.userId, session.user.id)
        ),
      });
      account = result ?? null;
    }

    if (!account) {
      // Fall back to the first account owned by this user
      const result = await db.query.tradingAccounts.findFirst({
        where: eq(tradingAccounts.userId, session.user.id),
      });
      account = result ?? null;
    }

    if (!account) {
      // Create one if it doesn't exist
      const newId = body.id ?? uuidv4();
      await db.insert(tradingAccounts).values({
        id: newId,
        userId: session.user.id,
        label: body.label ?? "Default",
        broker: body.broker ?? "",
        currency: body.currency ?? "USD",
        initialBalance: body.initialBalance ?? 0,
        monthlyProfitTarget: body.monthlyProfitTarget ?? 0,
        timezone: body.timezone ?? "UTC",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      const created = await db.query.tradingAccounts.findFirst({
        where: eq(tradingAccounts.id, newId),
      });

      return NextResponse.json(created, { status: 201 });
    }

    // Update existing account — always ensure userId matches
    await db
      .update(tradingAccounts)
      .set({
        label: body.label ?? account.label,
        broker: body.broker ?? account.broker,
        currency: body.currency ?? account.currency,
        initialBalance:
          body.initialBalance !== undefined
            ? body.initialBalance
            : account.initialBalance,
        monthlyProfitTarget:
          body.monthlyProfitTarget !== undefined
            ? body.monthlyProfitTarget
            : account.monthlyProfitTarget,
        timezone: body.timezone ?? account.timezone,
        updatedAt: Date.now(),
      })
      .where(
        and(
          eq(tradingAccounts.id, account.id),
          eq(tradingAccounts.userId, session.user.id) // extra safety
        )
      );

    const updated = await db.query.tradingAccounts.findFirst({
      where: eq(tradingAccounts.id, account.id),
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Update trading account error:", error);
    return NextResponse.json(
      { error: "Failed to update trading account" },
      { status: 500 }
    );
  }
}
