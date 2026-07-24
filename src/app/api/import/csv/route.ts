import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { trades, tradingAccounts } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import {
  parseCsv,
  detectBroker,
  autoMapColumns,
  applyMapping,
  type ColumnMapping,
} from "@/lib/import-csv";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const mappingsJson = formData.get("mappings") as string | null;
    const tradingAccountId = formData.get("tradingAccountId") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Read file content
    const csvContent = await file.text();

    // Parse CSV
    const parsed = parseCsv(csvContent, file.name);
    if (parsed.headers.length === 0) {
      return NextResponse.json(
        { error: "Could not parse CSV headers. Check the file format." },
        { status: 400 }
      );
    }

    // Detect broker
    const detectedBroker = detectBroker(parsed.headers);

    // Auto-map columns (or use provided mappings)
    let mappings: ColumnMapping[];
    if (mappingsJson) {
      mappings = JSON.parse(mappingsJson) as ColumnMapping[];
    } else {
      mappings = autoMapColumns(parsed.headers, detectedBroker);
    }

    // If this is a preview request, return parsed data without saving
    if (formData.get("preview") === "true") {
      return NextResponse.json({
        headers: parsed.headers,
        totalRows: parsed.totalRows,
        sampleRows: parsed.rows.slice(0, 5),
        detectedBroker,
        mappings,
      });
    }

    // Use the user's default trading account if none specified
    let accountId = tradingAccountId;
    if (!accountId) {
      const defaultAccount = await db.query.tradingAccounts.findFirst({
        where: eq(tradingAccounts.userId, session.user.id),
      });
      if (!defaultAccount) {
        // Create a default trading account
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
      } else {
        accountId = defaultAccount.id;
      }
    }

    // Apply mapping and prepare trades for insert
    const importBatch = uuidv4();
    const mappedTrades = applyMapping(
      parsed.rows,
      mappings,
      accountId!,
      importBatch
    );

    // Insert trades
    let inserted = 0;
    let skipped = 0;
    const errors: { row: number; error: string }[] = [];

    for (const mt of mappedTrades) {
      // Check for duplicate by idempotency key
      if (mt.idempotencyKey) {
        const existing = await db.query.trades.findFirst({
          where: and(
            eq(trades.userId, session.user.id),
            eq(trades.idempotencyKey, mt.idempotencyKey)
          ),
        });
        if (existing) {
          skipped++;
          continue;
        }
      }

      // Parse dates - use import time as fallback if no date column in CSV
      let tradedAtMs: number;
      if (mt.tradedAt) {
        const parsed = new Date(mt.tradedAt).getTime();
        tradedAtMs = isNaN(parsed) ? Date.now() : parsed;
      } else {
        // Use import time as fallback so the row still gets imported
        tradedAtMs = Date.now();
      }

      const closedAtMs = mt.closedAt
        ? new Date(mt.closedAt).getTime()
        : null;

      if (closedAtMs && closedAtMs < tradedAtMs) {
        errors.push({
          row: mt.rowIndex + 1,
          error: "Close time is before open time",
        });
        continue;
      }

      const tradeDate = new Date(tradedAtMs);
      const weekDay = tradeDate.getUTCDay();
      const hour = tradeDate.getUTCHours();

      // Determine session
      let session_label = "other";
      if (hour >= 0 && hour < 8) session_label = "asia";
      else if (hour >= 8 && hour < 12) session_label = "london";
      else if (hour >= 12 && hour < 16) session_label = "ny";
      else if (hour >= 16 && hour < 21) session_label = "ny-after";
      else session_label = "asia";

      // Determine trade status
      const status = mt.exitPrice !== null || mt.pnl !== null
        ? ("CLOSED" as const)
        : ("OPEN" as const);

      await db.insert(trades).values({
        id: uuidv4(),
        userId: session.user.id,
        tradingAccountId: accountId!,
        symbol: mt.symbol,
        direction: mt.direction,
        entryPrice: mt.entryPrice,
        actualEntry: mt.entryPrice,
        actualExit: mt.exitPrice,
        stopLoss: mt.stopLoss,
        targetPrice: mt.targetPrice,
        positionSize: mt.positionSize,
        pnl: mt.pnl,
        actualR: mt.actualR,
        fees: mt.fees ?? 0,
        tradedAt: tradedAtMs,
        closedAt: closedAtMs,
        weekDay,
        session: session_label,
        strategy: mt.strategy,
        notes: mt.notes,
        status,
        source: "CSV",
        importBatch,
        idempotencyKey: mt.idempotencyKey,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      inserted++;
    }

    return NextResponse.json({
      success: true,
      inserted,
      skipped,
      errors: errors.length > 0 ? errors : undefined,
      importBatch,
    });
  } catch (error) {
    console.error("CSV import error:", error);
    return NextResponse.json(
      { error: "Failed to process CSV file" },
      { status: 500 }
    );
  }
}
