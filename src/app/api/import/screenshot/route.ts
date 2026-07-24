import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { trades, tradingAccounts, tradeScreenshots } from "@/db/schema";
import { eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

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

/**
 * Extract ALL trades from a single screenshot.
 * Tries DeepSeek first, then Gemini, then falls back to mock data.
 */
async function extractTradesFromScreenshot(
  imageBase64: string,
  mimeType: string
): Promise<TradeExtraction[]> {
  const deepseekKey = process.env.DEEPSEEK_API_KEY;

  if (!deepseekKey) {
    throw new Error("DEEPSEEK_API_KEY is not configured");
  }

  // Try DeepSeek API
  try {
    const result = await extractWithDeepSeek(imageBase64, mimeType, deepseekKey);
    return result;
  } catch (error: any) {
    console.error("DeepSeek extraction failed:", error);
    throw new Error(`AI extraction failed: ${error.message}`);
  }
}

/**
 * Call Gemini Vision API to extract ALL trades from a screenshot.
 */
async function extractWithGemini(
  imageBase64: string,
  mimeType: string,
  apiKey: string
): Promise<TradeExtraction[]> {
  const prompt = `You are a trade data extraction assistant. Extract ALL trade records visible in this trading screenshot.

Return ONLY valid JSON — an array of trade objects:
[
  {
    "symbol": "instrument/pair e.g. EURUSD",
    "direction": "LONG or SHORT",
    "entryPrice": number or null,
    "exitPrice": number or null,
    "stopLoss": number or null,
    "targetPrice": number or null,
    "positionSize": number or null,
    "pnl": number or null,
    "tradedAt": "ISO date string or null",
    "fields": [
      {"field": "fieldName", "value": value, "confidence": 0.0-1.0}
    ]
  }
]

RULES:
- Extract EVERY trade visible in the image.
- If a field is not visible, set it to null. Do NOT invent values.
- pnl is the profit/loss in account currency.
- direction must be "LONG" or "SHORT".
- Return empty array [] if no trades are found.`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType,
                  data: imageBase64,
                },
              },
            ],
          },
        ],
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

  // Extract JSON array from response
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error("No JSON array found in Gemini response");

  const results = JSON.parse(jsonMatch[0]);
  return Array.isArray(results) ? results : [];
}

/**
 * Call DeepSeek Vision API to extract ALL trades from a screenshot.
 */
async function extractWithDeepSeek(
  imageBase64: string,
  mimeType: string,
  apiKey: string
): Promise<TradeExtraction[]> {
  const dataUri = `data:${mimeType};base64,${imageBase64}`;

  const prompt = `Extract ALL trades from this trading screenshot. There are 10-15 trades visible. Count each one and do NOT miss any.

Return ONLY valid JSON array. Each trade:
{"symbol":"PAIR","direction":"LONG/SHORT","entryPrice":num|null,"exitPrice":num|null,"stopLoss":num|null,"targetPrice":num|null,"positionSize":num|null,"pnl":num|null,"tradedAt":"ISO date string"}

Rules:
- Extract EVERY single trade. Count them all.
- If a field is not visible, use null. Never invent values.
- Direction must be LONG or SHORT.
- Return ONLY the raw JSON array.`;

  const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: dataUri } },
          ],
        },
      ],
      max_tokens: 8192,
      temperature: 0.01,
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`DeepSeek API error: ${response.status} ${errText}`);
  }

  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content ?? "";

  // Extract JSON array from response
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error("No JSON array found in DeepSeek response");

  const results = JSON.parse(jsonMatch[0]);
  return Array.isArray(results) ? results : [];
}

/* ──────────────────────────────
   POST: Upload screenshot(s) and extract all trades
   ────────────────────────────── */

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
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

    // Process each image — each one can yield multiple trades
    const results = await Promise.all(
      imageFiles.map(async (imageFile) => {
        const buffer = Buffer.from(await imageFile.arrayBuffer());
        const base64 = buffer.toString("base64");
        const mimeType = imageFile.type;

        try {
          const trades = await extractTradesFromScreenshot(base64, mimeType);
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
            error: "Extraction failed",
            trades: [],
            count: 0,
          };
        }
      })
    );

    // Flatten all trades from all images
    const allTrades = results.flatMap((r) => r.trades ?? []);

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
    console.error("Screenshot import error:", error);
    return NextResponse.json(
      { error: "Failed to process screenshots" },
      { status: 500 }
    );
  }
}

/* ──────────────────────────────
   PUT: Save a single edited trade
   ────────────────────────────── */

export async function PUT(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();

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

    const tradeId = uuidv4();
    const status =
      body.pnl || body.exitPrice ? "CLOSED" : "OPEN";

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
   PATCH: Batch save multiple trades
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

    let saved = 0;
    const errors: { index: number; error: string }[] = [];

    for (let i = 0; i < trades_data.length; i++) {
      const t = trades_data[i];
      try {
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
        const dir: "LONG" | "SHORT" = (t.direction as string)?.toUpperCase() === "SHORT" ? "SHORT" : "LONG";
        const st = (t as { pnl?: number }).pnl || (t as { exitPrice?: number }).exitPrice ? "CLOSED" : "OPEN";

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
