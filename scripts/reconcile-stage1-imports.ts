import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import {
  applyMapping,
  autoMapColumns,
  detectBroker,
  detectCsvSourceKind,
  parseNumericValue,
} from "../src/lib/import-csv";
import { parseImportFileContent } from "../src/lib/import-file";

const paths = process.argv.slice(2);
if (paths.length === 0) {
  throw new Error("Pass one or more CSV or MT4 HTML paths.");
}

const allIdempotencyKeys = new Set<string>();
const summaries = [];

for (const path of paths) {
  const content = readFileSync(path, "utf8");
  const parsed = parseImportFileContent(basename(path), content);
  if (parsed.error) throw new Error(`${basename(path)}: ${parsed.error}`);
  const sourceKind = detectCsvSourceKind(parsed.headers);

  if (
    sourceKind === "ORDER_HISTORY_REQUIRES_LOT_MATCHING" ||
    sourceKind === "EXECUTION_HISTORY_REQUIRES_POSITION_MATCHING"
  ) {
    summaries.push({
      file: basename(path),
      fileFormat: parsed.format,
      sourceSummary: parsed.sourceSummary ?? null,
      sourceKind,
      canSave: false,
      reason: sourceKind,
    });
    continue;
  }

  const broker = detectBroker(parsed.headers);
  const mappings = autoMapColumns(parsed.headers, broker);
  const mapped = applyMapping(parsed.rows, mappings, "reconciliation-account");
  const invalidRows = mapped.filter(
    (trade) => trade.validationErrors.length > 0
  );
  const sourcePnl = parsed.rows.reduce(
    (sum, row) =>
      sum +
      (parseNumericValue(
        row.rpnl ?? row.profit ?? row["net profit"] ?? row["closed pnl"]
      ) ?? 0),
    0
  );
  const mappedPnl = mapped.reduce(
    (sum, trade) => sum + (trade.pnl ?? 0),
    0
  );
  const duplicateKeysWithinFile =
    mapped.length - new Set(mapped.map((trade) => trade.idempotencyKey)).size;
  let duplicateKeysAcrossFiles = 0;
  for (const trade of mapped) {
    if (allIdempotencyKeys.has(trade.idempotencyKey)) {
      duplicateKeysAcrossFiles++;
    }
    allIdempotencyKeys.add(trade.idempotencyKey);
  }

  assert.equal(invalidRows.length, 0);
  assert.equal(mapped.length, parsed.rows.length);
  assert.ok(Math.abs(sourcePnl - mappedPnl) < 0.005);
  assert.equal(duplicateKeysWithinFile, 0);

  summaries.push({
    file: basename(path),
    fileFormat: parsed.format,
    sourceSummary: parsed.sourceSummary ?? null,
    sourceKind,
    broker,
    rows: parsed.rows.length,
    mappedRows: mapped.length,
    invalidRows: invalidRows.length,
    sourcePnl: Math.round(sourcePnl * 100) / 100,
    mappedPnl: Math.round(mappedPnl * 100) / 100,
    pnlDelta: Math.round((mappedPnl - sourcePnl) * 100) / 100,
    duplicateKeysWithinFile,
    duplicateKeysAcrossFiles,
    normalizedSymbols: [...new Set(mapped.map((trade) => trade.symbol))].sort(),
  });
}

console.log(JSON.stringify(summaries, null, 2));
