import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { trades, tradingAccounts } from "@/db/schema";
import { eq, desc, and, like, gte, lte, sql } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

/* ──────────────────────────────
   Server-side validation
   ────────────────────────────── */

const VALID_DIRECTIONS = ["LONG", "SHORT"] as const;
const VALID_STATUSES = ["OPEN", "CLOSED"] as const;
const VALID_SOURCES = ["CSV", "SCREENSHOT", "MANUAL"] as const;
const MAX_SYMBOL_LENGTH = 20;
const MAX_NOTES_LENGTH = 2000;

interface ValidationError {
  field: string;
  message: string;
}

function validateTradeBody(body: Record<string, unknown>): ValidationError[] {
  const errors: ValidationError[] = [];

  // symbol
  if (body.symbol !== undefined) {
    if (typeof body.symbol !== "string" || !body.symbol.trim()) {
      errors.push({ field: "symbol", message: "Symbol is required and must be a non-empty string" });
    } else if (body.symbol.length > MAX_SYMBOL_LENGTH) {
      errors.push({ field: "symbol", message: `Symbol must be at most ${MAX_SYMBOL_LENGTH} characters` });
    }
  }

  // direction
  if (body.direction !== undefined) {
    const dir = (body.direction as string)?.toUpperCase();
    if (!VALID_DIRECTIONS.includes(dir as any)) {
      errors.push({ field: "direction", message: "Direction must be LONG or SHORT" });
    }
  }

  // status
  if (body.status !== undefined) {
    const st = (body.status as string)?.toUpperCase();
    if (!VALID_STATUSES.includes(st as any)) {
      errors.push({ field: "status", message: "Status must be OPEN or CLOSED" });
    }
  }

  // Numeric field validation
  const numericFields = ["entryPrice", "actualEntry", "actualExit", "stopLoss", "targetPrice", "positionSize", "pnl", "fees"];
  for (const field of numericFields) {
    if (body[field] !== undefined && body[field] !== null) {
      const val = Number(body[field]);
      if (isNaN(val) || !isFinite(val)) {
        errors.push({ field, message: `${field} must be a valid number` });
      }
    }
  }

  // Dates
  if (body.tradedAt !== undefined && body.tradedAt !== null) {
    const ts = new Date(body.tradedAt as string);
    if (isNaN(ts.getTime())) {
      errors.push({ field: "tradedAt", message: "tradedAt must be a valid date string or timestamp" });
    }
  }

  // notes
  if (body.notes !== undefined && typeof body.notes === "string" && body.notes.length > MAX_NOTES_LENGTH) {
    errors.push({ field: "notes", message: `Notes must be at most ${MAX_NOTES_LENGTH} characters` });
  }

  return errors;
}

/**
 * Determine trade status: only mark as CLOSED when there's definitive exit evidence.
 */
function determineTradeStatus(body: Record<string, unknown>): "OPEN" | "CLOSED" {
  // Explicit status override
  if (body.status === "CLOSED" || body.status === "OPEN") {
    return body.status as "OPEN" | "CLOSED";
  }

  // Has a confirmed exit price
  if (body.actualExit !== undefined && body.actualExit !== null) {
    return "CLOSED";
  }

  // Has a definitive PnL
  if (body.pnl !== undefined && body.pnl !== null) {
    return "CLOSED";
  }

  // Has a closedAt timestamp
  if (body.closedAt !== undefined && body.closedAt !== null) {
    return "CLOSED";
  }

  return "OPEN";
}

/**
 * Verify that a trading account belongs to the authenticated user.
 * Returns the verified accountId or null if not found/owned.
 */
async function verifyAccountOwnership(
  accountId: string | undefined | null,
  userId: string
): Promise<{ accountId: string | null; error?: NextResponse }> {
  if (!accountId) {
    // Auto-create or use default account
    const defaultAccount = await db.query.tradingAccounts.findFirst({
      where: eq(tradingAccounts.userId, userId),
    });

    if (defaultAccount) {
      return { accountId: defaultAccount.id };
    }

    // Create new default account
    const newId = uuidv4();
    await db.insert(tradingAccounts).values({
      id: newId,
      userId,
      label: "Default",
      currency: "USD",
      initialBalance: 0,
      monthlyProfitTarget: 0,
      timezone: "UTC",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    return { accountId: newId };
  }

  // Verify the provided accountId belongs to this user
  const account = await db.query.tradingAccounts.findFirst({
    where: and(
      eq(tradingAccounts.id, accountId),
      eq(tradingAccounts.userId, userId)
    ),
  });

  if (!account) {
    return {
      accountId: null,
      error: NextResponse.json(
        { error: "Trading account not found or access denied" },
        { status: 403 }
      ),
    };
  }

  return { accountId: account.id };
}

/* ──────────────────────────────
   GET  — List trades with filters
   ────────────────────────────── */

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

/* ──────────────────────────────
   POST — Create a new trade
   ────────────────────────────── */

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();

    // Validate required fields
    if (!body.symbol || typeof body.symbol !== "string") {
      return NextResponse.json(
        { error: "symbol is required and must be a non-empty string" },
        { status: 400 }
      );
    }
    if (!body.direction) {
      return NextResponse.json(
        { error: "direction is required (LONG or SHORT)" },
        { status: 400 }
      );
    }

    // Full validation
    const validationErrors = validateTradeBody(body);
    if (validationErrors.length > 0) {
      return NextResponse.json(
        { error: "Validation failed", details: validationErrors },
        { status: 400 }
      );
    }

    // Verify account ownership
    const { accountId, error: accountError } = await verifyAccountOwnership(
      body.tradingAccountId as string | undefined | null,
      session.user.id
    );
    if (accountError || !accountId) {
      return accountError ?? NextResponse.json({ error: "Account error" }, { status: 500 });
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
    const status = determineTradeStatus(body);

    await db.insert(trades).values({
      id: tradeId,
      userId: session.user.id,
      tradingAccountId: accountId,
      symbol: (body.symbol as string).toUpperCase(),
      direction: (body.direction as string).toUpperCase() as "LONG" | "SHORT",
      entryPrice: (body.entryPrice as number) ?? null,
      actualEntry: (body.actualEntry as number) ?? (body.entryPrice as number) ?? null,
      actualExit: (body.actualExit as number) ?? null,
      stopLoss: (body.stopLoss as number) ?? null,
      targetPrice: (body.targetPrice as number) ?? null,
      positionSize: (body.positionSize as number) ?? null,
      pnl: (body.pnl as number) ?? null,
      fees: (body.fees as number) ?? 0,
      tradedAt: tradedAtMs,
      closedAt: body.closedAt ? new Date(body.closedAt as string).getTime() : null,
      weekDay,
      session: session_label,
      strategy: (body.strategy as string) ?? null,
      setup: (body.setup as string) ?? null,
      notes: (body.notes as string) ?? null,
      status,
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
