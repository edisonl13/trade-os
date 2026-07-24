import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { trades, tradingAccounts } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { getDemoTrades } from "@/lib/seed-data";

/**
 * POST /api/demo — Seed demo trades for the current user.
 * Creates a "Demo" trading account if needed.
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Check if user already has a demo account
    let demoAccount = await db.query.tradingAccounts.findFirst({
      where: and(
        eq(tradingAccounts.userId, session.user.id),
        eq(tradingAccounts.label, "Demo")
      ),
    });

    if (!demoAccount) {
      const accountId = uuidv4();
      await db.insert(tradingAccounts).values({
        id: accountId,
        userId: session.user.id,
        label: "Demo",
        broker: "Demo Market",
        currency: "USD",
        initialBalance: 10000,
        timezone: "UTC",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      demoAccount = { id: accountId, userId: session.user.id, label: "Demo", broker: "Demo Market", currency: "USD", initialBalance: 10000, timezone: "UTC", createdAt: Date.now(), updatedAt: Date.now() };
    }

    const importBatch = uuidv4();
    const demoData = getDemoTrades();
    let inserted = 0;

    for (const t of demoData) {
      const tradedAtMs = new Date(t.tradedAt).getTime();
      const closedAtMs = t.closedAt ? new Date(t.closedAt).getTime() : null;
      const tradeDate = new Date(tradedAtMs);
      const weekDay = tradeDate.getUTCDay();

      const idempotencyKey = `demo|${t.symbol}|${t.direction}|${t.tradedAt}`;

      await db.insert(trades).values({
        id: uuidv4(),
        userId: session.user.id,
        tradingAccountId: demoAccount.id,
        symbol: t.symbol,
        direction: t.direction,
        entryPrice: t.entryPrice,
        actualEntry: t.entryPrice,
        actualExit: t.exitPrice,
        stopLoss: t.stopLoss,
        targetPrice: t.targetPrice,
        positionSize: t.positionSize,
        pnl: t.pnl,
        fees: 0,
        tradedAt: tradedAtMs,
        closedAt: closedAtMs,
        weekDay,
        session: t.session,
        strategy: t.strategy,
        status: t.exitPrice !== null ? "CLOSED" : "OPEN",
        source: "CSV",
        importBatch,
        idempotencyKey,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      inserted++;
    }

    return NextResponse.json({
      success: true,
      message: `Seeded ${inserted} demo trades`,
      accountId: demoAccount.id,
      count: inserted,
    });
  } catch (error) {
    console.error("Demo seed error:", error);
    return NextResponse.json({ error: "Failed to seed demo data" }, { status: 500 });
  }
}

/**
 * DELETE /api/demo — Remove all demo trades for the current user.
 */
export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Find demo account
    const demoAccount = await db.query.tradingAccounts.findFirst({
      where: and(
        eq(tradingAccounts.userId, session.user.id),
        eq(tradingAccounts.label, "Demo")
      ),
    });

    if (!demoAccount) {
      return NextResponse.json({ success: true, message: "No demo data found" });
    }

    // Delete all trades in demo account
    await db.delete(trades).where(
      and(eq(trades.userId, session.user.id), eq(trades.tradingAccountId, demoAccount.id))
    );

    return NextResponse.json({
      success: true,
      message: "Demo trades removed",
    });
  } catch (error) {
    console.error("Demo delete error:", error);
    return NextResponse.json({ error: "Failed to remove demo data" }, { status: 500 });
  }
}
