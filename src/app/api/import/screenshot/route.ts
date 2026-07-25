import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { trades, tradingAccounts, tradeScreenshots } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

/* ──────────────────────────────
   Constants & Limits
   ────────────────────────────── */

const MAX_IMAGE_SIZE_MB = 10;
const MAX_IMAGE_SIZE_BYTES = MAX_IMAGE_SIZE_MB * 1024 * 1024;
const MAX_IMAGES_PER_REQUEST = 5;
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/bmp"];

// Rate limiting
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 10;
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
   Types
   ────────────────────────────── */

interface ExtractedField {
  field: string;
  value: string | number | null;
  confidence: number;
  source: "ai" | "user";
}

interface TradeExtraction {
  symbol: string | null;
  direction: "LONG" | "SHORT" | null;
  entryPrice: number | null;
  exitPrice: number | null;
  stopLoss: number | null;
  targetPrice: number | null;
  positionSize: number | null;
  pnl: number | null;
  tradedAt: string | null;
  fields: ExtractedField[];
}

const VALID_FIELDS = [
  "symbol", "direction", "entryPrice", "exitPrice", "stopLoss",
  "targetPrice", "positionSize", "pnl", "tradedAt",
] as const;

/**
 * Validate and sanitize AI-extracted trade data.
 */
function validateExtraction(data: unknown): TradeExtraction[] {
  if (!Array.isArray(data)) return [];

  return data
    .map((item: any, idx: number): TradeExtraction | null => {
      if (!item || typeof item !== "object") return null;

      const symbol = typeof item.symbol === "string" ? item.symbol.toUpperCase().trim().slice(0, 20) : null;
      const direction = item.direction === "SHORT" ? "SHORT" : item.direction === "LONG" ? "LONG" : null;
      const entryPrice = typeof item.entryPrice === "number" && isFinite(item.entryPrice) ? item.entryPrice : null;
      const exitPrice = typeof item.exitPrice === "number" && isFinite(item.exitPrice) ? item.exitPrice : null;
      const stopLoss = typeof item.stopLoss === "number" && isFinite(item.stopLoss) ? item.stopLoss : null;
      const targetPrice = typeof item.targetPrice === "number" && isFinite(item.targetPrice) ? item.targetPrice : null;
      const positionSize = typeof item.positionSize === "number" && isFinite(item.positionSize) ? item.positionSize : null;
      const pnl = typeof item.pnl === "number" && isFinite(item.pnl) ? item.pnl : null;

      let tradedAt: string | null = null;
      if (typeof item.tradedAt === "string") {
        const d = new Date(item.tradedAt);
        if (!isNaN(d.getTime())) {
          tradedAt = d.toISOString();
        }
      }

      const fields: ExtractedField[] = [];
      for (const field of VALID_FIELDS) {
        if (item[field] !== undefined && item[field] !== null) {
          fields.push({
            field,
            value: item[field],
            confidence: typeof item.confidence === "number" ? Math.min(1, Math.max(0, item.confidence)) : 0.5,
            source: "ai",
          });
        }
      }

      // Must have at least a symbol to be useful
      if (!symbol) return null;

      return { symbol, direction, entryPrice, exitPrice, stopLoss, targetPrice, positionSize, pnl, tradedAt, fields };
    })
    .filter((t): t is TradeExtraction => t !== null);
}

/* ──────────────────────────────
   Gemini API vision extraction
   ────────────────────────────── */

const VISION_MODEL = "gemini-3.1-flash-lite";
const MAX_VISION_OUTPUT_TOKENS = 4096;

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
  const prompt = `Extract ALL trade records from this trading screenshot.

Return ONLY a valid JSON array. Each trade object:
{
  "symbol": "PAIR e.g. EURUSD",
  "direction": "LONG or SHORT",
  "entryPrice": number or null,
  "exitPrice": number or null,
  "stopLoss": number or null,
  "targetPrice": number or null,
  "positionSize": number or null,
  "pnl": number or null,
  "tradedAt": "ISO date string or null"
}

Rules:
- Extract EVERY visible trade. Do not skip any.
- If a field is not visible, use null. Never invent values.
- Direction must be "LONG" or "SHORT".
- Return only fields visible in the image.`;

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
        thinkingConfig: {
          thinkingLevel: "minimal",
        },
      },
    }),
    signal: AbortSignal.timeout(45_000),
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

  // Extract JSON array from response
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new VisionExtractionError("No trade records found in the image", "NO_SIGNALS");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    throw new VisionExtractionError("Vision provider returned invalid data", "VISION_UNAVAILABLE");
  }

  // Validate and sanitize
  const validated = validateExtraction(parsed);
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

    const tradeId = uuidv4();
    // Only mark CLOSED if there's definitive exit evidence
    const status =
      body.pnl !== undefined && body.pnl !== null
        ? "CLOSED"
        : body.exitPrice !== undefined && body.exitPrice !== null
          ? "CLOSED"
          : "OPEN";

    await db.insert(trades).values({
      id: tradeId,
      userId: session.user.id,
      tradingAccountId: accountId!,
      symbol: body.symbol?.toUpperCase() ?? "UNKNOWN",
      direction: body.direction ?? "LONG",
      entryPrice: body.entryPrice ?? null,
      actualEntry: body.entryPrice ?? null,
      actualExit: body.exitPrice ?? null,
      stopLoss: body.stopLoss ?? null,
      targetPrice: body.targetPrice ?? null,
      positionSize: body.positionSize ?? null,
      pnl: body.pnl ?? null,
      fees: 0,
      tradedAt: tradedAtMs,
      weekDay,
      session: session_label,
      notes: body.notes ?? null,
      status: status as "OPEN" | "CLOSED",
      source: "SCREENSHOT",
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

    let saved = 0;
    const errors: { index: number; error: string }[] = [];

    for (let i = 0; i < trades_data.length; i++) {
      const t = trades_data[i];
      try {
        // Validate required fields
        if (!t.symbol) {
          errors.push({ index: i, error: "Missing symbol" });
          continue;
        }

        const tradedAtMs = (t as { tradedAt?: string }).tradedAt
          ? new Date((t as { tradedAt: string }).tradedAt).getTime()
          : Date.now();
        const tradeDate = new Date(tradedAtMs);
        const weekDay = tradeDate.getUTCDay();
        const hour = tradeDate.getUTCHours();

        let session_label = "other";
        if (hour >= 0 && hour < 8) session_label = "asia";
        else if (hour >= 8 && hour < 12) session_label = "london";
        else if (hour >= 12 && hour < 16) session_label = "ny";
        else if (hour >= 16 && hour < 21) session_label = "ny-after";

        const tradeId = uuidv4();
        const dir: "LONG" | "SHORT" =
          (t.direction as string)?.toUpperCase() === "SHORT" ? "SHORT" : "LONG";
        const st =
          (t as { pnl?: number }).pnl !== undefined && (t as { pnl?: number }).pnl !== null
            ? "CLOSED"
            : (t as { exitPrice?: number }).exitPrice !== undefined && (t as { exitPrice?: number }).exitPrice !== null
              ? "CLOSED"
              : "OPEN";

        await db.insert(trades).values({
          id: tradeId,
          userId: session.user.id,
          tradingAccountId: accountId!,
          symbol: ((t.symbol as string) ?? "UNKNOWN").toUpperCase(),
          direction: dir,
          entryPrice: (t.entryPrice as number) ?? null,
          actualEntry: (t.entryPrice as number) ?? null,
          actualExit: (t.exitPrice as number) ?? null,
          stopLoss: (t.stopLoss as number) ?? null,
          targetPrice: (t.targetPrice as number) ?? null,
          positionSize: (t.positionSize as number) ?? null,
          pnl: (t.pnl as number) ?? null,
          fees: 0,
          tradedAt: tradedAtMs,
          weekDay,
          session: session_label,
          status: st as "OPEN" | "CLOSED",
          source: "SCREENSHOT",
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
