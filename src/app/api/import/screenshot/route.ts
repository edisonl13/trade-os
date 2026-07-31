import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { trades, tradingAccounts, tradeScreenshots } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import {
  classifySession,
  getHourInTz,
  getWeekdayInTz,
} from "@/lib/timezone";
import {
  preflightScreenshotTrades,
  validateScreenshotExtraction,
  type ScreenshotTradeExtraction as TradeExtraction,
} from "@/lib/screenshot-import";
import {
  getPersistentDatabaseError,
  hasPersistentDatabase,
} from "@/lib/database-persistence";

/* ──────────────────────────────
   Constants & Limits
   ────────────────────────────── */

const MAX_IMAGE_SIZE_MB = 10;
const MAX_IMAGE_SIZE_BYTES = MAX_IMAGE_SIZE_MB * 1024 * 1024;
const MAX_IMAGES_PER_REQUEST = 1;
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/bmp"];

// Rate limiting
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 3;
const rateLimitMap = new Map<string, { count: number; windowStart: number }>();

function checkUploadRateLimit(userId: string): boolean {
  const now = Date.now();
  for (const [key, item] of rateLimitMap) {
    if (now - item.windowStart > RATE_LIMIT_WINDOW) rateLimitMap.delete(key);
  }
  const entry = rateLimitMap.get(userId);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW) {
    rateLimitMap.set(userId, { count: 1, windowStart: now });
    return true;
  }
  if (entry.count >= MAX_REQUESTS_PER_WINDOW) return false;
  entry.count++;
  return true;
}

/* ──────────────────────────────
   Gemini API vision extraction
   ────────────────────────────── */

const VISION_MODEL = "gemini-3.5-flash-lite";
const MAX_VISION_OUTPUT_TOKENS = 2048;
const VISION_RESPONSE_SCHEMA = {
  type: "array",
  maxItems: 30,
  items: {
    type: "object",
    additionalProperties: false,
    properties: {
      symbol: {
        type: ["string", "null"],
        description: "Visible traded instrument or symbol.",
      },
      direction: {
        type: ["string", "null"],
        enum: ["LONG", "SHORT", null],
      },
      entryPrice: { type: ["number", "null"] },
      exitPrice: { type: ["number", "null"] },
      stopLoss: { type: ["number", "null"] },
      targetPrice: { type: ["number", "null"] },
      positionSize: { type: ["number", "null"] },
      pnl: {
        type: ["number", "null"],
        description: "Visible realized result with its displayed sign.",
      },
      tradedAt: {
        type: ["string", "null"],
        description: "Visible trade timestamp as an ISO 8601 string when possible.",
      },
      confidence: {
        type: "number",
        minimum: 0,
        maximum: 1,
        description: "Confidence that this visible row was transcribed correctly.",
      },
      evidence: {
        type: "string",
        description: "Short visible row or label text supporting the extraction. No hidden reasoning.",
      },
    },
    required: [
      "symbol",
      "direction",
      "entryPrice",
      "exitPrice",
      "stopLoss",
      "targetPrice",
      "positionSize",
      "pnl",
      "tradedAt",
      "confidence",
      "evidence",
    ],
  },
} as const;

class VisionExtractionError extends Error {
  constructor(
    message: string,
    readonly code: "VISION_NOT_CONFIGURED" | "VISION_INVALID_KEY" | "VISION_UNAVAILABLE" | "NO_SIGNALS",
  ) {
    super(message);
    this.name = "VisionExtractionError";
  }
}

async function extractWithGemini(
  imageBase64: string,
  mimeType: string,
  apiKey: string,
): Promise<TradeExtraction[]> {
  const prompt = `Transcribe every clearly visible completed or open trade row from this screenshot.

Rules:
- Use only text and numbers visible in the image. Never infer missing values.
- Preserve the displayed P&L sign.
- Convert Buy/Sell to LONG/SHORT only when the row clearly states it.
- If a field is not visible or ambiguous, return null.
- confidence measures transcription certainty for the visible row.
- evidence is a short visible row or label excerpt, not an explanation or hidden reasoning.
- Do not include account balances, totals, headings, empty rows, or non-trade orders.`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${VISION_MODEL}:generateContent`,
    {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType,
                data: imageBase64,
              },
            },
            { text: prompt },
          ],
        },
      ],
      generationConfig: {
        maxOutputTokens: MAX_VISION_OUTPUT_TOKENS,
        responseMimeType: "application/json",
        responseJsonSchema: VISION_RESPONSE_SCHEMA,
        thinkingConfig: {
          thinkingLevel: "minimal",
        },
      },
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const providerError = await response.json().catch(() => null);
    const providerStatus = providerError?.error?.status ?? null;
    const providerMessage = typeof providerError?.error?.message === "string"
      ? providerError.error.message.slice(0, 300)
      : null;
    console.error(JSON.stringify({
      event: "vision_provider_error",
      provider: "google-gemini",
      model: VISION_MODEL,
      status: response.status,
      providerStatus,
      providerMessage,
    }));
    if (
      providerStatus === "INVALID_ARGUMENT"
      && providerMessage?.toLowerCase().includes("api key not valid")
    ) {
      throw new VisionExtractionError("Vision provider API key is invalid", "VISION_INVALID_KEY");
    }
    throw new VisionExtractionError("Vision provider request failed", "VISION_UNAVAILABLE");
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts
    ?.map((part: { text?: string }) => part.text ?? "")
    .join("") ?? "";

  if (!text.trim()) {
    throw new VisionExtractionError("No trade records found in the image", "NO_SIGNALS");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new VisionExtractionError("Vision provider returned invalid data", "VISION_UNAVAILABLE");
  }

  // Validate and sanitize
  const validated = validateScreenshotExtraction(parsed);
  if (validated.length === 0) {
    throw new VisionExtractionError("No trade records found in the image", "NO_SIGNALS");
  }

  return validated;
}

/* ──────────────────────────────
   POST — Upload screenshot(s) and extract trades
   ────────────────────────────── */

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  const requestId = request.headers.get("x-vercel-id") ?? uuidv4();
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit
  if (!checkUploadRateLimit(session.user.id)) {
    return NextResponse.json(
      { error: "Too many requests. Please wait before uploading more images." },
      { status: 429 }
    );
  }

  try {
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      console.error(JSON.stringify({
        event: "vision_configuration_error",
        route: "/api/import/screenshot",
        requestId,
      }));
      return NextResponse.json(
        { error: "Image analysis is not configured", code: "VISION_NOT_CONFIGURED" },
        { status: 503 },
      );
    }

    const formData = await request.formData();
    const imageFiles: File[] = [];

    for (const [, value] of formData.entries()) {
      if (value instanceof File && value.type.startsWith("image/")) {
        imageFiles.push(value);
      }
    }

    if (imageFiles.length === 0) {
      return NextResponse.json({ error: "No images provided" }, { status: 400 });
    }

    if (imageFiles.length > MAX_IMAGES_PER_REQUEST) {
      return NextResponse.json(
        { error: `Maximum ${MAX_IMAGES_PER_REQUEST} images per request` },
        { status: 400 }
      );
    }

    // Validate each image
    for (const file of imageFiles) {
      if (!ALLOWED_MIME_TYPES.includes(file.type)) {
        return NextResponse.json(
          { error: `Unsupported format: ${file.type}. Allowed: JPEG, PNG, WebP, BMP` },
          { status: 400 }
        );
      }
      if (file.size > MAX_IMAGE_SIZE_BYTES) {
        return NextResponse.json(
          { error: `Image too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max: ${MAX_IMAGE_SIZE_MB}MB` },
          { status: 400 }
        );
      }
    }

    // Process each image
    const results = await Promise.all(
      imageFiles.map(async (imageFile) => {
        const buffer = Buffer.from(await imageFile.arrayBuffer());
        const base64 = buffer.toString("base64");
        const mimeType = imageFile.type;

        try {
          const trades = await extractWithGemini(base64, mimeType, geminiApiKey);
          return {
            success: true,
            fileName: imageFile.name,
            trades,
            count: trades.length,
          };
        } catch (err) {
          return {
            success: false,
            fileName: imageFile.name,
            error: err instanceof VisionExtractionError ? err.code : "VISION_UNAVAILABLE",
            trades: [],
            count: 0,
          };
        }
      })
    );

    // Flatten all trades from all images
    const allTrades = results.flatMap((r) => r.trades ?? []);
    const failedResults = results.filter((result) => !result.success);

    console.info(JSON.stringify({
      event: "vision_extraction_complete",
      route: "/api/import/screenshot",
      requestId,
      model: VISION_MODEL,
      imageCount: imageFiles.length,
      tradeCount: allTrades.length,
      failedImageCount: failedResults.length,
      durationMs: Date.now() - startedAt,
    }));

    if (failedResults.length === results.length) {
      const code = failedResults.some((result) => result.error === "VISION_INVALID_KEY")
        ? "VISION_INVALID_KEY"
        : failedResults.every((result) => result.error === "NO_SIGNALS")
          ? "NO_SIGNALS"
          : "VISION_UNAVAILABLE";
      return NextResponse.json(
        {
          error: code === "NO_SIGNALS"
            ? "No trade records found in the image"
            : code === "VISION_INVALID_KEY"
              ? "Image analysis credential is invalid"
              : "Image analysis is temporarily unavailable",
          code,
        },
        { status: code === "NO_SIGNALS" ? 422 : code === "VISION_INVALID_KEY" ? 503 : 502 },
      );
    }

    // Backward compatibility: if single image and single trade, return extraction directly
    if (imageFiles.length === 1 && results[0]?.success && allTrades.length === 1) {
      return NextResponse.json({
        success: true,
        extraction: allTrades[0],
        fileName: results[0].fileName,
      });
    }

    return NextResponse.json({
      success: true,
      total: imageFiles.length,
      totalTrades: allTrades.length,
      results,
    });
  } catch (error) {
    console.error(JSON.stringify({
      event: "vision_extraction_error",
      route: "/api/import/screenshot",
      requestId,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : "Unknown error",
    }));
    return NextResponse.json(
      { error: "Failed to process screenshots" },
      { status: 500 }
    );
  }
}

/* ──────────────────────────────
   PUT — Save a single edited trade
   ────────────────────────────── */

export async function PUT(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasPersistentDatabase()) {
    return NextResponse.json(getPersistentDatabaseError(), { status: 503 });
  }

  try {
    const body = await request.json();

    // Verify account ownership
    let accountId = body.tradingAccountId;
    if (accountId) {
      const account = await db.query.tradingAccounts.findFirst({
        where: and(
          eq(tradingAccounts.id, accountId),
          eq(tradingAccounts.userId, session.user.id)
        ),
      });
      if (!account) {
        return NextResponse.json(
          { error: "Trading account not found or access denied" },
          { status: 403 }
        );
      }
    } else {
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

    const requestedSourceTimezone =
      typeof body.sourceTimezone === "string" ? body.sourceTimezone : "";
    const preflight = preflightScreenshotTrades(
      [body as Record<string, unknown>],
      requestedSourceTimezone
    );
    if (preflight.errors.length > 0) {
      const needsTimezone = preflight.errors.some(
        (error) => error.error === "Source timezone required"
      );
      return NextResponse.json(
        {
          error: needsTimezone
            ? "Source timezone is required for a trade time without a UTC offset."
            : "Symbol, direction and a valid trade time are required.",
          code: needsTimezone
            ? "SOURCE_TIMEZONE_REQUIRED"
            : "SCREENSHOT_PREFLIGHT_FAILED",
          errors: preflight.errors,
        },
        { status: 400 }
      );
    }
    const preparedTrade = preflight.trades[0];
    const {
      symbol,
      direction,
      sourceTimezone,
      tradedAtMs,
      entryPrice,
      exitPrice,
      stopLoss,
      targetPrice,
      positionSize,
      pnl: reportedPnl,
    } = preparedTrade;
    const selectedAccount = await db.query.tradingAccounts.findFirst({
      where: and(
        eq(tradingAccounts.id, accountId!),
        eq(tradingAccounts.userId, session.user.id)
      ),
    });
    const accountTimezone = selectedAccount?.timezone ?? "UTC";
    const weekDay = getWeekdayInTz(tradedAtMs, accountTimezone);
    const sessionLabel = classifySession(getHourInTz(tradedAtMs, accountTimezone));

    const tradeId = uuidv4();
    // Only mark CLOSED if there's definitive exit evidence
    const status =
      reportedPnl !== null
        ? "CLOSED"
        : exitPrice !== null
          ? "CLOSED"
          : "OPEN";

    await db.insert(trades).values({
      id: tradeId,
      userId: session.user.id,
      tradingAccountId: accountId!,
      symbol,
      direction,
      entryPrice,
      actualEntry: entryPrice,
      actualExit: exitPrice,
      stopLoss,
      targetPrice,
      positionSize,
      pnl: reportedPnl,
      grossPnl: null,
      netPnl: reportedPnl,
      pnlMode: reportedPnl === null ? "UNKNOWN" : "SOURCE_REPORTED",
      resultCurrency: selectedAccount?.currency ?? null,
      resultCurrencySource: selectedAccount?.currency ? "ACCOUNT" : "UNKNOWN",
      fees: null,
      tradedAt: tradedAtMs,
      weekDay,
      session: sessionLabel,
      sourceTimezone,
      timezone: accountTimezone,
      notes: body.notes ?? null,
      status: status as "OPEN" | "CLOSED",
      source: "SCREENSHOT",
      confirmedByUser: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    if (body.screenshotUrl) {
      await db.insert(tradeScreenshots).values({
        id: uuidv4(),
        tradeId,
        url: body.screenshotUrl,
        extractedFields: JSON.stringify(body.extractedFields ?? {}),
        createdAt: Date.now(),
      });
    }

    return NextResponse.json({ success: true, tradeId }, { status: 201 });
  } catch (error) {
    console.error("Save screenshot trade error:", error);
    return NextResponse.json(
      { error: "Failed to save trade" },
      { status: 500 }
    );
  }
}

/* ──────────────────────────────
   PATCH — Batch save multiple trades (user-confirmed)
   ────────────────────────────── */

export async function PATCH(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasPersistentDatabase()) {
    return NextResponse.json(getPersistentDatabaseError(), { status: 503 });
  }

  try {
    const body = await request.json();
    const trades_data = body.trades as Record<string, unknown>[];

    if (!trades_data || trades_data.length === 0) {
      return NextResponse.json({ error: "No trades provided" }, { status: 400 });
    }

    if (trades_data.length > 50) {
      return NextResponse.json(
        { error: "Maximum 50 trades per batch" },
        { status: 400 }
      );
    }

    // Verify account ownership
    let accountId = body.tradingAccountId;
    if (accountId) {
      const account = await db.query.tradingAccounts.findFirst({
        where: and(
          eq(tradingAccounts.id, accountId),
          eq(tradingAccounts.userId, session.user.id)
        ),
      });
      if (!account) {
        return NextResponse.json(
          { error: "Trading account not found or access denied" },
          { status: 403 }
        );
      }
    } else {
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

    const selectedAccount = await db.query.tradingAccounts.findFirst({
      where: and(
        eq(tradingAccounts.id, accountId!),
        eq(tradingAccounts.userId, session.user.id)
      ),
    });
    const accountTimezone = selectedAccount?.timezone ?? "UTC";
    const requestedSourceTimezone =
      typeof body.sourceTimezone === "string" ? body.sourceTimezone : "";
    const preflight = preflightScreenshotTrades(
      trades_data,
      requestedSourceTimezone
    );
    if (preflight.errors.length > 0) {
      return NextResponse.json(
        {
          error: "No trades were saved because required image fields need correction.",
          code: "SCREENSHOT_PREFLIGHT_FAILED",
          errors: preflight.errors,
        },
        { status: 422 }
      );
    }

    let saved = 0;
    const errors: { index: number; error: string }[] = [];
    const preparedTrades = preflight.trades;
    for (let i = 0; i < preparedTrades.length; i++) {
      const t = preparedTrades[i];
      try {
        const tradeId = uuidv4();
        const weekDay = getWeekdayInTz(t.tradedAtMs!, accountTimezone);
        const sessionLabel = classifySession(
          getHourInTz(t.tradedAtMs!, accountTimezone)
        );
        const status =
          t.pnl !== null || t.exitPrice !== null ? "CLOSED" : "OPEN";

        await db.insert(trades).values({
          id: tradeId,
          userId: session.user.id,
          tradingAccountId: accountId!,
          symbol: t.symbol,
          direction: t.direction!,
          entryPrice: t.entryPrice,
          actualEntry: t.entryPrice,
          actualExit: t.exitPrice,
          stopLoss: t.stopLoss,
          targetPrice: t.targetPrice,
          positionSize: t.positionSize,
          pnl: t.pnl,
          grossPnl: null,
          netPnl: t.pnl,
          pnlMode: t.pnl === null ? "UNKNOWN" : "SOURCE_REPORTED",
          resultCurrency: selectedAccount?.currency ?? null,
          resultCurrencySource: selectedAccount?.currency
            ? "ACCOUNT"
            : "UNKNOWN",
          fees: null,
          tradedAt: t.tradedAtMs!,
          weekDay,
          session: sessionLabel,
          sourceTimezone: t.sourceTimezone,
          timezone: accountTimezone,
          status: status as "OPEN" | "CLOSED",
          source: "SCREENSHOT",
          confirmedByUser: true,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        saved++;
      } catch {
        errors.push({ index: i, error: "Failed to save" });
      }
    }

    return NextResponse.json({
      success: true,
      saved,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("Batch save error:", error);
    return NextResponse.json(
      { error: "Failed to save trades" },
      { status: 500 }
    );
  }
}
