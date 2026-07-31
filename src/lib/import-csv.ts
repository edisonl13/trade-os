import Papa from "papaparse";
import { createHash } from "node:crypto";

export interface CsvRow {
  [key: string]: string;
}

export interface ParsedCsvResult {
  headers: string[];
  rows: CsvRow[];
  totalRows: number;
  error?: string;
}

export interface MappedTrade {
  sourceSymbol: string | null;
  symbol: string;
  sourceTradeId: string | null;
  direction: "LONG" | "SHORT" | null;
  entryPrice: number | null;
  exitPrice: number | null;
  stopLoss: number | null;
  targetPrice: number | null;
  positionSize: number | null;
  initialRiskAmount: number | null;
  pnl: number | null;
  resultCurrency: string | null;
  commission: number | null;
  swap: number | null;
  otherFees: number | null;
  tradedAt: string | null;
  closedAt: string | null;
  strategy: string | null;
  actualR: number | null;
  notes: string | null;
  idempotencyKey: string;
  rowIndex: number;
  validationErrors: string[];
}

export interface ColumnMapping {
  csvColumn: string;
  tradeField: string;
}

/**
 * Predefined field mappings for known brokers.
 * Key = broker name (lowercase), Value = { csvColumn -> tradeField }
 */
export const BROKER_MAPPINGS: Record<string, Record<string, string>> = {
  "ic markets": {
    "ticket": "sourceTradeId",
    "order": "sourceTradeId",
    "deal": "sourceTradeId",
    "instrument": "symbol",
    "symbol": "symbol",
    "type": "direction",
    "direction": "direction",
    "open time": "tradedAt",
    "open price": "entryPrice",
    "close time": "closedAt",
    "close price": "exitPrice",
    "exit price": "exitPrice",
    "stop loss": "stopLoss",
    "take profit": "targetPrice",
    "volume": "positionSize",
    "lots": "positionSize",
    "profit": "pnl",
    "commission": "commission",
    "taxes": "otherFees",
    "swap": "swap",
    "comment": "notes",
  },
  ftmo: {
    "ticket": "sourceTradeId",
    "order": "sourceTradeId",
    "instrument": "symbol",
    "symbol": "symbol",
    "type": "direction",
    "open time": "tradedAt",
    "open price": "entryPrice",
    "close time": "closedAt",
    "close price": "exitPrice",
    "volume": "positionSize",
    "profit": "pnl",
    "commission": "commission",
    "swap": "swap",
    "comment": "notes",
  },
  mt4: {
    "ticket": "sourceTradeId",
    "order": "sourceTradeId",
    "item": "symbol",
    "symbol": "symbol",
    "type": "direction",
    "open time": "tradedAt",
    "open price": "entryPrice",
    "close time": "closedAt",
    "close price": "exitPrice",
    "stop loss": "stopLoss",
    "take profit": "targetPrice",
    "volume": "positionSize",
    "profit": "pnl",
    "commission": "commission",
    "swap": "swap",
    "comment": "notes",
  },
  mt5: {
    "ticket": "sourceTradeId",
    "order": "sourceTradeId",
    "deal": "sourceTradeId",
    "position": "sourceTradeId",
    "symbol": "symbol",
    "type": "direction",
    "open time": "tradedAt",
    "open price": "entryPrice",
    "close time": "closedAt",
    "close price": "exitPrice",
    "stop loss": "stopLoss",
    "take profit": "targetPrice",
    "volume": "positionSize",
    "profit": "pnl",
    "commission": "commission",
    "swap": "swap",
    "comment": "notes",
  },
  ctrader: {
    "position id": "sourceTradeId",
    "deal id": "sourceTradeId",
    "order id": "sourceTradeId",
    "symbol": "symbol",
    "instrument": "symbol",
    "side": "direction",
    "direction": "direction",
    "open time": "tradedAt",
    "open price": "entryPrice",
    "close time": "closedAt",
    "close price": "exitPrice",
    "volume": "positionSize",
    "net p/l": "pnl",
    "commission": "commission",
    "swap": "swap",
    "comment": "notes",
  },
  oanda: {
    "trade id": "sourceTradeId",
    "transaction id": "sourceTradeId",
    "pair": "symbol",
    "side": "direction",
    "datestart": "tradedAt",
    "dateend": "closedAt",
    "entryprice": "entryPrice",
    "initalsl": "stopLoss",
    "maxtp": "targetPrice",
    "amount": "positionSize",
    "rpnl": "pnl",
    "avgcloseprice": "exitPrice",
    "avgrishreward": "actualR",
    "maxriskreward": "actualR",
  },
  "fx-replay": {
    "id": "sourceTradeId",
    "pair": "symbol",
    "side": "direction",
    "datestart": "tradedAt",
    "dateend": "closedAt",
    "entryprice": "entryPrice",
    "initalsl": "stopLoss",
    "maxtp": "targetPrice",
    "amount": "positionSize",
    "rpnl": "pnl",
    "avgcloseprice": "exitPrice",
    "avgrishreward": "actualR",
    "maxriskreward": "actualR",
  },
};

export const TRADE_FIELDS = [
  { value: "sourceTradeId", label: "Source Trade / Order ID", required: false },
  { value: "symbol", label: "Symbol", required: true },
  { value: "direction", label: "Direction (LONG/SHORT)", required: true },
  { value: "entryPrice", label: "Entry Price", required: false },
  { value: "exitPrice", label: "Exit Price", required: false },
  { value: "stopLoss", label: "Stop Loss", required: false },
  { value: "targetPrice", label: "Target Price", required: false },
  { value: "positionSize", label: "Position Size", required: false },
  { value: "initialRiskAmount", label: "Initial Risk Amount", required: false },
  { value: "pnl", label: "Reported Realized P&L", required: false },
  { value: "resultCurrency", label: "P&L / Settlement Currency", required: false },
  { value: "commission", label: "Commission", required: false },
  { value: "swap", label: "Swap / Financing", required: false },
  { value: "otherFees", label: "Other Fees / Adjustments", required: false },
  { value: "tradedAt", label: "Trade Date/Time", required: true },
  { value: "closedAt", label: "Close Date/Time", required: false },
  { value: "strategy", label: "Strategy", required: false },
  { value: "notes", label: "Notes", required: false },
  { value: "skip", label: "Skip (don't import)", required: false },
];

/**
 * Parse CSV string into rows.
 */
export function parseCsv(csvContent: string): ParsedCsvResult {
  const result = Papa.parse<CsvRow>(csvContent, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  });

  if (result.errors && result.errors.length > 0) {
    // Non-fatal parsing errors (e.g., missing quotes, inconsistent rows)
    console.warn("CSV parsing warnings:", result.errors);
  }

  return {
    headers: result.meta.fields ?? [],
    rows: result.data,
    totalRows: result.data.length,
  };
}

/**
 * Detect broker from headers by matching against known mappings.
 */
export function detectBroker(headers: string[]): string | null {
  const headerSet = new Set(headers.map((h) => h.toLowerCase().trim()));

  if (
    [
      "id",
      "datestart",
      "dateend",
      "pair",
      "upnl",
      "rpnl",
      "initialbalance",
      "currentrealizedbalance",
    ].every((header) => headerSet.has(header))
  ) {
    return "fx-replay";
  }

  if (
    ["ticket", "open time", "type", "item", "close time", "taxes"].every(
      (header) => headerSet.has(header)
    )
  ) {
    return "mt4";
  }

  for (const [broker, mapping] of Object.entries(BROKER_MAPPINGS)) {
    const matchedColumns = Object.keys(mapping).filter((col) =>
      headerSet.has(col.toLowerCase())
    ).length;
    // Require at least 3 column matches to consider it a match
    if (matchedColumns >= 3) {
      return broker;
    }
  }

  return null;
}

/**
 * Auto-map CSV columns to trade fields.
 */
export function autoMapColumns(
  headers: string[],
  broker: string | null
): ColumnMapping[] {
  const mapping = broker ? BROKER_MAPPINGS[broker] : null;

  return headers.map((header) => {
    const normalized = header.toLowerCase().trim();

    if (mapping && mapping[normalized]) {
      return { csvColumn: header, tradeField: mapping[normalized] };
    }

    // Try generic matching
    if (
      [
        "pnl currency",
        "p&l currency",
        "profit currency",
        "result currency",
        "settlement currency",
        "account currency",
      ].includes(normalized)
    ) {
      return { csvColumn: header, tradeField: "resultCurrency" };
    }
    if (["symbol", "instrument", "pair", "currency"].includes(normalized)) {
      return { csvColumn: header, tradeField: "symbol" };
    }
    if (
      ["ticket", "trade id", "tradeid", "deal", "deal id", "order", "order id", "position id"].includes(normalized)
    ) {
      return { csvColumn: header, tradeField: "sourceTradeId" };
    }
    if (["type", "direction", "side", "buy/sell"].includes(normalized)) {
      return { csvColumn: header, tradeField: "direction" };
    }
    if (
      ["open price", "entry price", "openprice", "entryprice"].includes(normalized)
    ) {
      return { csvColumn: header, tradeField: "entryPrice" };
    }
    if (
      ["close price", "exit price", "closeprice", "exitprice"].includes(normalized)
    ) {
      return { csvColumn: header, tradeField: "exitPrice" };
    }
    if (["stop loss", "stoploss", "sl"].includes(normalized)) {
      return { csvColumn: header, tradeField: "stopLoss" };
    }
    if (["take profit", "takeprofit", "tp", "target"].includes(normalized)) {
      return { csvColumn: header, tradeField: "targetPrice" };
    }
    if (["volume", "lots", "size", "positionsize", "amount"].includes(normalized)) {
      return { csvColumn: header, tradeField: "positionSize" };
    }
    if (
      ["profit", "pnl", "p&l", "net profit", "gross profit", "rpnl"].includes(normalized)
    ) {
      return { csvColumn: header, tradeField: "pnl" };
    }
    if (["commission", "commissions"].includes(normalized)) {
      return { csvColumn: header, tradeField: "commission" };
    }
    if (["swap", "financing", "financing fee", "rollover"].includes(normalized)) {
      return { csvColumn: header, tradeField: "swap" };
    }
    if (["fees", "fee", "charges", "other fees"].includes(normalized)) {
      return { csvColumn: header, tradeField: "otherFees" };
    }
    if (
      ["initial risk", "initial risk amount", "risk amount", "initialrisk"].includes(normalized)
    ) {
      return { csvColumn: header, tradeField: "initialRiskAmount" };
    }
    if (
      ["open time", "open date", "tradedat", "trade time", "time", "datestart"].includes(normalized)
    ) {
      return { csvColumn: header, tradeField: "tradedAt" };
    }
    if (
      ["close time", "close date", "closedat", "exit time", "dateend"].includes(normalized)
    ) {
      return { csvColumn: header, tradeField: "closedAt" };
    }
    if (
      ["strategy", "system", "model"].includes(normalized)
    ) {
      return { csvColumn: header, tradeField: "strategy" };
    }
    if (["comment", "notes", "note", "description"].includes(normalized)) {
      return { csvColumn: header, tradeField: "notes" };
    }
    if (["stop loss", "stoploss", "sl", "initalsl", "initialsl"].includes(normalized)) {
      return { csvColumn: header, tradeField: "stopLoss" };
    }
    if (["take profit", "takeprofit", "tp", "target", "maxtp", "idealtp"].includes(normalized)) {
      return { csvColumn: header, tradeField: "targetPrice" };
    }
    if (["avgcloseprice", "avg close price", "average close"].includes(normalized)) {
      return { csvColumn: header, tradeField: "exitPrice" };
    }

    return { csvColumn: header, tradeField: "skip" };
  });
}

/**
 * Normalize direction string to LONG/SHORT.
 */
export function normalizeDirectionValue(
  val: string | null
): "LONG" | "SHORT" | null {
  if (!val) return null;
  const v = val.toLowerCase().trim();
  if (["long", "buy", "l", "b"].includes(v)) return "LONG";
  if (["short", "sell", "s", "sh"].includes(v)) return "SHORT";
  // Try to infer from type column like "buy-limit", "sell-stop"
  if (v.includes("buy") || v.includes("long")) return "LONG";
  if (v.includes("sell") || v.includes("short")) return "SHORT";
  return null;
}

export type CsvSourceKind =
  | "TRADE_HISTORY"
  | "ORDER_HISTORY_REQUIRES_LOT_MATCHING"
  | "EXECUTION_HISTORY_REQUIRES_POSITION_MATCHING"
  | "UNKNOWN";

export function detectCsvSourceKind(headers: string[]): CsvSourceKind {
  const normalized = new Set(
    headers.map((header) => header.toLowerCase().trim())
  );
  const chineseOrderFields = [
    "方向",
    "代码",
    "交易状态",
    "成交数量",
    "成交价格",
    "成交时间",
    "合计费用",
  ];
  if (
    chineseOrderFields.every((field) => normalized.has(field))
  ) {
    return "ORDER_HISTORY_REQUIRES_LOT_MATCHING";
  }

  const hasGenericOrderStatus =
    normalized.has("order status") || normalized.has("order state");
  const hasGenericFilledQuantity =
    normalized.has("filled quantity") ||
    normalized.has("filled qty") ||
    normalized.has("executed quantity") ||
    normalized.has("executed qty");
  const hasGenericFillPrice =
    normalized.has("average fill price") ||
    normalized.has("avg fill price") ||
    normalized.has("fill price") ||
    normalized.has("execution price");
  if (
    normalized.has("order id") &&
    hasGenericOrderStatus &&
    hasGenericFilledQuantity &&
    hasGenericFillPrice
  ) {
    return "ORDER_HISTORY_REQUIRES_LOT_MATCHING";
  }

  const executionHistoryFields = [
    "coin",
    "execution price",
    "size tokens",
    "side",
    "start position",
    "closed pnl",
    "order id",
    "trade id",
  ];
  if (
    executionHistoryFields.every((field) => normalized.has(field))
  ) {
    return "EXECUTION_HISTORY_REQUIRES_POSITION_MATCHING";
  }

  const hasIdentity =
    normalized.has("id") ||
    normalized.has("ticket") ||
    normalized.has("trade id") ||
    normalized.has("order");
  const hasResult =
    normalized.has("rpnl") ||
    normalized.has("pnl") ||
    normalized.has("profit") ||
    normalized.has("net profit");
  const hasTradeTime =
    normalized.has("datestart") ||
    normalized.has("open time") ||
    normalized.has("trade time");
  if (hasIdentity && hasResult && hasTradeTime) return "TRADE_HISTORY";

  return "UNKNOWN";
}

/**
 * Detect a platform only when the file type supplies enough evidence.
 *
 * Generic order-history columns overlap heavily across brokers, so they must
 * not inherit a platform name from the loose three-column broker heuristic.
 */
export function detectImportPlatform(
  headers: string[],
  sourceKind: CsvSourceKind = detectCsvSourceKind(headers)
): string | null {
  if (sourceKind === "EXECUTION_HISTORY_REQUIRES_POSITION_MATCHING") {
    return "hyperliquid";
  }
  if (sourceKind === "ORDER_HISTORY_REQUIRES_LOT_MATCHING") {
    return null;
  }
  return detectBroker(headers);
}

/**
 * Parse a numeric value, returning null if not parseable.
 */
export function parseNumericValue(
  val: string | null | undefined
): number | null {
  if (val === null || val === undefined) return null;
  let cleaned = val.toString().trim();
  if (!cleaned) return null;

  const negativeByParentheses = /^\(.*\)$/.test(cleaned);
  cleaned = cleaned.replace(/[()]/g, "").replace(/\s/g, "");
  cleaned = cleaned.replace(/[^\d,.\-+]/g, "");

  const commaIndex = cleaned.lastIndexOf(",");
  const dotIndex = cleaned.lastIndexOf(".");
  if (commaIndex >= 0 && dotIndex >= 0) {
    cleaned =
      commaIndex > dotIndex
        ? cleaned.replace(/\./g, "").replace(",", ".")
        : cleaned.replace(/,/g, "");
  } else if (commaIndex >= 0) {
    const decimalPlaces = cleaned.length - commaIndex - 1;
    cleaned =
      decimalPlaces > 0 && decimalPlaces <= 2
        ? cleaned.replace(",", ".")
        : cleaned.replace(/,/g, "");
  }

  const num = Number(cleaned);
  if (!Number.isFinite(num)) return null;
  return negativeByParentheses && num > 0 ? -num : num;
}

function stableFingerprint(parts: Array<string | number | null>): string {
  return createHash("sha256")
    .update(JSON.stringify(parts))
    .digest("hex");
}

function normalizedText(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export function normalizeCurrencyCode(
  value: string | null | undefined
): string | null {
  const normalized = normalizedText(value)?.toUpperCase();
  if (!normalized || !/^[A-Z0-9]{3,10}$/.test(normalized)) return null;
  return normalized;
}

function normalizedSymbol(value: string | null): {
  source: string | null;
  normalized: string;
} {
  const source = normalizedText(value);
  if (!source) return { source: null, normalized: "UNKNOWN" };
  const withoutPrefix = source.includes(":")
    ? source.split(":").pop() ?? source
    : source;
  return {
    source,
    normalized: withoutPrefix.trim().toUpperCase(),
  };
}

function getMappedValue(
  row: CsvRow,
  mappings: ColumnMapping[],
  fieldName: string
): string | null {
  const mapping = mappings.find((item) => item.tradeField === fieldName);
  if (!mapping) return null;
  return normalizedText(row[mapping.csvColumn]);
}

function getSignedAdjustment(
  row: CsvRow,
  mappings: ColumnMapping[],
  fieldName: string
): number | null {
  const values = mappings
    .filter((item) => item.tradeField === fieldName)
    .map((item) => parseNumericValue(row[item.csvColumn]))
    .filter((value): value is number => value !== null);
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0);
}

/**
 * Apply column mapping to CSV rows and produce mapped trades.
 */
export function applyMapping(
  rows: CsvRow[],
  mappings: ColumnMapping[],
  tradingAccountId: string
): MappedTrade[] {
  return rows.map((row, index) => {
    const getField = (fieldName: string) =>
      getMappedValue(row, mappings, fieldName);
    const { source: sourceSymbol, normalized: symbol } =
      normalizedSymbol(getField("symbol"));
    const sourceTradeId = getField("sourceTradeId");
    const direction = normalizeDirectionValue(getField("direction"));
    const tradedAtStr = getField("tradedAt");
    const closedAtStr = getField("closedAt");
    const entryPrice = parseNumericValue(getField("entryPrice"));
    const exitPrice = parseNumericValue(getField("exitPrice"));
    const positionSize = parseNumericValue(getField("positionSize"));
    const pnl = parseNumericValue(getField("pnl"));
    const rawResultCurrency = getField("resultCurrency");
    const resultCurrency = normalizeCurrencyCode(rawResultCurrency);
    const commission = getSignedAdjustment(row, mappings, "commission");
    const swap = getSignedAdjustment(row, mappings, "swap");
    const otherFees = getSignedAdjustment(row, mappings, "otherFees");
    const validationErrors: string[] = [];

    if (!sourceSymbol || symbol === "UNKNOWN") validationErrors.push("Missing symbol");
    if (!direction) validationErrors.push("Unrecognized direction");
    if (!tradedAtStr) validationErrors.push("Missing trade time");
    if (rawResultCurrency && !resultCurrency) {
      validationErrors.push("Invalid result currency");
    }

    const fingerprint = stableFingerprint([
      tradingAccountId,
      sourceTradeId,
      symbol,
      direction,
      tradedAtStr,
      closedAtStr,
      entryPrice,
      exitPrice,
      positionSize,
      pnl,
      resultCurrency,
    ]);
    const idKey = sourceTradeId
      ? `source:${tradingAccountId}:${sourceTradeId}`
      : `fingerprint:${fingerprint}`;

    return {
      sourceSymbol,
      symbol,
      sourceTradeId,
      direction,
      entryPrice,
      exitPrice,
      stopLoss: parseNumericValue(getField("stopLoss")),
      targetPrice: parseNumericValue(getField("targetPrice")),
      positionSize,
      initialRiskAmount: parseNumericValue(getField("initialRiskAmount")),
      pnl,
      resultCurrency,
      commission,
      swap,
      otherFees,
      actualR: parseNumericValue(getField("actualR")),
      tradedAt: tradedAtStr,
      closedAt: closedAtStr,
      strategy: getField("strategy"),
      notes: getField("notes"),
      idempotencyKey: idKey,
      rowIndex: index,
      validationErrors,
    };
  });
}
