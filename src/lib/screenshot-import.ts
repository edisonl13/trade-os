import {
  isValidTimezone,
  parseTimestampInTimezone,
} from "@/lib/timezone";

export interface ExtractedField {
  field: string;
  value: string | number | null;
  confidence: number;
  source: "ai" | "user";
}

export interface ScreenshotTradeExtraction {
  symbol: string | null;
  direction: "LONG" | "SHORT" | null;
  entryPrice: number | null;
  exitPrice: number | null;
  stopLoss: number | null;
  targetPrice: number | null;
  positionSize: number | null;
  pnl: number | null;
  tradedAt: string | null;
  confidence: number;
  evidence: string;
  fields: ExtractedField[];
}

export interface PreparedScreenshotTrade {
  symbol: string;
  direction: "LONG" | "SHORT";
  entryPrice: number | null;
  exitPrice: number | null;
  stopLoss: number | null;
  targetPrice: number | null;
  positionSize: number | null;
  pnl: number | null;
  tradedAtMs: number;
  sourceTimezone: string;
}

export interface ScreenshotPreflightError {
  index: number;
  error:
    | "Missing symbol"
    | "Missing direction"
    | "Missing trade time"
    | "Source timezone required"
    | "Invalid trade time";
}

const VALID_FIELDS = [
  "symbol",
  "direction",
  "entryPrice",
  "exitPrice",
  "stopLoss",
  "targetPrice",
  "positionSize",
  "pnl",
  "tradedAt",
] as const;

export function screenshotTimestampHasExplicitZone(value: string): boolean {
  return /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value.trim());
}

function finiteNumberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function validateScreenshotExtraction(
  data: unknown
): ScreenshotTradeExtraction[] {
  if (!Array.isArray(data)) return [];

  return data
    .map((item: unknown): ScreenshotTradeExtraction | null => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const symbol =
        typeof record.symbol === "string"
          ? record.symbol.toUpperCase().trim().slice(0, 20)
          : null;
      const direction =
        record.direction === "SHORT"
          ? "SHORT"
          : record.direction === "LONG"
            ? "LONG"
            : null;
      const entryPrice = finiteNumberOrNull(record.entryPrice);
      const exitPrice = finiteNumberOrNull(record.exitPrice);
      const stopLoss = finiteNumberOrNull(record.stopLoss);
      const targetPrice = finiteNumberOrNull(record.targetPrice);
      const positionSize = finiteNumberOrNull(record.positionSize);
      const pnl = finiteNumberOrNull(record.pnl);

      let tradedAt: string | null = null;
      if (typeof record.tradedAt === "string") {
        const rawTimestamp = record.tradedAt.trim().slice(0, 64);
        if (rawTimestamp) {
          if (screenshotTimestampHasExplicitZone(rawTimestamp)) {
            const parsedTimestamp = new Date(rawTimestamp);
            tradedAt = Number.isNaN(parsedTimestamp.getTime())
              ? null
              : parsedTimestamp.toISOString();
          } else {
            tradedAt = rawTimestamp;
          }
        }
      }

      const confidence =
        typeof record.confidence === "number" &&
        Number.isFinite(record.confidence)
          ? Math.min(1, Math.max(0, record.confidence))
          : 0.5;
      const evidence =
        typeof record.evidence === "string"
          ? record.evidence.trim().slice(0, 240)
          : "";
      const sanitizedValues: Record<
        (typeof VALID_FIELDS)[number],
        string | number | null
      > = {
        symbol,
        direction,
        entryPrice,
        exitPrice,
        stopLoss,
        targetPrice,
        positionSize,
        pnl,
        tradedAt,
      };
      const fields: ExtractedField[] = [];
      for (const field of VALID_FIELDS) {
        if (sanitizedValues[field] !== null) {
          fields.push({
            field,
            value: sanitizedValues[field],
            confidence,
            source: "ai",
          });
        }
      }

      if (!symbol) return null;
      return {
        symbol,
        direction,
        entryPrice,
        exitPrice,
        stopLoss,
        targetPrice,
        positionSize,
        pnl,
        tradedAt,
        confidence,
        evidence,
        fields,
      };
    })
    .filter((trade): trade is ScreenshotTradeExtraction => trade !== null);
}

export function preflightScreenshotTrades(
  trades: Record<string, unknown>[],
  requestedSourceTimezone: string
): {
  trades: PreparedScreenshotTrade[];
  errors: ScreenshotPreflightError[];
} {
  const errors: ScreenshotPreflightError[] = [];
  const prepared = trades.map((trade, index) => {
    const symbol =
      typeof trade.symbol === "string"
        ? trade.symbol.toUpperCase().trim().slice(0, 20)
        : "";
    const directionValue =
      typeof trade.direction === "string"
        ? trade.direction.toUpperCase()
        : "";
    let direction: PreparedScreenshotTrade["direction"] | null = null;
    if (directionValue === "LONG") direction = "LONG";
    if (directionValue === "SHORT") direction = "SHORT";
    const rawTradedAt =
      typeof trade.tradedAt === "string" ? trade.tradedAt.trim() : "";

    if (!symbol) errors.push({ index, error: "Missing symbol" });
    if (!direction) errors.push({ index, error: "Missing direction" });
    if (!rawTradedAt) errors.push({ index, error: "Missing trade time" });

    const sourceTimezone = screenshotTimestampHasExplicitZone(rawTradedAt)
      ? "UTC"
      : requestedSourceTimezone;
    if (
      rawTradedAt &&
      !screenshotTimestampHasExplicitZone(rawTradedAt) &&
      !isValidTimezone(sourceTimezone)
    ) {
      errors.push({ index, error: "Source timezone required" });
    }
    const tradedAtMs =
      rawTradedAt && isValidTimezone(sourceTimezone)
        ? parseTimestampInTimezone(rawTradedAt, sourceTimezone)
        : null;
    if (rawTradedAt && tradedAtMs === null) {
      errors.push({ index, error: "Invalid trade time" });
    }

    return {
      symbol,
      direction,
      tradedAtMs,
      sourceTimezone,
      entryPrice: finiteNumberOrNull(trade.entryPrice),
      exitPrice: finiteNumberOrNull(trade.exitPrice),
      stopLoss: finiteNumberOrNull(trade.stopLoss),
      targetPrice: finiteNumberOrNull(trade.targetPrice),
      positionSize: finiteNumberOrNull(trade.positionSize),
      pnl: finiteNumberOrNull(trade.pnl),
    };
  });

  if (errors.length > 0) return { trades: [], errors };

  return {
    trades: prepared.map((trade) => ({
      symbol: trade.symbol,
      direction: trade.direction!,
      tradedAtMs: trade.tradedAtMs!,
      sourceTimezone: trade.sourceTimezone,
      entryPrice: trade.entryPrice,
      exitPrice: trade.exitPrice,
      stopLoss: trade.stopLoss,
      targetPrice: trade.targetPrice,
      positionSize: trade.positionSize,
      pnl: trade.pnl,
    })),
    errors,
  };
}
