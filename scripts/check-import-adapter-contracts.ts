import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  evaluateImportAdapterContract,
  type ImportAdapterContractInput,
} from "../src/lib/import-adapter-contract";

function readFixture(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

const contracts: ImportAdapterContractInput[] = [
  {
    name: "FX Replay completed trades",
    fileName: "fx-replay-trade-history.csv",
    content: readFixture(
      "tests/fixtures/synthetic/fx-replay-trade-history.csv"
    ),
    sourceTimezone: "UTC",
    expectation: {
      fileFormat: "CSV",
      sourceKind: "TRADE_HISTORY",
      sourcePlatform: "fx-replay",
      totalRows: 3,
      canSaveCompletedTrades: true,
      requiresSourceTimezone: true,
      invalidMappedRows: 0,
      reportedPnlRows: 3,
      reportedPnlTotal: 50,
      reportedFeeTotal: 0,
    },
  },
  {
    name: "MT4 HTML completed trades",
    fileName: "mt4-strategy-report-excerpt.htm",
    content: readFixture(
      "tests/fixtures/public/mt4-strategy-report-excerpt.htm"
    ),
    sourceTimezone: "UTC",
    expectation: {
      fileFormat: "MT4_HTML",
      sourceKind: "TRADE_HISTORY",
      sourcePlatform: "mt4",
      totalRows: 10,
      canSaveCompletedTrades: true,
      requiresSourceTimezone: true,
      invalidMappedRows: 0,
      reportedPnlRows: 10,
      reportedPnlTotal: 29.2,
      reportedFeeTotal: 0,
    },
  },
  {
    name: "Generic order history",
    fileName: "generic-order-history.csv",
    content: readFixture(
      "tests/fixtures/synthetic/generic-order-history.csv"
    ),
    expectation: {
      fileFormat: "CSV",
      sourceKind: "ORDER_HISTORY_REQUIRES_LOT_MATCHING",
      sourcePlatform: null,
      totalRows: 2,
      canSaveCompletedTrades: false,
      requiresSourceTimezone: false,
      invalidMappedRows: 2,
      reportedPnlRows: 0,
      reportedPnlTotal: 0,
      reportedFeeTotal: 0,
    },
  },
  {
    name: "Hyperliquid execution history",
    fileName: "hyperliquid-execution-history-excerpt.csv",
    content: readFixture(
      "tests/fixtures/public/hyperliquid-execution-history-excerpt.csv"
    ),
    expectation: {
      fileFormat: "CSV",
      sourceKind: "EXECUTION_HISTORY_REQUIRES_POSITION_MATCHING",
      sourcePlatform: "hyperliquid",
      totalRows: 10,
      canSaveCompletedTrades: false,
      requiresSourceTimezone: false,
      invalidMappedRows: 10,
      reportedPnlRows: 0,
      reportedPnlTotal: 0,
    },
  },
];

const results = contracts.map(evaluateImportAdapterContract);
for (const result of results) {
  assert.equal(
    result.passed,
    true,
    `${result.name} failed:\n${result.failures.join("\n")}`
  );
  console.log(
    [
      result.name,
      result.observed.sourceKind,
      result.observed.sourcePlatform ?? "unknown-platform",
      `${result.observed.totalRows} rows`,
      result.observed.canSaveCompletedTrades ? "save" : "block",
    ].join(" | ")
  );
}

console.log(`Import adapter contracts passed: ${results.length}/${results.length}.`);
