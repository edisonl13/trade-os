import assert from "node:assert/strict";
import {
  applyMapping,
  autoMapColumns,
  detectBroker,
  detectCsvSourceKind,
  normalizeCurrencyCode,
  parseNumericValue,
  type ColumnMapping,
  type CsvRow,
} from "../src/lib/import-csv";
import {
  parseImportFileContent,
  parseMt4HtmlReport,
} from "../src/lib/import-file";
import { getImportConfirmationError } from "../src/lib/import-confirmation";
import {
  getHourInTz,
  parseTimestampInTimezone,
} from "../src/lib/timezone";
import {
  computeAnalyticsDataQuality,
  computeKPI,
  getConfirmedNetPnl,
  type TradeRecord,
} from "../src/lib/analytics";

assert.equal(parseNumericValue("$1,234.56"), 1234.56);
assert.equal(parseNumericValue("€1.234,56"), 1234.56);
assert.equal(parseNumericValue("(250.40)"), -250.4);
assert.equal(parseNumericValue("0"), 0);

const mappings: ColumnMapping[] = [
  { csvColumn: "ticket", tradeField: "sourceTradeId" },
  { csvColumn: "symbol", tradeField: "symbol" },
  { csvColumn: "side", tradeField: "direction" },
  { csvColumn: "open", tradeField: "tradedAt" },
  { csvColumn: "close", tradeField: "closedAt" },
  { csvColumn: "entry", tradeField: "entryPrice" },
  { csvColumn: "size", tradeField: "positionSize" },
  { csvColumn: "commission", tradeField: "commission" },
  { csvColumn: "routing fee", tradeField: "otherFees" },
  { csvColumn: "exchange fee", tradeField: "otherFees" },
  { csvColumn: "pnl currency", tradeField: "resultCurrency" },
];

const validRow: CsvRow = {
  ticket: "T-100",
  symbol: "OANDA:EUR_USD",
  side: "sell",
  open: "2026-07-28 14:30:00",
  close: "2026-07-28 15:00:00",
  entry: "1.1700",
  size: "10,000",
  commission: "-2.50",
  "routing fee": "-0.25",
  "exchange fee": "-0.10",
  "pnl currency": "usd",
};
const invalidDirectionRow: CsvRow = {
  ...validRow,
  ticket: "T-101",
  side: "mystery",
};

const firstPass = applyMapping(
  [validRow, invalidDirectionRow],
  mappings,
  "account-1"
);
const reorderedPass = applyMapping(
  [invalidDirectionRow, validRow],
  mappings,
  "account-1"
);

assert.equal(firstPass[0].direction, "SHORT");
assert.equal(firstPass[0].otherFees, -0.35);
assert.equal(firstPass[0].resultCurrency, "USD");
assert.equal(firstPass[1].direction, null);
assert.ok(firstPass[1].validationErrors.includes("Unrecognized direction"));
assert.equal(firstPass[0].idempotencyKey, reorderedPass[1].idempotencyKey);
assert.equal(normalizeCurrencyCode(" usdt "), "USDT");
assert.equal(normalizeCurrencyCode("US Dollar"), null);

const oandaMapping = autoMapColumns(
  ["trade id", "pair", "side", "datestart", "rpnl", "upnl"],
  "oanda"
);
assert.equal(
  oandaMapping.find((mapping) => mapping.csvColumn === "rpnl")?.tradeField,
  "pnl"
);
assert.equal(
  oandaMapping.find((mapping) => mapping.csvColumn === "upnl")?.tradeField,
  "skip"
);
assert.equal(
  detectBroker([
    "Ticket",
    "Open Time",
    "Type",
    "Item",
    "Close Time",
    "Taxes",
  ]),
  "mt4"
);
assert.equal(
  detectCsvSourceKind([
    "方向",
    "代码",
    "交易状态",
    "成交数量",
    "成交价格",
    "成交时间",
    "合计费用",
  ]),
  "ORDER_HISTORY_REQUIRES_LOT_MATCHING"
);
assert.equal(
  detectCsvSourceKind(["id", "dateStart", "rPnL"]),
  "TRADE_HISTORY"
);
assert.equal(
  detectCsvSourceKind([
    "Account",
    "Coin",
    "Execution Price",
    "Size Tokens",
    "Side",
    "Start Position",
    "Closed PnL",
    "Order ID",
    "Trade ID",
  ]),
  "EXECUTION_HISTORY_REQUIRES_POSITION_MATCHING"
);

const mt4Html = `<!DOCTYPE HTML>
<html><head>
<meta name="generator" content="MetaQuotes Software Corp.">
</head><body><table>
<tr><td colspan="13"><b>Closed Transactions:</b></td></tr>
<tr><td>Ticket</td><td>Open Time</td><td>Type</td><td>Size</td><td>Item</td><td>Price</td><td>S / L</td><td>T / P</td><td>Close Time</td><td>Price</td><td>Commission</td><td>Taxes</td><td>Swap</td><td>Profit</td></tr>
<tr><td>0</td><td>2011.09.08 00:00:00</td><td>balance</td><td colspan="10">Deposit</td><td>1000000.0</td></tr>
<tr><td>1651623331350</td><td>2011.09.08 00:00:00</td><td>buy</td><td>0.01</td><td>usdcad</td><td>0.98325</td><td>0.96894</td><td>1.06082</td><td>2011.09.09 00:00:00</td><td>0.98933</td><td>0.0</td><td>0.00</td><td>0.0</td><td>6.1</td></tr>
<tr><td colspan="12"><b>Closed P/L:</b></td><td colspan="2"><b>6.1</b></td></tr>
</table></body></html>`;
const parsedMt4Html = parseMt4HtmlReport(mt4Html);
assert.equal(parsedMt4Html.error, undefined);
assert.equal(parsedMt4Html.format, "MT4_HTML");
assert.equal(parsedMt4Html.totalRows, 1);
assert.equal(parsedMt4Html.rows[0].ticket, "1651623331350");
assert.equal(parsedMt4Html.rows[0]["open price"], "0.98325");
assert.equal(parsedMt4Html.rows[0].profit, "6.1");
assert.equal(parsedMt4Html.sourceSummary?.currency, null);
assert.equal(parsedMt4Html.sourceSummary?.reportedClosedPnl, 6.1);
assert.equal(parsedMt4Html.sourceSummary?.rowVsSummaryDelta, 0);
assert.equal(
  parseImportFileContent("statement.htm", mt4Html).format,
  "MT4_HTML"
);
assert.equal(
  parseMt4HtmlReport("<html><body>not a statement</body></html>").error,
  "This HTML file is not a recognized MT4 statement or report."
);
assert.equal(
  getImportConfirmationError({
    pnlMode: "UNKNOWN",
    feesConfirmed: false,
    feeSignConvention: "UNKNOWN",
  })?.code,
  "PNL_MODE_REQUIRED"
);
assert.equal(
  getImportConfirmationError({
    pnlMode: "GROSS",
    feesConfirmed: false,
    feeSignConvention: "SIGNED",
  })?.code,
  "FEE_CONFIRMATION_REQUIRED"
);
assert.equal(
  getImportConfirmationError({
    pnlMode: "GROSS",
    feesConfirmed: true,
    feeSignConvention: "SIGNED",
  }),
  null
);
assert.equal(
  getImportConfirmationError({
    pnlMode: "NET",
    feesConfirmed: false,
    feeSignConvention: "UNKNOWN",
  }),
  null
);

const malaysiaLocal = parseTimestampInTimezone(
  "2026-07-28 14:30:00",
  "Asia/Kuala_Lumpur"
);
assert.notEqual(malaysiaLocal, null);
assert.equal(new Date(malaysiaLocal!).toISOString(), "2026-07-28T06:30:00.000Z");
assert.equal(getHourInTz(malaysiaLocal!, "Asia/Kuala_Lumpur"), 14);

const nonexistentDstTime = parseTimestampInTimezone(
  "2026-03-08 02:30:00",
  "America/New_York"
);
assert.equal(nonexistentDstTime, null);

const baseTrade: TradeRecord = {
  id: "trade-1",
  symbol: "EURUSD",
  direction: "LONG",
  entryPrice: 1.1,
  actualEntry: 1.1,
  actualExit: 1.2,
  pnl: 100,
  netPnl: 95,
  pnlMode: "NET",
  resultCurrency: "USD",
  resultCurrencySource: "SOURCE",
  confirmedByUser: true,
  actualR: 1,
  fees: -5,
  tradedAt: Date.UTC(2026, 6, 28, 6, 30),
  closedAt: Date.UTC(2026, 6, 28, 7, 0),
  weekDay: 2,
  session: "asia",
  status: "CLOSED",
  strategy: null,
};
const incompleteTrade: TradeRecord = {
  ...baseTrade,
  id: "trade-2",
  pnl: -50,
  netPnl: null,
  pnlMode: "UNKNOWN",
};
const incompleteQuality = computeAnalyticsDataQuality([
  baseTrade,
  incompleteTrade,
]);
assert.equal(incompleteQuality.pnlComplete, false);
assert.equal(incompleteQuality.incompleteResultTrades, 1);

const blockedKpi = computeKPI(
  [baseTrade, incompleteTrade].map((trade) => ({
    ...trade,
    pnl: incompleteQuality.pnlComplete ? getConfirmedNetPnl(trade) : null,
  }))
);
assert.equal(blockedKpi.winRate, null);
assert.equal(blockedKpi.totalPnL, 0);

const completeQuality = computeAnalyticsDataQuality([
  baseTrade,
  { ...incompleteTrade, netPnl: -55, pnlMode: "NET" },
]);
assert.equal(completeQuality.pnlComplete, true);
assert.equal(completeQuality.currencyComplete, true);
assert.equal(completeQuality.resultCurrency, "USD");

const mixedCurrencyQuality = computeAnalyticsDataQuality([
  baseTrade,
  {
    ...baseTrade,
    id: "trade-myr",
    netPnl: -55,
    resultCurrency: "MYR",
  },
]);
assert.equal(mixedCurrencyQuality.currencyComplete, false);
assert.deepEqual(mixedCurrencyQuality.resultCurrencies, ["MYR", "USD"]);
assert.equal(mixedCurrencyQuality.pnlComplete, false);

const unknownCurrencyQuality = computeAnalyticsDataQuality([
  { ...baseTrade, resultCurrency: null, resultCurrencySource: "UNKNOWN" },
]);
assert.equal(unknownCurrencyQuality.unknownCurrencyTrades, 1);
assert.equal(unknownCurrencyQuality.currencyComplete, false);
assert.equal(unknownCurrencyQuality.pnlComplete, false);

console.log(
  "Stage 1 checks passed (numeric, mapping, dedupe, timezone, currency, analytics eligibility)."
);
