import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { importBatches, trades, tradingAccounts } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { createHash } from "node:crypto";
import {
  autoMapColumns,
  applyMapping,
  detectCsvSourceKind,
  detectImportPlatform,
  normalizeCurrencyCode,
  type ColumnMapping,
} from "@/lib/import-csv";
import { parseImportFileContent } from "@/lib/import-file";
import {
  getImportConfirmationError,
  type FeeSignConvention,
  type PnlMode,
} from "@/lib/import-confirmation";
import {
  classifySession,
  getHourInTz,
  getWeekdayInTz,
  isValidTimezone,
  parseTimestampInTimezone,
} from "@/lib/timezone";

const IMPORT_ADAPTER_VERSION = "2026-07-28.1";

function timestampHasExplicitZone(value: string | null): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  return (
    /^\d{10,13}$/.test(trimmed) ||
    /(?:Z|[+-]\d{2}:?\d{2})$/i.test(trimmed)
  );
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let activeImportBatchId: string | null = null;

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const mappingsJson = formData.get("mappings") as string | null;
    const tradingAccountId = formData.get("tradingAccountId") as string | null;
    const requestedSourceTimezone = formData.get("sourceTimezone") as string | null;
    const requestedPnlMode = formData.get("pnlMode");
    const pnlMode: PnlMode =
      requestedPnlMode === "GROSS" || requestedPnlMode === "NET"
        ? requestedPnlMode
        : "UNKNOWN";
    const feesConfirmed = formData.get("feesConfirmed") === "true";
    const requestedFeeSignConvention = formData.get("feeSignConvention");
    const feeSignConvention: FeeSignConvention =
      requestedFeeSignConvention === "SIGNED" ||
      requestedFeeSignConvention === "COSTS_POSITIVE"
        ? requestedFeeSignConvention
        : "UNKNOWN";

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Import files must be 5 MB or smaller." },
        { status: 413 }
      );
    }

    // Read file content
    const fileContent = await file.text();
    const fileHash = createHash("sha256")
      .update(fileContent, "utf8")
      .digest("hex");

    // Parse supported CSV or MT4 HTML without executing uploaded markup.
    const parsed = parseImportFileContent(file.name, fileContent);
    if (parsed.headers.length === 0) {
      return NextResponse.json(
        {
          error:
            parsed.error ??
            "Could not parse trade history headers. Check the file format.",
        },
        { status: 400 }
      );
    }

    const sourceKind = detectCsvSourceKind(parsed.headers);
    const detectedBroker = detectImportPlatform(parsed.headers, sourceKind);

    // Auto-map columns (or use provided mappings)
    let mappings: ColumnMapping[];
    if (mappingsJson) {
      mappings = JSON.parse(mappingsJson) as ColumnMapping[];
    } else {
      mappings = autoMapColumns(parsed.headers, detectedBroker);
    }

    // If this is a preview request, return parsed data without saving
    if (formData.get("preview") === "true") {
      const previewTrades = applyMapping(parsed.rows, mappings, "preview");
      const hasNaiveTimestamps = previewTrades.some(
        (trade) =>
          (trade.tradedAt && !timestampHasExplicitZone(trade.tradedAt)) ||
          (trade.closedAt && !timestampHasExplicitZone(trade.closedAt))
      );
      const validRequestedSourceTimezone =
        requestedSourceTimezone !== null &&
        isValidTimezone(requestedSourceTimezone);
      const invalidRows = previewTrades
        .map((trade) => {
          const errors = [...trade.validationErrors];
          const canValidateTimestamp =
            (!trade.tradedAt ||
              timestampHasExplicitZone(trade.tradedAt) ||
              validRequestedSourceTimezone) &&
            (!trade.closedAt ||
              timestampHasExplicitZone(trade.closedAt) ||
              validRequestedSourceTimezone);
          if (canValidateTimestamp) {
            const previewTimezone = requestedSourceTimezone ?? "UTC";
            const tradedAtMs = trade.tradedAt
              ? parseTimestampInTimezone(trade.tradedAt, previewTimezone)
              : null;
            if (tradedAtMs === null && !errors.includes("Missing trade time")) {
              errors.push("Missing or invalid trade time");
            }
            if (trade.closedAt) {
              const closedAtMs = parseTimestampInTimezone(
                trade.closedAt,
                previewTimezone
              );
              if (closedAtMs === null) {
                errors.push("Invalid close time");
              } else if (tradedAtMs !== null && closedAtMs < tradedAtMs) {
                errors.push("Close time is before open time");
              }
            }
          }
          return {
            row: trade.rowIndex + 1,
            errors,
          };
        })
        .filter((row) => row.errors.length > 0);
      const reportedResultCurrencies = [
        ...new Set(
          previewTrades
            .map((trade) => trade.resultCurrency)
            .filter((currency): currency is string => currency !== null)
        ),
      ].sort();
      return NextResponse.json({
        headers: parsed.headers,
        totalRows: parsed.totalRows,
        sampleRows: parsed.rows.slice(0, 5),
        mappedSample: previewTrades.slice(0, 5),
        invalidRows: invalidRows.slice(0, 100),
        invalidRowCount: invalidRows.length,
        detectedBroker,
        fileFormat: parsed.format,
        sourceSummary: parsed.sourceSummary ?? null,
        sourceKind,
        sourceMetadata: {
          originalFileName: file.name,
          fileFormat: parsed.format,
          fileHash,
          fileSize: file.size,
          sourcePlatform: detectedBroker,
          platformDetection: detectedBroker ? "DETECTED" : "UNKNOWN",
          adapterVersion: IMPORT_ADAPTER_VERSION,
          reportedResultCurrencies,
          usesAccountCurrencyFallback: previewTrades.some(
            (trade) => trade.pnl !== null && trade.resultCurrency === null
          ),
        },
        importability:
          sourceKind === "ORDER_HISTORY_REQUIRES_LOT_MATCHING"
            ? {
                canSave: false,
                code: "ORDER_HISTORY_REQUIRES_LOT_MATCHING",
                message:
                  "This file contains orders/fills rather than completed trades. Buy and sell fills must be matched before realized P&L can be imported.",
              }
            : sourceKind === "EXECUTION_HISTORY_REQUIRES_POSITION_MATCHING"
              ? {
                  canSave: false,
                  code: "EXECUTION_HISTORY_REQUIRES_POSITION_MATCHING",
                  message:
                    "This file contains executions and partial fills. They must be grouped into positions before completed trades can be saved.",
                }
              : sourceKind === "UNKNOWN"
                ? {
                    canSave: false,
                    code: "UNSUPPORTED_TRADE_HISTORY",
                    message:
                      "This file does not contain a recognized completed-trade history schema.",
                  }
                : { canSave: true },
        mappings,
        requiredConfirmations: {
          sourceTimezone:
            hasNaiveTimestamps && !validRequestedSourceTimezone,
          pnlMode: pnlMode === "UNKNOWN",
          feeSignConvention:
            pnlMode === "GROSS" && feeSignConvention === "UNKNOWN",
        },
      });
    }

    if (sourceKind === "ORDER_HISTORY_REQUIRES_LOT_MATCHING") {
      return NextResponse.json(
        {
          error:
            "Order history cannot be saved as completed trades until fills are matched.",
          code: "ORDER_HISTORY_REQUIRES_LOT_MATCHING",
        },
        { status: 422 }
      );
    }

    if (sourceKind === "EXECUTION_HISTORY_REQUIRES_POSITION_MATCHING") {
      return NextResponse.json(
        {
          error:
            "Execution history cannot be saved as completed trades until partial fills are grouped into positions.",
          code: "EXECUTION_HISTORY_REQUIRES_POSITION_MATCHING",
        },
        { status: 422 }
      );
    }

    if (sourceKind === "UNKNOWN") {
      return NextResponse.json(
        {
          error:
            "This file does not contain a recognized completed-trade history schema.",
          code: "UNSUPPORTED_TRADE_HISTORY",
        },
        { status: 422 }
      );
    }

    const confirmationError = getImportConfirmationError({
      pnlMode,
      feesConfirmed,
      feeSignConvention,
    });
    if (confirmationError) {
      return NextResponse.json(
        {
          error: confirmationError.message,
          code: confirmationError.code,
        },
        { status: 400 }
      );
    }

    if (
      requestedSourceTimezone &&
      !isValidTimezone(requestedSourceTimezone)
    ) {
      return NextResponse.json(
        { error: "Invalid source timezone" },
        { status: 400 }
      );
    }

    // Use only an account owned by the signed-in user.
    let accountId = tradingAccountId;
    let selectedAccount = accountId
      ? await db.query.tradingAccounts.findFirst({
          where: and(
            eq(tradingAccounts.id, accountId),
            eq(tradingAccounts.userId, session.user.id)
          ),
        })
      : await db.query.tradingAccounts.findFirst({
          where: eq(tradingAccounts.userId, session.user.id),
        });

    if (accountId && !selectedAccount) {
      return NextResponse.json(
        { error: "Trading account not found or access denied" },
        { status: 403 }
      );
    }

    if (!selectedAccount) {
      accountId = uuidv4();
      const now = Date.now();
      await db.insert(tradingAccounts).values({
        id: accountId,
        userId: session.user.id,
        label: "Default",
        currency: "USD",
        initialBalance: 0,
        timezone: "UTC",
        createdAt: now,
        updatedAt: now,
      });
      selectedAccount = await db.query.tradingAccounts.findFirst({
        where: and(
          eq(tradingAccounts.id, accountId),
          eq(tradingAccounts.userId, session.user.id)
        ),
      });
    } else {
      accountId = selectedAccount.id;
    }

    const accountTimezone = selectedAccount?.timezone ?? "UTC";
    const accountCurrency = normalizeCurrencyCode(selectedAccount?.currency);
    if (!accountCurrency) {
      return NextResponse.json(
        {
          error:
            "The selected trading account needs a valid result currency before trades can be imported.",
          code: "ACCOUNT_CURRENCY_REQUIRED",
        },
        { status: 400 }
      );
    }

    // Apply mapping and prepare trades for insert
    const importBatch = uuidv4();
    const mappedTrades = applyMapping(
      parsed.rows,
      mappings,
      accountId!
    );
    const hasNaiveTimestamps = mappedTrades.some(
      (trade) =>
        (trade.tradedAt && !timestampHasExplicitZone(trade.tradedAt)) ||
        (trade.closedAt && !timestampHasExplicitZone(trade.closedAt))
    );
    if (hasNaiveTimestamps && !requestedSourceTimezone) {
      return NextResponse.json(
        {
          error:
            "Source timezone is required because the CSV contains local timestamps without a UTC offset.",
          code: "SOURCE_TIMEZONE_REQUIRED",
        },
        { status: 400 }
      );
    }
    const sourceTimezone = requestedSourceTimezone ?? "UTC";

    // Validate every row before inserting any row. Invalid files must not
    // produce a partial import.
    const preflightErrors: { row: number; error: string }[] = [];
    for (const mt of mappedTrades) {
      if (mt.validationErrors.length > 0 || !mt.direction) {
        preflightErrors.push({
          row: mt.rowIndex + 1,
          error: mt.validationErrors.join("; ") || "Invalid direction",
        });
        continue;
      }

      const tradedAtMs = mt.tradedAt
        ? parseTimestampInTimezone(mt.tradedAt, sourceTimezone)
        : null;
      if (tradedAtMs === null) {
        preflightErrors.push({
          row: mt.rowIndex + 1,
          error: "Missing or invalid trade time",
        });
        continue;
      }

      if (mt.closedAt) {
        const closedAtMs = parseTimestampInTimezone(
          mt.closedAt,
          sourceTimezone
        );
        if (closedAtMs === null) {
          preflightErrors.push({
            row: mt.rowIndex + 1,
            error: "Invalid close time",
          });
        } else if (closedAtMs < tradedAtMs) {
          preflightErrors.push({
            row: mt.rowIndex + 1,
            error: "Close time is before open time",
          });
        }
      }
    }

    if (preflightErrors.length > 0) {
      return NextResponse.json(
        {
          error:
            "No trades were imported because one or more rows require correction.",
          code: "IMPORT_PREFLIGHT_FAILED",
          errors: preflightErrors.slice(0, 100),
          invalidRowCount: preflightErrors.length,
        },
        { status: 422 }
      );
    }

    const resultCurrencies = [
      ...new Set(
        mappedTrades.map(
          (trade) => trade.resultCurrency ?? accountCurrency
        )
      ),
    ].sort();
    const hasSourceResultCurrency = mappedTrades.some(
      (trade) => trade.resultCurrency !== null
    );
    const hasAccountCurrencyFallback = mappedTrades.some(
      (trade) => trade.resultCurrency === null
    );
    const batchResultCurrencySource =
      hasSourceResultCurrency && hasAccountCurrencyFallback
        ? "MIXED"
        : hasSourceResultCurrency
          ? "SOURCE"
          : "ACCOUNT";

    const importCreatedAt = Date.now();
    await db.insert(importBatches).values({
      id: importBatch,
      userId: session.user.id,
      tradingAccountId: accountId!,
      originalFileName: file.name,
      fileFormat: parsed.format,
      fileHash,
      fileSize: file.size,
      sourcePlatform: detectedBroker,
      platformDetection: detectedBroker ? "DETECTED" : "UNKNOWN",
      sourceKind,
      adapterVersion: IMPORT_ADAPTER_VERSION,
      sourceTimezone,
      sourceTimezoneConfirmed: requestedSourceTimezone !== null,
      pnlMode,
      feeSignConvention,
      feesConfirmed,
      accountCurrency,
      resultCurrencies: JSON.stringify(resultCurrencies),
      resultCurrencySource: batchResultCurrencySource,
      totalRows: parsed.totalRows,
      validRows: mappedTrades.length,
      invalidRows: 0,
      duplicateRows: 0,
      insertedRows: 0,
      status: "PROCESSING",
      createdAt: importCreatedAt,
    });
    activeImportBatchId = importBatch;

    // Insert trades only after the whole file passes preflight.
    let inserted = 0;
    let skipped = 0;
    let pnlIncomplete = 0;
    const errors: { row: number; error: string }[] = [];
    for (const mt of mappedTrades) {
      // The preflight above rejects this case for the whole file. Keep the
      // guard here as a defensive type boundary before the database insert.
      if (!mt.direction) {
        errors.push({
          row: mt.rowIndex + 1,
          error: "Invalid direction",
        });
        continue;
      }

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

      // Invalid or missing source time must be corrected by the user.
      const tradedAtMs = mt.tradedAt
        ? parseTimestampInTimezone(mt.tradedAt, sourceTimezone)
        : null;
      if (tradedAtMs === null) {
        errors.push({
          row: mt.rowIndex + 1,
          error: "Missing or invalid trade time",
        });
        continue;
      }

      let closedAtMs: number | null = null;
      if (mt.closedAt) {
        const parsedClosedAt = parseTimestampInTimezone(
          mt.closedAt,
          sourceTimezone
        );
        if (parsedClosedAt === null) {
          errors.push({
            row: mt.rowIndex + 1,
            error: "Invalid close time",
          });
          continue;
        }
        closedAtMs = parsedClosedAt;
      }

      if (closedAtMs !== null && closedAtMs < tradedAtMs) {
        errors.push({
          row: mt.rowIndex + 1,
          error: "Close time is before open time",
        });
        continue;
      }

      const weekDay = getWeekdayInTz(tradedAtMs, accountTimezone);
      const sessionLabel = classifySession(
        getHourInTz(tradedAtMs, accountTimezone)
      );

      // Determine trade status
      const status = closedAtMs !== null || mt.exitPrice !== null || mt.pnl !== null
        ? ("CLOSED" as const)
        : ("OPEN" as const);
      const toSignedAdjustment = (value: number | null) => {
        if (value === null) return null;
        return feeSignConvention === "COSTS_POSITIVE" ? -value : value;
      };
      const commission = toSignedAdjustment(mt.commission);
      const swap = toSignedAdjustment(mt.swap);
      const otherFees = toSignedAdjustment(mt.otherFees);
      const signedAdjustments =
        (commission ?? 0) + (swap ?? 0) + (otherFees ?? 0);
      const netPnl =
        mt.pnl === null
          ? null
          : pnlMode === "NET"
            ? mt.pnl
            : pnlMode === "GROSS" &&
                feesConfirmed &&
                feeSignConvention !== "UNKNOWN"
              ? mt.pnl + signedAdjustments
              : null;
      const grossPnl = pnlMode === "GROSS" ? mt.pnl : null;
      if (status === "CLOSED" && netPnl === null) pnlIncomplete++;

      await db.insert(trades).values({
        id: uuidv4(),
        userId: session.user.id,
        tradingAccountId: accountId!,
        sourceSymbol: mt.sourceSymbol,
        sourceTradeId: mt.sourceTradeId,
        symbol: mt.symbol,
        direction: mt.direction,
        entryPrice: mt.entryPrice,
        actualEntry: mt.entryPrice,
        actualExit: mt.exitPrice,
        stopLoss: mt.stopLoss,
        targetPrice: mt.targetPrice,
        positionSize: mt.positionSize,
        initialRiskAmount: mt.initialRiskAmount,
        pnl: mt.pnl,
        grossPnl,
        netPnl,
        pnlMode,
        resultCurrency: mt.resultCurrency ?? accountCurrency,
        resultCurrencySource: mt.resultCurrency ? "SOURCE" : "ACCOUNT",
        actualR: mt.actualR,
        fees: signedAdjustments,
        commission,
        swap,
        otherFees,
        tradedAt: tradedAtMs,
        closedAt: closedAtMs,
        sourceTimezone,
        timezone: accountTimezone,
        weekDay,
        session: sessionLabel,
        strategy: mt.strategy,
        notes: mt.notes,
        status,
        source: parsed.format,
        importBatch,
        idempotencyKey: mt.idempotencyKey,
        confirmedByUser: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      inserted++;
    }

    await db
      .update(importBatches)
      .set({
        duplicateRows: skipped,
        insertedRows: inserted,
        status: errors.length > 0 ? "PARTIAL" : "COMPLETED",
        failureCode:
          errors.length > 0 ? "ROW_INSERT_OR_REVALIDATION_FAILED" : null,
        completedAt: Date.now(),
      })
      .where(
        and(
          eq(importBatches.id, importBatch),
          eq(importBatches.userId, session.user.id)
        )
      );
    activeImportBatchId = null;

    return NextResponse.json({
      success: true,
      inserted,
      skipped,
      errors: errors.length > 0 ? errors : undefined,
      importBatch,
      pnlMode,
      feeSignConvention,
      pnlIncomplete,
      sourceTimezone,
      accountTimezone,
      resultCurrencies,
      resultCurrencySource: batchResultCurrencySource,
      fileFormat: parsed.format,
    });
  } catch (error) {
    if (activeImportBatchId) {
      try {
        await db
          .update(importBatches)
          .set({
            status: "FAILED",
            failureCode: "UNEXPECTED_IMPORT_ERROR",
            completedAt: Date.now(),
          })
          .where(
            and(
              eq(importBatches.id, activeImportBatchId),
              eq(importBatches.userId, session.user.id)
            )
          );
      } catch (batchUpdateError) {
        console.error("Import batch failure update error:", batchUpdateError);
      }
    }
    console.error("Trade history import error:", error);
    return NextResponse.json(
      { error: "Failed to process trade history file" },
      { status: 500 }
    );
  }
}
