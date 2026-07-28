import {
  applyMapping,
  autoMapColumns,
  detectCsvSourceKind,
  detectImportPlatform,
  type CsvSourceKind,
} from "@/lib/import-csv";
import {
  parseImportFileContent,
  type ImportFileFormat,
} from "@/lib/import-file";
import { parseTimestampInTimezone } from "@/lib/timezone";

export interface ImportAdapterExpectation {
  fileFormat: ImportFileFormat;
  sourceKind: CsvSourceKind;
  sourcePlatform: string | null;
  totalRows: number;
  canSaveCompletedTrades: boolean;
  requiresSourceTimezone: boolean;
  invalidMappedRows?: number;
  reportedPnlRows?: number;
  reportedPnlTotal?: number;
  reportedFeeTotal?: number;
}

export interface ImportAdapterContractInput {
  name: string;
  fileName: string;
  content: string;
  sourceTimezone?: string;
  expectation: ImportAdapterExpectation;
}

export interface ImportAdapterContractResult {
  name: string;
  passed: boolean;
  failures: string[];
  observed: {
    fileFormat: ImportFileFormat;
    sourceKind: CsvSourceKind;
    sourcePlatform: string | null;
    totalRows: number;
    invalidMappedRows: number;
    reportedPnlRows: number;
    reportedPnlTotal: number;
    reportedFeeTotal: number;
    requiresSourceTimezone: boolean;
    timestampsValid: boolean;
    idempotencyKeysStable: boolean;
    idempotencyKeysUnique: boolean;
    canSaveCompletedTrades: boolean;
  };
}

function timestampHasExplicitZone(value: string | null): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  return (
    /^\d{10,13}$/.test(trimmed) ||
    /(?:Z|[+-]\d{2}:?\d{2})$/i.test(trimmed)
  );
}

function approximatelyEqual(left: number, right: number): boolean {
  return Math.abs(left - right) <= 1e-8;
}

function compare<T>(
  failures: string[],
  label: string,
  actual: T,
  expected: T
): void {
  if (actual !== expected) {
    failures.push(`${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

/**
 * Run the same deterministic acceptance checks for every import adapter.
 *
 * This does not prove that a platform is fully supported. It proves only that
 * the supplied fixture is classified, mapped and reconciled as declared.
 */
export function evaluateImportAdapterContract(
  input: ImportAdapterContractInput
): ImportAdapterContractResult {
  const parsed = parseImportFileContent(input.fileName, input.content);
  const sourceKind = detectCsvSourceKind(parsed.headers);
  const sourcePlatform = detectImportPlatform(parsed.headers, sourceKind);
  const mappings = autoMapColumns(parsed.headers, sourcePlatform);
  const mapped = applyMapping(
    parsed.rows,
    mappings,
    `adapter-contract:${input.name}`
  );
  const reordered = applyMapping(
    [...parsed.rows].reverse(),
    mappings,
    `adapter-contract:${input.name}`
  );

  const invalidMappedRows = mapped.filter(
    (trade) => trade.validationErrors.length > 0 || !trade.direction
  ).length;
  const reportedPnl = mapped
    .map((trade) => trade.pnl)
    .filter((value): value is number => value !== null);
  const reportedPnlTotal = reportedPnl.reduce(
    (sum, value) => sum + value,
    0
  );
  const reportedFeeTotal = mapped.reduce(
    (sum, trade) =>
      sum +
      (trade.commission ?? 0) +
      (trade.swap ?? 0) +
      (trade.otherFees ?? 0),
    0
  );
  const timestamps = mapped.flatMap((trade) =>
    [trade.tradedAt, trade.closedAt].filter(
      (value): value is string => value !== null
    )
  );
  const requiresSourceTimezone = timestamps.some(
    (value) => !timestampHasExplicitZone(value)
  );
  const timezoneForValidation = input.sourceTimezone ?? "UTC";
  const timestampsValid = timestamps.every(
    (value) => parseTimestampInTimezone(value, timezoneForValidation) !== null
  );
  const firstKeys = mapped.map((trade) => trade.idempotencyKey).sort();
  const reorderedKeys = reordered
    .map((trade) => trade.idempotencyKey)
    .sort();
  const idempotencyKeysStable =
    firstKeys.length === reorderedKeys.length &&
    firstKeys.every((key, index) => key === reorderedKeys[index]);
  const idempotencyKeysUnique =
    new Set(firstKeys).size === firstKeys.length;
  const canSaveCompletedTrades =
    sourceKind === "TRADE_HISTORY" &&
    invalidMappedRows === 0 &&
    timestampsValid &&
    (!requiresSourceTimezone || Boolean(input.sourceTimezone));

  const observed: ImportAdapterContractResult["observed"] = {
    fileFormat: parsed.format,
    sourceKind,
    sourcePlatform,
    totalRows: parsed.totalRows,
    invalidMappedRows,
    reportedPnlRows: reportedPnl.length,
    reportedPnlTotal,
    reportedFeeTotal,
    requiresSourceTimezone,
    timestampsValid,
    idempotencyKeysStable,
    idempotencyKeysUnique,
    canSaveCompletedTrades,
  };
  const expected = input.expectation;
  const failures: string[] = [];

  compare(failures, "fileFormat", observed.fileFormat, expected.fileFormat);
  compare(failures, "sourceKind", observed.sourceKind, expected.sourceKind);
  compare(
    failures,
    "sourcePlatform",
    observed.sourcePlatform,
    expected.sourcePlatform
  );
  compare(failures, "totalRows", observed.totalRows, expected.totalRows);
  compare(
    failures,
    "canSaveCompletedTrades",
    observed.canSaveCompletedTrades,
    expected.canSaveCompletedTrades
  );
  compare(
    failures,
    "requiresSourceTimezone",
    observed.requiresSourceTimezone,
    expected.requiresSourceTimezone
  );
  compare(
    failures,
    "invalidMappedRows",
    observed.invalidMappedRows,
    expected.invalidMappedRows ?? 0
  );
  if (expected.reportedPnlRows !== undefined) {
    compare(
      failures,
      "reportedPnlRows",
      observed.reportedPnlRows,
      expected.reportedPnlRows
    );
  }
  if (
    expected.reportedPnlTotal !== undefined &&
    !approximatelyEqual(
      observed.reportedPnlTotal,
      expected.reportedPnlTotal
    )
  ) {
    failures.push(
      `reportedPnlTotal: expected ${expected.reportedPnlTotal}, ` +
        `got ${observed.reportedPnlTotal}`
    );
  }
  if (
    expected.reportedFeeTotal !== undefined &&
    !approximatelyEqual(
      observed.reportedFeeTotal,
      expected.reportedFeeTotal
    )
  ) {
    failures.push(
      `reportedFeeTotal: expected ${expected.reportedFeeTotal}, ` +
        `got ${observed.reportedFeeTotal}`
    );
  }
  if (!observed.timestampsValid) {
    failures.push("timestampsValid: one or more timestamps cannot be parsed");
  }
  if (!observed.idempotencyKeysStable) {
    failures.push(
      "idempotencyKeysStable: keys changed after row reordering"
    );
  }
  if (
    observed.canSaveCompletedTrades &&
    !observed.idempotencyKeysUnique
  ) {
    failures.push(
      "idempotencyKeysUnique: a completed-trade fixture contains duplicate keys"
    );
  }

  return {
    name: input.name,
    passed: failures.length === 0,
    failures,
    observed,
  };
}
