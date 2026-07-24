import Papa from "papaparse";
import { v4 as uuidv4 } from "uuid";

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
  symbol: string;
  direction: "LONG" | "SHORT";
  entryPrice: number | null;
  exitPrice: number | null;
  stopLoss: number | null;
  targetPrice: number | null;
  positionSize: number | null;
  pnl: number | null;
  fees: number | null;
  tradedAt: string | null;
  closedAt: string | null;
  strategy: string | null;
  actualR: number | null;
  notes: string | null;
  idempotencyKey: string;
  rowIndex: number;
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
    "commission": "fees",
    "swap": "fees",
    "comment": "notes",
  },
  ftmo: {
    "instrument": "symbol",
    "symbol": "symbol",
    "type": "direction",
    "open time": "tradedAt",
    "open price": "entryPrice",
    "close time": "closedAt",
    "close price": "exitPrice",
    "volume": "positionSize",
    "profit": "pnl",
    "commission": "fees",
    "comment": "notes",
  },
  mt4: {
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
    "commission": "fees",
    "swap": "fees",
    "comment": "notes",
  },
  mt5: {
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
    "commission": "fees",
    "swap": "fees",
    "comment": "notes",
  },
  ctrader: {
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
    "commission": "fees",
    "comment": "notes",
  },
  oanda: {
    "pair": "symbol",
    "side": "direction",
    "datestart": "tradedAt",
    "dateend": "closedAt",
    "entryprice": "entryPrice",
    "initalsl": "stopLoss",
    "maxtp": "targetPrice",
    "amount": "positionSize",
    "rpnl": "pnl",
    "upnl": "pnl",
    "avgcloseprice": "exitPrice",
    "avgrishreward": "actualR",
    "maxriskreward": "actualR",
  },
};

export const TRADE_FIELDS = [
  { value: "symbol", label: "Symbol", required: true },
  { value: "direction", label: "Direction (LONG/SHORT)", required: true },
  { value: "entryPrice", label: "Entry Price", required: false },
  { value: "exitPrice", label: "Exit Price", required: false },
  { value: "stopLoss", label: "Stop Loss", required: false },
  { value: "targetPrice", label: "Target Price", required: false },
  { value: "positionSize", label: "Position Size", required: false },
  { value: "pnl", label: "P&L", required: false },
  { value: "fees", label: "Fees / Commission", required: false },
  { value: "tradedAt", label: "Trade Date/Time", required: true },
  { value: "closedAt", label: "Close Date/Time", required: false },
  { value: "strategy", label: "Strategy", required: false },
  { value: "notes", label: "Notes", required: false },
  { value: "skip", label: "Skip (don't import)", required: false },
];

/**
 * Parse CSV string into rows.
 */
export function parseCsv(
  csvContent: string,
  fileName: string
): ParsedCsvResult {
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
    if (["symbol", "instrument", "pair", "currency"].includes(normalized)) {
      return { csvColumn: header, tradeField: "symbol" };
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
      ["profit", "pnl", "p&l", "net profit", "gross profit", "rpnl", "upnl"].includes(normalized)
    ) {
      return { csvColumn: header, tradeField: "pnl" };
    }
    if (
      ["commission", "fees", "swap", "charges"].includes(normalized)
    ) {
      return { csvColumn: header, tradeField: "fees" };
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
function normalizeDirection(val: string): "LONG" | "SHORT" {
  const v = val.toLowerCase().trim();
  if (["long", "buy", "l", "b"].includes(v)) return "LONG";
  if (["short", "sell", "s", "sh"].includes(v)) return "SHORT";
  // Try to infer from type column like "buy-limit", "sell-stop"
  if (v.includes("buy") || v.includes("long")) return "LONG";
  if (v.includes("sell") || v.includes("short")) return "SHORT";
  return "LONG"; // fallback
}

/**
 * Parse a numeric value, returning null if not parseable.
 */
function parseNum(val: string | null | undefined): number | null {
  if (!val) return null;
  const cleaned = val.toString().replace(/[,$€£¥\s]/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

/**
 * Apply column mapping to CSV rows and produce mapped trades.
 */
export function applyMapping(
  rows: CsvRow[],
  mappings: ColumnMapping[],
  tradingAccountId: string,
  importBatch: string
): MappedTrade[] {
  return rows.map((row, index) => {
    const getField = (fieldName: string): string | null => {
      // Find all columns that map to this field
      const cols = mappings.filter((m) => m.tradeField === fieldName && m.tradeField !== "skip");
      if (cols.length === 0) return null;
      // Prefer non-empty, non-zero values (handles uPnL=0 vs rPnL=-250)
      for (const m of cols) {
        const val = row[m.csvColumn]?.trim();
        if (val && val !== "" && val !== "0" && val !== "0.00") return val;
      }
      // Fallback: return the first column's value
      const first = cols[0];
      return row[first.csvColumn]?.trim() ?? null;
    };

    // Clean symbol: strip broker prefixes like "OANDA:"
    const rawSymbol = getField("symbol") ?? "UNKNOWN";
    const symbol = rawSymbol.includes(":")
      ? rawSymbol.split(":").pop() ?? rawSymbol
      : rawSymbol;
    const directionStr = getField("direction") ?? "LONG";
    const tradedAtStr = getField("tradedAt");

    // Create idempotency key from available fields
    const idKey = `${symbol}|${directionStr}|${tradedAtStr ?? ""}|${index}`;

    return {
      symbol,
      direction: normalizeDirection(directionStr),
      entryPrice: parseNum(getField("entryPrice")),
      exitPrice: parseNum(getField("exitPrice")),
      stopLoss: parseNum(getField("stopLoss")),
      targetPrice: parseNum(getField("targetPrice")),
      positionSize: parseNum(getField("positionSize")),
      pnl: parseNum(getField("pnl")),
      fees: parseNum(getField("fees")),
      actualR: parseNum(getField("actualR")),
      tradedAt: tradedAtStr,
      closedAt: getField("closedAt"),
      strategy: getField("strategy"),
      notes: getField("notes"),
      idempotencyKey: idKey,
      rowIndex: index,
    };
  });
}
