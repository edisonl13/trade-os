import { readFileSync } from "node:fs";
import { basename } from "node:path";
import Papa from "papaparse";
import { parseNumericValue } from "../src/lib/import-csv";
import { parseTimestampInTimezone } from "../src/lib/timezone";

type Row = Record<string, string>;

function parseFile(path: string) {
  const result = Papa.parse<Row>(readFileSync(path, "utf8"), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim(),
  });
  return {
    rows: result.data,
    fields: result.meta.fields ?? [],
    errors: result.errors.map((error) => ({
      row: error.row,
      type: error.type,
      code: error.code,
    })),
  };
}

function countBy(values: Array<string | null>) {
  const counts: Record<string, number> = {};
  for (const value of values) {
    const key = value?.trim() || "(blank)";
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function exactDuplicateCount(rows: Row[]) {
  const seen = new Set<string>();
  let duplicates = 0;
  for (const row of rows) {
    const fingerprint = JSON.stringify(row);
    if (seen.has(fingerprint)) duplicates++;
    else seen.add(fingerprint);
  }
  return duplicates;
}

function profileFxReplay(path: string, rows: Row[], errors: unknown[]) {
  const ids = rows.map((row) => row.id?.trim()).filter(Boolean);
  const duplicateIds = ids.length - new Set(ids).size;
  const sorted = [...rows].sort((a, b) =>
    String(a.dateEnd).localeCompare(String(b.dateEnd))
  );
  const pnlValues = rows.map((row) => parseNumericValue(row.rPnL));
  const validPnls = pnlValues.filter(
    (value): value is number => value !== null
  );
  const firstInitialBalance = parseNumericValue(sorted[0]?.initialBalance);
  const lastBalance = parseNumericValue(
    sorted[sorted.length - 1]?.currentRealizedBalance
  );
  const pnlSum = validPnls.reduce((sum, value) => sum + value, 0);
  const expectedLastBalance =
    firstInitialBalance === null ? null : firstInitialBalance + pnlSum;
  const balanceDelta =
    lastBalance === null || expectedLastBalance === null
      ? null
      : lastBalance - expectedLastBalance;

  let balanceChainMismatches = 0;
  let runningBalance = firstInitialBalance;
  for (const row of sorted) {
    const pnl = parseNumericValue(row.rPnL);
    const reportedBalance = parseNumericValue(row.currentRealizedBalance);
    if (runningBalance === null || pnl === null || reportedBalance === null) {
      balanceChainMismatches++;
      continue;
    }
    runningBalance += pnl;
    if (Math.abs(runningBalance - reportedBalance) > 0.011) {
      balanceChainMismatches++;
    }
  }

  const parsedStartTimes = rows.map((row) =>
    parseTimestampInTimezone(row.dateStart, "UTC")
  );
  const parsedEndTimes = rows.map((row) =>
    parseTimestampInTimezone(row.dateEnd, "UTC")
  );
  const validStartTimes = parsedStartTimes.filter(
    (value): value is number => value !== null
  );
  const validEndTimes = parsedEndTimes.filter(
    (value): value is number => value !== null
  );

  return {
    file: basename(path),
    sourceFamily: "FX Replay / OANDA analytics",
    grainCandidate: "one closed simulated trade per row",
    rows: rows.length,
    parserErrors: errors.length,
    exactDuplicateRows: exactDuplicateCount(rows),
    duplicateIds,
    statuses: countBy(rows.map((row) => row.status)),
    directions: countBy(rows.map((row) => row.side)),
    symbols: countBy(rows.map((row) => row.pair)),
    missingRequired: {
      id: rows.filter((row) => !row.id?.trim()).length,
      dateStart: rows.filter((row) => !row.dateStart?.trim()).length,
      dateEnd: rows.filter((row) => !row.dateEnd?.trim()).length,
      pair: rows.filter((row) => !row.pair?.trim()).length,
      side: rows.filter((row) => !row.side?.trim()).length,
      realizedPnl: rows.filter(
        (row) => parseNumericValue(row.rPnL) === null
      ).length,
    },
    realizedPnl: {
      sum: round(pnlSum),
      wins: validPnls.filter((value) => value > 0).length,
      losses: validPnls.filter((value) => value < 0).length,
      breakeven: validPnls.filter((value) => value === 0).length,
      unrealizedNonZero: rows.filter(
        (row) => (parseNumericValue(row.uPnL) ?? 0) !== 0
      ).length,
    },
    balanceReconciliation: {
      initialBalance: firstInitialBalance,
      reportedLastBalance: lastBalance,
      expectedLastBalance:
        expectedLastBalance === null ? null : round(expectedLastBalance),
      delta: balanceDelta === null ? null : round(balanceDelta),
      chainMismatches: balanceChainMismatches,
    },
    timeRangeAssumingUtc: {
      first:
        validStartTimes.length > 0
          ? new Date(Math.min(...validStartTimes)).toISOString()
          : null,
      last:
        validEndTimes.length > 0
          ? new Date(Math.max(...validEndTimes)).toISOString()
          : null,
      invalidStartTimes: rows.length - validStartTimes.length,
      invalidEndTimes: rows.length - validEndTimes.length,
      timezoneDeclaredInFile: false,
    },
    feeColumnsPresent: false,
  };
}

function profileBrokerOrders(path: string, rows: Row[], fields: string[], errors: unknown[]) {
  const rowsWithFilledQuantity = rows.filter(
    (row) => (parseNumericValue(row["成交数量"]) ?? 0) > 0
  );
  const filledRows = rowsWithFilledQuantity.filter(
    (row) => row["代码"]?.trim() && row["方向"]?.trim()
  );
  const timezoneMap: Record<string, string> = {
    美东: "America/New_York",
    马来西亚: "Asia/Kuala_Lumpur",
    香港: "Asia/Hong_Kong",
  };
  const parseBrokerTime = (value: string | undefined) => {
    const match = value?.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
    if (!match) return { timestamp: null, suffix: "(missing)" };
    const timezone = timezoneMap[match[2]];
    return {
      timestamp: timezone
        ? parseTimestampInTimezone(match[1], timezone)
        : null,
      suffix: match[2],
    };
  };
  const parsedFilledTimes = filledRows.map((row) =>
    parseBrokerTime(row["成交时间"])
  );
  const filledTimes = parsedFilledTimes
    .map((item) => item.timestamp)
    .filter((value): value is number => value !== null);

  const feesByCurrency: Record<
    string,
    { total: number; commission: number; rowsWithFees: number }
  > = {};
  for (const row of filledRows) {
    const currency = row["币种"]?.trim() || "(blank)";
    const bucket = feesByCurrency[currency] ?? {
      total: 0,
      commission: 0,
      rowsWithFees: 0,
    };
    const totalFee = parseNumericValue(row["合计费用"]);
    const commission = parseNumericValue(row["佣金"]);
    if (totalFee !== null) {
      bucket.total += totalFee;
      bucket.rowsWithFees++;
    }
    bucket.commission += commission ?? 0;
    feesByCurrency[currency] = bucket;
  }
  for (const bucket of Object.values(feesByCurrency)) {
    bucket.total = round(bucket.total);
    bucket.commission = round(bucket.commission);
  }

  type Lot = { quantity: number; price: number; feePerUnit: number };
  const lots = new Map<string, Lot[]>();
  const reconciliationByCurrency: Record<
    string,
    {
      matchedQuantity: number;
      unmatchedSellQuantity: number;
      remainingOpenQuantity: number;
      realizedGrossPnl: number;
      allocatedFees: number;
      realizedNetPnl: number;
    }
  > = {};
  const chronologicalRows = filledRows
    .map((row) => ({ row, ...parseBrokerTime(row["成交时间"]) }))
    .filter(
      (item): item is typeof item & { timestamp: number } =>
        item.timestamp !== null
    )
    .sort((a, b) => a.timestamp - b.timestamp);

  for (const { row } of chronologicalRows) {
    const symbol = row["代码"].trim();
    const currency = row["币种"]?.trim() || "(blank)";
    const key = `${currency}|${symbol}`;
    const quantity = parseNumericValue(row["成交数量"]) ?? 0;
    const price = parseNumericValue(row["成交价格"]) ?? 0;
    const totalFee = parseNumericValue(row["合计费用"]) ?? 0;
    const feePerUnit = quantity > 0 ? totalFee / quantity : 0;
    const bucket = reconciliationByCurrency[currency] ?? {
      matchedQuantity: 0,
      unmatchedSellQuantity: 0,
      remainingOpenQuantity: 0,
      realizedGrossPnl: 0,
      allocatedFees: 0,
      realizedNetPnl: 0,
    };
    const inventory = lots.get(key) ?? [];

    if (row["方向"] === "买入") {
      inventory.push({ quantity, price, feePerUnit });
      lots.set(key, inventory);
      reconciliationByCurrency[currency] = bucket;
      continue;
    }

    let remainingSell = quantity;
    while (remainingSell > 0 && inventory.length > 0) {
      const lot = inventory[0];
      const matched = Math.min(remainingSell, lot.quantity);
      bucket.matchedQuantity += matched;
      bucket.realizedGrossPnl += matched * (price - lot.price);
      bucket.allocatedFees += matched * (feePerUnit + lot.feePerUnit);
      lot.quantity -= matched;
      remainingSell -= matched;
      if (lot.quantity <= 1e-9) inventory.shift();
    }
    bucket.unmatchedSellQuantity += remainingSell;
    lots.set(key, inventory);
    reconciliationByCurrency[currency] = bucket;
  }

  for (const [key, inventory] of lots.entries()) {
    const currency = key.split("|")[0];
    const bucket = reconciliationByCurrency[currency];
    if (!bucket) continue;
    bucket.remainingOpenQuantity += inventory.reduce(
      (sum, lot) => sum + lot.quantity,
      0
    );
  }
  for (const bucket of Object.values(reconciliationByCurrency)) {
    bucket.matchedQuantity = round(bucket.matchedQuantity);
    bucket.unmatchedSellQuantity = round(bucket.unmatchedSellQuantity);
    bucket.remainingOpenQuantity = round(bucket.remainingOpenQuantity);
    bucket.realizedGrossPnl = round(bucket.realizedGrossPnl);
    bucket.allocatedFees = round(bucket.allocatedFees);
    bucket.realizedNetPnl = round(
      bucket.realizedGrossPnl - bucket.allocatedFees
    );
  }

  return {
    file: basename(path),
    sourceFamily: "broker order and fill history",
    grainCandidate: "one order row; filled orders contain one aggregate fill",
    rows: rows.length,
    columns: fields.length,
    parserErrors: errors.length,
    exactDuplicateRows: exactDuplicateCount(rows),
    statuses: countBy(rows.map((row) => row["交易状态"])),
    rowsWithFilledQuantity: rowsWithFilledQuantity.length,
    nonTradeSummaryRowsWithQuantity:
      rowsWithFilledQuantity.length - filledRows.length,
    filledRows: filledRows.length,
    directionsAmongFilled: countBy(
      filledRows.map((row) => row["方向"])
    ),
    symbolsAmongFilled: countBy(
      filledRows.map((row) => row["代码"])
    ),
    currenciesAmongFilled: countBy(
      filledRows.map((row) => row["币种"])
    ),
    missingFilledFields: {
      symbol: filledRows.filter((row) => !row["代码"]?.trim()).length,
      direction: filledRows.filter((row) => !row["方向"]?.trim()).length,
      quantity: filledRows.filter(
        (row) => parseNumericValue(row["成交数量"]) === null
      ).length,
      price: filledRows.filter(
        (row) => parseNumericValue(row["成交价格"]) === null
      ).length,
      time: filledRows.filter((row) => !row["成交时间"]?.trim()).length,
      totalFees: filledRows.filter(
        (row) => parseNumericValue(row["合计费用"]) === null
      ).length,
    },
    feesByCurrency,
    timezones: countBy(parsedFilledTimes.map((item) => item.suffix)),
    timeRangeUtcAfterPerRowTimezone: {
      first:
        filledTimes.length > 0
          ? new Date(Math.min(...filledTimes)).toISOString()
          : null,
      last:
        filledTimes.length > 0
          ? new Date(Math.max(...filledTimes)).toISOString()
          : null,
      invalidFilledTimes: filledRows.length - filledTimes.length,
      timezoneDeclaredInEveryFilledRow:
        parsedFilledTimes.every((item) => item.suffix !== "(missing)"),
    },
    fifoLongLotReconciliationByCurrency: reconciliationByCurrency,
    realizedPnlColumnPresent: false,
    requiresLotMatching: true,
  };
}

const paths = process.argv.slice(2);
if (paths.length === 0) throw new Error("Pass one or more CSV paths.");

const profiles = [];
const fxRowsAcrossFiles: Row[] = [];
for (const path of paths) {
  const parsed = parseFile(path);
  const lowerFields = parsed.fields.map((field) => field.toLowerCase());
  if (
    lowerFields.includes("datestart") &&
    lowerFields.includes("rpnl")
  ) {
    profiles.push(profileFxReplay(path, parsed.rows, parsed.errors));
    fxRowsAcrossFiles.push(...parsed.rows);
  } else {
    profiles.push(
      profileBrokerOrders(path, parsed.rows, parsed.fields, parsed.errors)
    );
  }
}

const crossFileIds = fxRowsAcrossFiles
  .map((row) => row.id?.trim())
  .filter(Boolean);
const crossFileSummary = {
  fxReplayRows: fxRowsAcrossFiles.length,
  fxReplayDuplicateIdsAcrossFiles:
    crossFileIds.length - new Set(crossFileIds).size,
  fxReplayExactDuplicatesAcrossFiles:
    exactDuplicateCount(fxRowsAcrossFiles),
  distinctSourceFamilies: new Set(
    profiles.map((profile) => profile.sourceFamily)
  ).size,
};

console.log(JSON.stringify({ profiles, crossFileSummary }, null, 2));
