import type { ImportFileFormat } from "@/lib/import-file";
import type {
  ColumnMapping,
  MappedTrade,
} from "@/lib/import-csv";
import type {
  FeeSignConvention,
  PnlMode,
} from "@/lib/import-confirmation";

export type ImportResultBasis =
  | "FX_REPLAY_REPORTED"
  | "MT4_GROSS_WITH_FEES"
  | "NET_COLUMN"
  | "GROSS_COLUMN"
  | "UNRESOLVED";

export interface ImportInterpretation {
  sourcePlatform: string | null;
  sourceLabel: string;
  marketDataProvider: string | null;
  pnlMode: PnlMode;
  feeSignConvention: FeeSignConvention;
  resultBasis: ImportResultBasis;
  hasFeeFields: boolean;
  hasFeeValues: boolean;
  feeDetailsAvailable: boolean;
  requiresPnlConfirmation: boolean;
  requiresFeeSignConfirmation: boolean;
}

function normalizedHeaders(headers: string[]): Set<string> {
  return new Set(headers.map((header) => header.toLowerCase().trim()));
}

export function isFxReplayExport(headers: string[]): boolean {
  const values = normalizedHeaders(headers);
  return [
    "id",
    "datestart",
    "dateend",
    "pair",
    "upnl",
    "rpnl",
    "initialbalance",
    "currentrealizedbalance",
  ].every((header) => values.has(header));
}

export function inferImportInterpretation(input: {
  headers: string[];
  fileFormat: ImportFileFormat;
  detectedPlatform: string | null;
  mappings: ColumnMapping[];
  trades: MappedTrade[];
}): ImportInterpretation {
  const headers = normalizedHeaders(input.headers);
  const fxReplay =
    input.detectedPlatform === "fx-replay" ||
    isFxReplayExport(input.headers);
  const mt4 =
    input.fileFormat === "MT4_HTML" || input.detectedPlatform === "mt4";
  const feeFields = new Set(["commission", "swap", "otherFees"]);
  const hasFeeFields = input.mappings.some((mapping) =>
    feeFields.has(mapping.tradeField)
  );
  const feeValues = input.trades.flatMap((trade) =>
    [trade.commission, trade.swap, trade.otherFees].filter(
      (value): value is number => value !== null
    )
  );
  const hasFeeValues = feeValues.length > 0;

  let pnlMode: PnlMode = "UNKNOWN";
  let resultBasis: ImportResultBasis = "UNRESOLVED";
  if (fxReplay) {
    pnlMode = "SOURCE_REPORTED";
    resultBasis = "FX_REPLAY_REPORTED";
  } else if (mt4) {
    pnlMode = "GROSS";
    resultBasis = "MT4_GROSS_WITH_FEES";
  } else if (headers.has("net profit") || headers.has("net p/l")) {
    pnlMode = "NET";
    resultBasis = "NET_COLUMN";
  } else if (headers.has("gross profit")) {
    pnlMode = "GROSS";
    resultBasis = "GROSS_COLUMN";
  }

  let feeSignConvention: FeeSignConvention = "UNKNOWN";
  if (mt4 && hasFeeFields) {
    feeSignConvention = "SIGNED";
  } else if (hasFeeValues && feeValues.some((value) => value < 0)) {
    feeSignConvention = "SIGNED";
  }

  const requiresPnlConfirmation = pnlMode === "UNKNOWN";
  const requiresFeeSignConfirmation =
    pnlMode === "GROSS" &&
    hasFeeValues &&
    feeSignConvention === "UNKNOWN";

  return {
    sourcePlatform: fxReplay ? "fx-replay" : input.detectedPlatform,
    sourceLabel: fxReplay
      ? "FX Replay"
      : mt4
        ? "MetaTrader 4"
        : input.detectedPlatform ?? "Unknown source",
    marketDataProvider:
      fxReplay &&
      input.trades.some((trade) =>
        trade.sourceSymbol?.toUpperCase().startsWith("OANDA:")
      )
        ? "OANDA"
        : null,
    pnlMode,
    feeSignConvention,
    resultBasis,
    hasFeeFields,
    hasFeeValues,
    feeDetailsAvailable: hasFeeFields,
    requiresPnlConfirmation,
    requiresFeeSignConfirmation,
  };
}
