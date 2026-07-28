import {
  parseCsv,
  parseNumericValue,
  type CsvRow,
  type ParsedCsvResult,
} from "@/lib/import-csv";

export type ImportFileFormat = "CSV" | "MT4_HTML";

export interface ParsedImportFileResult extends ParsedCsvResult {
  format: ImportFileFormat;
  sourceSummary?: {
    currency: string | null;
    reportedClosedPnl: number | null;
    rowProfitTotal: number;
    rowVsSummaryDelta: number | null;
  };
}

const MT4_HEADERS = [
  "ticket",
  "open time",
  "type",
  "volume",
  "item",
  "open price",
  "stop loss",
  "take profit",
  "close time",
  "close price",
  "commission",
  "taxes",
  "swap",
  "profit",
] as const;

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function decodeHtmlText(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number(code))
    )
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16))
    )
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function extractCells(rowHtml: string): string[] {
  return [...rowHtml.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(
    (match) => decodeHtmlText(match[1])
  );
}

export function parseMt4HtmlReport(html: string): ParsedImportFileResult {
  const isMetaQuotesReport =
    /<meta\b[^>]*name=["']?generator["']?[^>]*metaquotes/i.test(html) ||
    /MetaQuotes Software Corp\./i.test(html);
  if (!isMetaQuotesReport || !/Closed Transactions:/i.test(html)) {
    return {
      headers: [],
      rows: [],
      totalRows: 0,
      format: "MT4_HTML",
      error: "This HTML file is not a recognized MT4 statement or report.",
    };
  }

  const tableRows = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(
    (match) => extractCells(match[1])
  );
  const headerIndex = tableRows.findIndex((cells) => {
    const normalized = cells.map((cell) => cell.toLowerCase());
    return (
      normalized.length >= 14 &&
      normalized[0] === "ticket" &&
      normalized[1] === "open time" &&
      normalized[2] === "type" &&
      normalized.at(-1) === "profit"
    );
  });

  if (headerIndex < 0) {
    return {
      headers: [],
      rows: [],
      totalRows: 0,
      format: "MT4_HTML",
      error: "The MT4 Closed Transactions table was not found.",
    };
  }

  const rows: CsvRow[] = [];
  for (const cells of tableRows.slice(headerIndex + 1)) {
    if (cells.length < MT4_HEADERS.length) continue;
    const type = cells[2]?.toLowerCase();
    if (type !== "buy" && type !== "sell") continue;

    const row: CsvRow = {};
    MT4_HEADERS.forEach((header, index) => {
      row[header] = cells[index] ?? "";
    });
    rows.push(row);
  }

  if (rows.length === 0) {
    return {
      headers: [...MT4_HEADERS],
      rows: [],
      totalRows: 0,
      format: "MT4_HTML",
      error: "The MT4 report contains no closed buy or sell transactions.",
    };
  }

  const currencyMatch = html.match(/<b>\s*Currency:\s*([^<]+)<\/b>/i);
  const closedPnlMatch = html.match(
    /<b>\s*Closed P\/L:\s*<\/b><\/td>\s*<td\b[^>]*>\s*<b>([^<]+)<\/b>/i
  );
  const reportedClosedPnl = parseNumericValue(closedPnlMatch?.[1]);
  const rowProfitTotal = rows.reduce(
    (sum, row) => sum + (parseNumericValue(row.profit) ?? 0),
    0
  );

  return {
    headers: [...MT4_HEADERS],
    rows,
    totalRows: rows.length,
    format: "MT4_HTML",
    sourceSummary: {
      currency: currencyMatch ? decodeHtmlText(currencyMatch[1]) : null,
      reportedClosedPnl,
      rowProfitTotal: roundMoney(rowProfitTotal),
      rowVsSummaryDelta:
        reportedClosedPnl === null
          ? null
          : roundMoney(rowProfitTotal - reportedClosedPnl),
    },
  };
}

export function parseImportFileContent(
  fileName: string,
  content: string
): ParsedImportFileResult {
  const looksLikeHtml =
    /\.(?:html?|xhtml)$/i.test(fileName) ||
    /^\s*(?:<!doctype\s+html|<html\b)/i.test(content);

  if (looksLikeHtml) return parseMt4HtmlReport(content);

  return {
    ...parseCsv(content),
    format: "CSV",
  };
}
