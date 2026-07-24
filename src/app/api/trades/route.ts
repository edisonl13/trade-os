import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { trades, tradingAccounts } from "@/db/schema";
import { eq, desc, and, like, gte, lte, sql } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol");
  const status = searchParams.get("status");
  const direction = searchParams.get("direction");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const search = searchParams.get("search");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 200);
  const offset = parseInt(searchParams.get("offset") ?? "0");

  const conditions = [eq(trades.userId, session.user.id)];

  if (symbol) conditions.push(eq(trades.symbol, symbol.toUpperCase()));
  if (status) conditions.push(eq(trades.status, status as "OPEN" | "CLOSED"));
  if (direction)
    conditions.push(eq(trades.direction, direction as "LONG" | "SHORT"));
  if (from) conditions.push(gte(trades.tradedAt, parseInt(from)));
  if (to) conditions.push(lte(trades.tradedAt, parseInt(to)));
  if (search) conditions.push(like(trades.symbol, `%${search.toUpperCase()}%`));

  const allConditions = and(...conditions);

  const results = await db.query.trades.findMany({
    where: allConditions,
    orderBy: [desc(trades.tradedAt)],
    limit,
    offset,
  });

  // Get total count
  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(trades)
    .where(allConditions);

  const total = countResult[0]?.count ?? 0;

  return NextResponse.json({
    trades: results,
    total,
    limit,
    offset,
  });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();

    // Get or create default trading account
    let accountId = body.tradingAccountId;
    if (!accountId) {
      const defaultAccount = await db.query.tradingAccounts.findFirst({
        where: eq(tradingAccounts.userId, session.user.id),
      });
      if (defaultAccount) {
        accountId = defaultAccount.id;
      } else {
        accountId = uuidv4();
        await db.insert(tradingAccounts).values({
          id: accountId,
          userId: session.user.id,
          label: "Default",
          currency: "USD",
          initialBalance: 0,
          timezone: "UTC",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
    }

    const tradedAtMs = body.tradedAt
      ? new Date(body.tradedAt).getTime()
      : Date.now();
    const tradeDate = new Date(tradedAtMs);
    const weekDay = tradeDate.getUTCDay();
    const hour = tradeDate.getUTCHours();

    let session_label = "other";
    if (hour >= 0 && hour < 8) session_label = "asia";
    else if (hour >= 8 && hour < 12) session_label = "london";
    else if (hour >= 12 && hour < 16) session_label = "ny";
    else if (hour >= 16 && hour < 21) session_label = "ny-after";
    else session_label = "asia";

    const tradeId = uuidv4();
    const status =
      body.pnl !== null || body.actualExit !== null ? "CLOSED" : "OPEN";

    await db.insert(trades).values({
      id: tradeId,
      userId: session.user.id,
      tradingAccountId: accountId,
      symbol: body.symbol.toUpperCase(),
      direction: body.direction,
      entryPrice: body.entryPrice ?? null,
      actualEntry: body.actualEntry ?? body.entryPrice ?? null,
      actualExit: body.actualExit ?? null,
      stopLoss: body.stopLoss ?? null,
      targetPrice: body.targetPrice ?? null,
      positionSize: body.positionSize ?? null,
      pnl: body.pnl ?? null,
      fees: body.fees ?? 0,
      tradedAt: tradedAtMs,
      closedAt: body.closedAt ? new Date(body.closedAt).getTime() : null,
      weekDay,
      session: session_label,
      strategy: body.strategy ?? null,
      setup: body.setup ?? null,
      notes: body.notes ?? null,
      status: status as "OPEN" | "CLOSED",
      source: "MANUAL",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const created = await db.query.trades.findFirst({
      where: eq(trades.id, tradeId),
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("Create trade error:", error);
    return NextResponse.json(
      { error: "Failed to create trade" },
      { status: 500 }
    );
  }
}
