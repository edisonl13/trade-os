"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  Upload,
  FileSpreadsheet,
  Camera,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowLeft,
  Database,
  Save,
  CheckSquare,
  Square,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/provider";
import { COMMON_TIMEZONES } from "@/lib/timezone";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ImportStep = "upload" | "mapping" | "results";
type ScreenshotStep = "upload" | "review" | "saving" | "done";

interface ExtractedField {
  field: string;
  value: string | number | null;
  confidence: number;
  source: "ai" | "user";
}

interface ExtractionResult {
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

type ScreenshotFieldKey =
  | "symbol"
  | "direction"
  | "entryPrice"
  | "exitPrice"
  | "stopLoss"
  | "targetPrice"
  | "positionSize"
  | "pnl"
  | "tradedAt";

interface EditableScreenshotTrade
  extends Record<ScreenshotFieldKey, string> {
  confidence: number;
  evidence: string;
}

const SCREENSHOT_FIELD_KEYS: ScreenshotFieldKey[] = [
  "symbol",
  "direction",
  "entryPrice",
  "exitPrice",
  "stopLoss",
  "targetPrice",
  "positionSize",
  "pnl",
  "tradedAt",
];

const SCREENSHOT_NUMERIC_FIELDS: ScreenshotFieldKey[] = [
  "entryPrice",
  "exitPrice",
  "stopLoss",
  "targetPrice",
  "positionSize",
  "pnl",
];

function screenshotTimestampHasZone(value: string): boolean {
  return /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value.trim());
}

/* ============================================================
   CSV Import Tab
   ============================================================ */
type PnlMode = "GROSS" | "NET" | "SOURCE_REPORTED" | "";
type FeeSignConvention = "SIGNED" | "COSTS_POSITIVE" | "";

interface ImportPreview {
  totalRows: number;
  detectedBroker: string | null;
  fileFormat: "CSV" | "MT4_HTML";
  sourceKind: string;
  sourceSummary: {
    currency: string | null;
    reportedClosedPnl: number | null;
    rowProfitTotal: number;
    rowVsSummaryDelta: number | null;
  } | null;
  importability: {
    canSave: boolean;
    code?: string;
    message?: string;
  };
  mappings: { csvColumn: string; tradeField: string }[];
  invalidRows: { row: number; errors: string[] }[];
  invalidRowCount: number;
  interpretation: {
    sourcePlatform: string | null;
    sourceLabel: string;
    marketDataProvider: string | null;
    pnlMode: "GROSS" | "NET" | "SOURCE_REPORTED" | "UNKNOWN";
    feeSignConvention: "SIGNED" | "COSTS_POSITIVE" | "UNKNOWN";
    resultBasis:
      | "FX_REPLAY_REPORTED"
      | "MT4_GROSS_WITH_FEES"
      | "NET_COLUMN"
      | "GROSS_COLUMN"
      | "UNRESOLVED";
    hasFeeFields: boolean;
    hasFeeValues: boolean;
    feeDetailsAvailable: boolean;
    requiresPnlConfirmation: boolean;
    requiresFeeSignConfirmation: boolean;
  };
  requiredConfirmations: {
    sourceTimezone: boolean;
    pnlMode: boolean;
    feeSignConvention: boolean;
  };
}

function CsvImportTab({ router: navRouter }: { router: ReturnType<typeof useRouter> }) {
  const { t } = useI18n();
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<ImportStep>("upload");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [sourceTimezone, setSourceTimezone] = useState("");
  const [pnlMode, setPnlMode] = useState<PnlMode>("");
  const [feeSignConvention, setFeeSignConvention] =
    useState<FeeSignConvention>("");
  const [result, setResult] = useState<{
    inserted: number;
    skipped: number;
    errors?: { row: number; error: string }[];
    importBatch?: string;
  } | null>(null);

  const handleFileDrop = async (f: File) => {
    const validTypes = [
      "text/csv",
      "text/html",
    ];
    if (!validTypes.includes(f.type) && !f.name.match(/\.(csv|html?|htm)$/i)) {
      toast.error(t("import.invalidFormat"));
      return;
    }
    setFile(f);
    setStep("upload");
    setPreview(null);
    setSourceTimezone("");
    setPnlMode("");
    setFeeSignConvention("");
    setLoading(true);
    const nextPreview = await requestPreview(f);
    if (nextPreview) {
      setPnlMode(
        nextPreview.interpretation.pnlMode === "UNKNOWN"
          ? ""
          : nextPreview.interpretation.pnlMode
      );
      setFeeSignConvention(
        nextPreview.interpretation.feeSignConvention === "UNKNOWN"
          ? ""
          : nextPreview.interpretation.feeSignConvention
      );
      setStep("mapping");
    }
    setLoading(false);
  };

  const resetImport = () => {
    setFile(null);
    setPreview(null);
    setStep("upload");
    setSourceTimezone("");
    setPnlMode("");
    setFeeSignConvention("");
  };

  const getApiErrorMessage = (data: { code?: string; error?: string }) => {
    switch (data.code) {
      case "ORDER_HISTORY_REQUIRES_LOT_MATCHING":
        return t("import.orderHistoryBlocked");
      case "EXECUTION_HISTORY_REQUIRES_POSITION_MATCHING":
        return t("import.executionHistoryBlocked");
      case "UNSUPPORTED_TRADE_HISTORY":
        return t("import.unsupportedHistory");
      case "SOURCE_TIMEZONE_REQUIRED":
        return t("import.timezoneRequired");
      case "PNL_MODE_REQUIRED":
        return t("import.pnlModeRequired");
      case "FEE_CONFIRMATION_REQUIRED":
        return t("import.feeConfirmationRequired");
      case "IMPORT_PREFLIGHT_FAILED":
        return t("import.preflightFailed");
      case "PERSISTENT_DATABASE_REQUIRED":
        return t("import.persistentDatabaseRequired");
      default:
        return data.error ?? t("import.transferFailed");
    }
  };

  const localizeRowError = (error: string) => {
    switch (error) {
      case "Missing symbol":
        return t("import.errorMissingSymbol");
      case "Unrecognized direction":
        return t("import.errorDirection");
      case "Missing trade time":
      case "Missing or invalid trade time":
        return t("import.errorTradeTime");
      case "Invalid close time":
        return t("import.errorCloseTime");
      case "Close time is before open time":
        return t("import.errorTimeOrder");
      default:
        return error;
    }
  };

  const buildFormData = (
    previewOnly: boolean,
    targetFile: File | null = file
  ) => {
    const formData = new FormData();
    if (targetFile) formData.append("file", targetFile);
    if (previewOnly) formData.append("preview", "true");
    if (preview?.mappings && targetFile === file) {
      formData.append("mappings", JSON.stringify(preview.mappings));
    }
    if (sourceTimezone) formData.append("sourceTimezone", sourceTimezone);
    if (pnlMode) formData.append("pnlMode", pnlMode);
    if (feeSignConvention) {
      formData.append("feeSignConvention", feeSignConvention);
    }
    return formData;
  };

  const requestPreview = async (
    targetFile: File | null = file
  ): Promise<ImportPreview | null> => {
    if (!targetFile) return null;
    try {
      const res = await fetch("/api/import/csv", {
        method: "POST",
        body: buildFormData(true, targetFile),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(getApiErrorMessage(data));
        return null;
      }
      const nextPreview = data as ImportPreview;
      setPreview(nextPreview);
      return nextPreview;
    } catch {
      toast.error(t("error.network"));
      return null;
    }
  };

  const handlePreview = async () => {
    if (!file) return;
    setLoading(true);
    const nextPreview = await requestPreview();
    if (nextPreview) {
      setPnlMode(
        nextPreview.interpretation.pnlMode === "UNKNOWN"
          ? ""
          : nextPreview.interpretation.pnlMode
      );
      setFeeSignConvention(
        nextPreview.interpretation.feeSignConvention === "UNKNOWN"
          ? ""
          : nextPreview.interpretation.feeSignConvention
      );
      setStep("mapping");
    }
    setLoading(false);
  };

  const handleImport = async () => {
    if (!file || !preview) return;
    setLoading(true);
    try {
      const validatedPreview = await requestPreview();
      if (
        !validatedPreview ||
        !validatedPreview.importability.canSave ||
        validatedPreview.invalidRowCount > 0
      ) {
        toast.error(t("import.resolveErrors"));
        return;
      }

      const res = await fetch("/api/import/csv", {
        method: "POST",
        body: buildFormData(false),
      });
      const data = await res.json();
      if (!res.ok) {
        if (Array.isArray(data.errors)) {
          setPreview((current) =>
            current
              ? {
                  ...current,
                  invalidRows: data.errors.map(
                    (item: { row: number; error: string }) => ({
                      row: item.row,
                      errors: [item.error],
                    })
                  ),
                  invalidRowCount: data.invalidRowCount ?? data.errors.length,
                }
              : current
          );
        }
        toast.error(getApiErrorMessage(data));
        return;
      }
      setResult(data);
      setStep("results");
      toast.success(t("import.importedCount", String(data.inserted)));
    } catch {
      toast.error(t("error.network"));
    } finally {
      setLoading(false);
    }
  };

  const requiresTimezone = preview?.requiredConfirmations.sourceTimezone ?? false;
  const requiresPnlChoice =
    preview?.interpretation.requiresPnlConfirmation ?? true;
  const showFeeChoice =
    pnlMode === "GROSS" &&
    Boolean(preview?.interpretation.hasFeeValues);
  const requiresFeeChoice =
    showFeeChoice && feeSignConvention === "";
  const canSave =
    Boolean(preview?.importability.canSave) &&
    preview?.invalidRowCount === 0 &&
    (!requiresTimezone || sourceTimezone !== "") &&
    (!requiresPnlChoice || pnlMode !== "") &&
    !requiresFeeChoice;

  const selectTriggerClass =
    "h-12 w-full rounded-xl border border-[#9AA8B8]/15 bg-[#101720] px-4 text-sm font-bold text-white hover:border-[#16D9FF]/35 focus-visible:border-[#16D9FF]/60 focus-visible:ring-[#16D9FF]/15";
  const selectContentClass =
    "max-h-72 rounded-xl border border-[#16D9FF]/20 bg-[#0B1018] p-1 text-white shadow-[0_18px_50px_rgba(0,0,0,0.55),0_0_20px_rgba(22,217,255,0.08)]";
  const selectItemClass =
    "min-h-10 rounded-lg px-3 text-[12px] font-bold text-[#B6C1CE] focus:bg-[#16D9FF]/10 focus:text-white data-[selected]:text-[#20D785]";
  const importabilityMessage =
    preview?.importability.code === "ORDER_HISTORY_REQUIRES_LOT_MATCHING"
      ? t("import.orderHistoryBlocked")
      : preview?.importability.code ===
          "EXECUTION_HISTORY_REQUIRES_POSITION_MATCHING"
        ? t("import.executionHistoryBlocked")
        : preview?.importability.code === "UNSUPPORTED_TRADE_HISTORY"
          ? t("import.unsupportedHistory")
          : preview?.importability.message;

  if (step === "results" && result) {
    return (
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
        <div className="fifa-card p-10 flex flex-col items-center text-center gap-6">
          <div className="h-20 w-20 rounded-3xl bg-[#10B981]/10 flex items-center justify-center border border-[#10B981]/20 glow-primary">
            <CheckCircle2 className="h-10 w-10 text-[#10B981]" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-black heading-sports">{t("import.success")}</h2>
            <p className="text-muted-foreground text-sm uppercase font-bold tracking-widest">{file?.name}</p>
          </div>
          <div className="grid grid-cols-2 gap-4 w-full max-w-sm">
            <div className="bg-white/5 rounded-2xl p-4 border border-white/5">
              <p className="text-2xl font-black heading-sports text-[#22C55E]">{result.inserted}</p>
              <p className="text-[9px] font-black text-muted-foreground/40 uppercase">{t("import.imported")}</p>
            </div>
            <div className="bg-white/5 rounded-2xl p-4 border border-white/5">
              <p className="text-2xl font-black heading-sports text-white/40">{result.skipped}</p>
              <p className="text-[9px] font-black text-muted-foreground/40 uppercase">{t("import.duplicates")}</p>
            </div>
          </div>
          <div className="flex gap-3 w-full max-w-sm">
            <Button variant="outline" className="flex-1 border-white/5 font-black uppercase rounded-xl h-12" onClick={resetImport}>{t("import.reset")}</Button>
            <Button className="flex-1 brand-gradient text-white font-black uppercase rounded-xl h-12 glow-primary" onClick={() => navRouter.push("/trades")}>{t("import.liveView")}</Button>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="space-y-6">
      {!file ? (
        <div
          className={cn(
            "fifa-card p-20 flex flex-col items-center justify-center border-2 border-dashed transition-all cursor-pointer group",
            dragOver ? "border-[#3B82F6] bg-[#3B82F6]/5" : "border-white/5 hover:border-white/10"
          )}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFileDrop(f); }}
          onClick={() => document.getElementById('csv-upload')?.click()}
        >
          <div className="mb-6 h-20 w-20 rounded-3xl bg-white/5 flex items-center justify-center border border-white/10 group-hover:scale-110 transition-transform">
            <FileSpreadsheet className={cn("h-10 w-10", dragOver ? "text-[#3B82F6]" : "text-muted-foreground/40")} />
          </div>
          <div className="text-center space-y-2">
            <h3 className="text-xl font-black heading-sports">{t("import.dropCsv")}</h3>
            <p className="text-[10px] font-bold text-muted-foreground/40 uppercase tracking-widest">{t("import.csvFormats")}</p>
          </div>
          <input type="file" accept=".csv,.htm,.html" className="hidden" id="csv-upload" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileDrop(f); }} />
        </div>
      ) : step === "upload" ? (
        <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="fifa-card p-8">
           <div className="flex items-center gap-6 mb-8">
              <div className="h-16 w-16 rounded-2xl bg-[#3B82F6]/10 flex items-center justify-center border border-[#3B82F6]/20">
                 <Database className="h-8 w-8 text-[#3B82F6]" />
              </div>
              <div>
                 <h3 className="heading-sports text-lg">{t("import.processData")}</h3>
                 <p className="text-[10px] font-bold text-muted-foreground/40 uppercase tracking-widest">{file.name} &middot; {(file.size / 1024).toFixed(1)} KB</p>
              </div>
               <Badge className="ml-auto bg-[#22C55E]/10 text-[#22C55E] border-[#22C55E]/20 uppercase font-black text-[9px] px-3 py-1">{t("import.ready")}</Badge>
           </div>
           
           <div className="flex gap-4">
               <Button variant="ghost" className="h-14 flex-1 font-black uppercase text-muted-foreground" onClick={resetImport}>{t("import.cancel")}</Button>
              <Button className="h-14 flex-[2] brand-gradient text-white font-black uppercase glow-primary" onClick={handlePreview} disabled={loading}>
                  {loading ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> {t("import.synchronizing")}</> : <><Upload className="mr-2 h-5 w-5" /> {t("import.previewBtn")}</>}
              </Button>
           </div>
        </motion.div>
      ) : preview ? (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-5"
        >
          <div className="fifa-card p-7 space-y-6">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#16D9FF]">
                {t("import.smartCheckEyebrow")}
              </p>
              <h2 className="mt-2 text-2xl font-black heading-sports">
                {t("import.smartCheckTitle")}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {t("import.smartCheckDescription")}
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              {[
                [t("import.detectedFormat"), preview.fileFormat],
                [t("import.detectedSource"), preview.interpretation.sourceLabel],
                [t("import.detectedRows"), String(preview.totalRows)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-white/8 bg-white/[0.025] p-4">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    {label}
                  </p>
                  <p className="mt-2 text-lg font-black text-white">{value}</p>
                </div>
              ))}
            </div>

            <div className={cn(
              "rounded-xl border p-5",
              preview.invalidRowCount === 0
                ? "border-[#20D785]/20 bg-[#20D785]/[0.055]"
                : "border-[#F5B942]/25 bg-[#F5B942]/[0.055]"
            )}>
              <div className="flex items-start gap-3">
                {preview.invalidRowCount === 0
                  ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#20D785]" />
                  : <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-[#F5B942]" />}
                <div className="min-w-0">
                  <p className="font-black text-white">{t("import.automaticInterpretation")}</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {preview.interpretation.resultBasis === "FX_REPLAY_REPORTED"
                      ? t("import.fxReplayResultBasis")
                      : preview.interpretation.resultBasis === "MT4_GROSS_WITH_FEES"
                        ? t("import.mt4ResultBasis")
                        : preview.interpretation.resultBasis === "NET_COLUMN"
                          ? t("import.netResultDetected")
                          : preview.interpretation.resultBasis === "GROSS_COLUMN"
                            ? t("import.grossResultDetected")
                            : t("import.resultNeedsOneAnswer")}
                  </p>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                    {preview.interpretation.feeDetailsAvailable
                      ? t("import.feeDetailsDetected")
                      : t("import.feeDetailsUnavailable")}
                  </p>
                  {preview.interpretation.marketDataProvider && (
                    <p className="mt-2 text-xs font-bold text-[#16D9FF]">
                      {t("import.marketDataProvider")}: {preview.interpretation.marketDataProvider}
                    </p>
                  )}
                </div>
                <Badge className={cn(
                  "ml-auto shrink-0 border px-3 py-1 text-[9px] font-black uppercase",
                  preview.invalidRowCount === 0
                    ? "border-[#20D785]/20 bg-[#20D785]/10 text-[#20D785]"
                    : "border-[#F5B942]/20 bg-[#F5B942]/10 text-[#F5B942]"
                )}>
                  {preview.invalidRowCount === 0
                    ? t("import.readyToImport")
                    : t("import.rowsNeedAttention", String(preview.invalidRowCount))}
                </Badge>
              </div>
            </div>

            {!preview.importability.canSave && (
              <div className="flex gap-3 rounded-xl border border-[#FF4D67]/30 bg-[#FF4D67]/8 p-4 text-sm text-[#FF8798]">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                <span>{importabilityMessage}</span>
              </div>
            )}

            {preview.sourceSummary && (
              <div className="rounded-xl border border-[#16D9FF]/15 bg-[#08131D] p-5">
                <h3 className="font-black">{t("import.summaryCheck")}</h3>
                <div className="mt-4 grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-[10px] uppercase text-muted-foreground">{t("import.reportedClosedPnl")}</p>
                    <p className="mt-1 font-black">{preview.sourceSummary.reportedClosedPnl ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-muted-foreground">{t("import.rowProfitTotal")}</p>
                    <p className="mt-1 font-black">{preview.sourceSummary.rowProfitTotal}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-muted-foreground">{t("import.difference")}</p>
                    <p className={cn(
                      "mt-1 font-black",
                      preview.sourceSummary.rowVsSummaryDelta === 0
                        ? "text-[#20D785]"
                        : "text-[#F5B942]"
                    )}>
                      {preview.sourceSummary.rowVsSummaryDelta ?? "—"}
                    </p>
                  </div>
                </div>
                {preview.sourceSummary.rowVsSummaryDelta !== null &&
                  preview.sourceSummary.rowVsSummaryDelta !== 0 && (
                    <p className="mt-4 text-xs leading-5 text-[#F5B942]">
                      {t("import.precisionWarning")}
                    </p>
                  )}
              </div>
            )}

            {(requiresTimezone || requiresPnlChoice || requiresFeeChoice) && (
              <div className="grid gap-5 md:grid-cols-2">
                {requiresTimezone && (
                  <div className="space-y-2">
                    <Label>{t("import.timezoneQuestion")}</Label>
                   <Select value={sourceTimezone} onValueChange={(value) => setSourceTimezone(value ?? "")}>
                      <SelectTrigger className={selectTriggerClass}>
                        <SelectValue placeholder={t("import.selectTimezone")}>
                        {sourceTimezone ? sourceTimezone.replaceAll("_", " ") : t("import.selectTimezone")}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent align="start" className={selectContentClass}>
                      {COMMON_TIMEZONES.map((timezone) => (
                        <SelectItem key={timezone} value={timezone} className={selectItemClass}>
                          {timezone.replaceAll("_", " ")}
                        </SelectItem>
                      ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs leading-5 text-muted-foreground">{t("import.timezoneHelp")}</p>
                  </div>
                )}

                {requiresPnlChoice && (
                  <div className="space-y-2">
                    <Label>{t("import.pnlBasis")}</Label>
                    <Select value={pnlMode} onValueChange={(value) => {
                      const nextMode = (value ?? "") as PnlMode;
                      setPnlMode(nextMode);
                      if (nextMode !== "GROSS") {
                        setFeeSignConvention("");
                      }
                    }}>
                      <SelectTrigger className={selectTriggerClass}>
                        <SelectValue placeholder={t("import.selectPnlBasis")}>
                          {pnlMode === "GROSS"
                            ? t("import.grossPnl")
                            : pnlMode === "NET"
                              ? t("import.netPnl")
                              : t("import.selectPnlBasis")}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent align="start" className={selectContentClass}>
                        <SelectItem value="NET" className={selectItemClass}>{t("import.netPnl")}</SelectItem>
                        <SelectItem value="GROSS" className={selectItemClass}>{t("import.grossPnl")}</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs leading-5 text-muted-foreground">
                      {pnlMode === "GROSS" ? t("import.grossPnlHelp") : t("import.netPnlHelp")}
                    </p>
                  </div>
                )}

                {showFeeChoice && (
                  <div className="space-y-2">
                    <Label>{t("import.feeSign")}</Label>
                    <Select value={feeSignConvention} onValueChange={(value) => setFeeSignConvention((value ?? "") as FeeSignConvention)}>
                      <SelectTrigger className={selectTriggerClass}>
                        <SelectValue placeholder={t("import.selectFeeSign")}>
                          {feeSignConvention === "SIGNED"
                            ? t("import.signedFees")
                            : feeSignConvention === "COSTS_POSITIVE"
                              ? t("import.positiveCosts")
                              : t("import.selectFeeSign")}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent align="start" className={selectContentClass}>
                        <SelectItem value="SIGNED" className={selectItemClass}>{t("import.signedFees")}</SelectItem>
                        <SelectItem value="COSTS_POSITIVE" className={selectItemClass}>{t("import.positiveCosts")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            )}

            {preview.invalidRowCount > 0 && (
              <div className="rounded-xl border border-[#FF4D67]/30 bg-[#FF4D67]/7 p-5">
                <h3 className="font-black text-[#FF8798]">{t("import.invalidRowsTitle")}</h3>
                <p className="mt-1 text-xs text-muted-foreground">{t("import.invalidRowsBlock")}</p>
                <div className="mt-4 space-y-2">
                  {preview.invalidRows.slice(0, 8).map((item) => (
                    <div key={item.row} className="rounded-lg bg-black/20 px-3 py-2 text-xs">
                      <span className="font-black text-[#FF8798]">#{item.row}</span>
                      <span className="ml-2 text-muted-foreground">
                        {item.errors.map(localizeRowError).join("; ")}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-4">
              <Button
                variant="ghost"
                className="h-14 flex-1 font-black uppercase text-muted-foreground"
                onClick={() => setStep("upload")}
                disabled={loading}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                {t("import.backToFile")}
              </Button>
              <Button
                className="h-14 flex-[2] brand-gradient text-white font-black uppercase glow-primary"
                onClick={handleImport}
                disabled={!canSave || loading}
              >
                {loading
                  ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> {t("import.synchronizing")}</>
                  : <><Save className="mr-2 h-5 w-5" /> {t("import.saveImportCount", String(preview.totalRows))}</>}
              </Button>
            </div>
          </div>
        </motion.div>
      ) : null}
    </div>
  );
}

/* ============================================================
   Screenshot Import Tab
   ============================================================ */
function ScreenshotImportTab() {
  const router = useRouter();
  const { t } = useI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const requestInFlightRef = useRef(false);
  const [step, setStep] = useState<ScreenshotStep>("upload");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState("");
  const [tradesList, setTradesList] = useState<EditableScreenshotTrade[]>([]);
  const [checkedTrades, setCheckedTrades] = useState<Set<number>>(new Set());
  const [sourceTimezone, setSourceTimezone] = useState("");

  const fieldLabels: Record<ScreenshotFieldKey, string> = {
    symbol: t("import.fieldSymbol"),
    direction: t("import.fieldDirection"),
    entryPrice: t("import.fieldEntry"),
    exitPrice: t("import.fieldExit"),
    stopLoss: t("import.fieldStopLoss"),
    targetPrice: t("import.fieldTarget"),
    positionSize: t("import.fieldSize"),
    pnl: t("import.fieldPnl"),
    tradedAt: t("import.fieldTime"),
  };

  const resetScreenshotImport = useCallback(() => {
    setStep("upload");
    setImagePreview(null);
    setFileName("");
    setTradesList([]);
    setCheckedTrades(new Set());
    setSourceTimezone("");
    setLoading(false);
    requestInFlightRef.current = false;
  }, []);

  const handleImageFile = useCallback((file: File) => {
    if (requestInFlightRef.current) {
      toast.info(t("import.analysisAlreadyRunning"));
      return;
    }
    if (!["image/jpeg", "image/png", "image/webp", "image/bmp"].includes(file.type)) {
      toast.error(t("import.invalidImage"));
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error(t("import.imageTooLarge"));
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => setImagePreview(e.target?.result as string);
    reader.readAsDataURL(file);

    requestInFlightRef.current = true;
    setFileName(file.name);
    setTradesList([]);
    setCheckedTrades(new Set());
    setSourceTimezone("");
    setLoading(true);
    setStep("review");

    const formData = new FormData();
    formData.append("image", file);

    fetch("/api/import/screenshot", { method: "POST", body: formData })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          const errorKey = data.code === "VISION_NOT_CONFIGURED"
            ? "import.visionNotConfigured"
            : data.code === "VISION_INVALID_KEY"
              ? "import.visionInvalidKey"
            : data.code === "VISION_UNAVAILABLE"
              ? "import.visionUnavailable"
              : data.code === "NO_SIGNALS"
                ? "import.noSignals"
                : "error.generic";
          throw new Error(t(errorKey));
        }

        const results = data.results as Array<{ trades?: ExtractionResult[] }> | undefined;
        const extractedTrades: ExtractionResult[] = data.extraction
          ? [data.extraction as ExtractionResult]
          : (results?.flatMap((result) => result.trades ?? []) ?? []);
        if (extractedTrades.length === 0) throw new Error(t("import.noSignals"));

        const fields: EditableScreenshotTrade[] = extractedTrades.map((trade) => {
          const editable = {
            symbol: "",
            direction: "",
            entryPrice: "",
            exitPrice: "",
            stopLoss: "",
            targetPrice: "",
            positionSize: "",
            pnl: "",
            tradedAt: "",
            confidence: trade.confidence ?? 0.5,
            evidence: trade.evidence ?? "",
          };
          for (const key of SCREENSHOT_FIELD_KEYS) {
            const value = trade[key];
            editable[key] =
              value === undefined || value === null ? "" : String(value);
          }
          return editable;
        });

        setTradesList(fields);
        setCheckedTrades(new Set(fields.map((_, i) => i)));
        toast.success(t("import.detectedCount", String(extractedTrades.length)));
      })
      .catch((err: unknown) => {
        toast.error(err instanceof Error ? err.message : t("error.generic"));
        setStep("upload");
      })
      .finally(() => {
        setLoading(false);
        requestInFlightRef.current = false;
      });
  }, [t]);

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items || requestInFlightRef.current) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) handleImageFile(file);
          break;
        }
      }
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [handleImageFile]);

  const selectedIndexes = Array.from(checkedTrades).sort((a, b) => a - b);
  const selectedTrades = selectedIndexes
    .map((index) => tradesList[index])
    .filter((trade): trade is EditableScreenshotTrade => Boolean(trade));
  const needsSourceTimezone = selectedTrades.some(
    (trade) => trade.tradedAt !== "" && !screenshotTimestampHasZone(trade.tradedAt)
  );
  const hasRequiredErrors = selectedTrades.some(
    (trade) =>
      !trade.symbol.trim() ||
      !["LONG", "SHORT"].includes(trade.direction.toUpperCase()) ||
      !trade.tradedAt.trim()
  );
  const hasInvalidNumericValues = selectedTrades.some((trade) =>
    SCREENSHOT_NUMERIC_FIELDS.some(
      (key) =>
        trade[key].trim() !== "" && !Number.isFinite(Number(trade[key]))
    )
  );
  const canSaveScreenshotTrades =
    selectedTrades.length > 0 &&
    !hasRequiredErrors &&
    !hasInvalidNumericValues &&
    (!needsSourceTimezone || sourceTimezone !== "");

  const updateTradeField = (
    index: number,
    key: ScreenshotFieldKey,
    value: string
  ) => {
    setTradesList((current) =>
      current.map((trade, tradeIndex) =>
        tradeIndex === index ? { ...trade, [key]: value } : trade
      )
    );
  };

  const parseOptionalNumber = (value: string): number | null => {
    if (value.trim() === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const handleSaveAll = async () => {
    if (!canSaveScreenshotTrades) {
      toast.error(t("import.completeRequiredFields"));
      return;
    }
    setStep("saving");
    try {
      const selected = selectedTrades.map((trade) => ({
        symbol: trade.symbol.trim(),
        direction: trade.direction.toUpperCase(),
        entryPrice: parseOptionalNumber(trade.entryPrice),
        exitPrice: parseOptionalNumber(trade.exitPrice),
        stopLoss: parseOptionalNumber(trade.stopLoss),
        targetPrice: parseOptionalNumber(trade.targetPrice),
        positionSize: parseOptionalNumber(trade.positionSize),
        pnl: parseOptionalNumber(trade.pnl),
        tradedAt: trade.tradedAt.trim(),
      }));

      const res = await fetch("/api/import/screenshot", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trades: selected,
          sourceTimezone: needsSourceTimezone ? sourceTimezone : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          data.code === "PERSISTENT_DATABASE_REQUIRED"
            ? t("import.persistentDatabaseRequired")
            : data.code === "SOURCE_TIMEZONE_REQUIRED"
            ? t("import.timezoneRequired")
            : data.code === "SCREENSHOT_PREFLIGHT_FAILED"
              ? t("import.completeRequiredFields")
              : t("import.transferFailed")
        );
      }
      toast.success(t("import.savedCount", String(data.saved ?? selected.length)));
      setStep("done");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t("error.generic"));
      setStep("review");
    }
  };

  if (step === "done") {
    return (
      <div className="fifa-card p-10 flex flex-col items-center text-center gap-6">
         <div className="h-20 w-20 rounded-3xl bg-[#06B6D4]/10 flex items-center justify-center border border-[#06B6D4]/20 glow-accent">
            <Zap className="h-10 w-10 text-[#06B6D4]" />
         </div>
         <h2 className="text-2xl font-black heading-sports">{t("import.saved")}</h2>
          <div className="flex gap-3">
            <Button variant="outline" className="h-14 px-8 font-black uppercase" onClick={resetScreenshotImport}>{t("import.importMore")}</Button>
            <Button className="brand-gradient text-white font-black uppercase glow-primary px-10 h-14" onClick={() => router.push("/trades")}>{t("import.liveView")}</Button>
          </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {step === "upload" ? (
        <div
          className={cn(
            "fifa-card relative p-20 flex flex-col items-center justify-center border-2 border-dashed transition-all cursor-pointer group",
            dragOver
              ? "border-[#3B82F6] bg-[#3B82F6]/5"
              : "border-white/5 hover:border-[#3B82F6]/50 hover:bg-white/[0.02]",
          )}
          onDragEnter={(event) => {
            event.preventDefault();
            setDragOver(true);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
            setDragOver(true);
          }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node)) {
              setDragOver(false);
            }
          }}
          onDrop={(event) => {
            event.preventDefault();
            setDragOver(false);
            const file = event.dataTransfer.files[0];
            if (file) handleImageFile(file);
          }}
        >
          <input
            ref={fileInputRef}
            id="screenshot-upload"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/bmp"
            aria-label={t("import.chooseImage")}
            className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) handleImageFile(file);
              event.currentTarget.value = "";
            }}
          />
          <div className="pointer-events-none mb-6 h-20 w-20 rounded-3xl bg-white/5 flex items-center justify-center border border-white/10 group-hover:scale-110 transition-transform">
            <Camera className={cn("h-10 w-10", dragOver ? "text-[#3B82F6]" : "text-muted-foreground/40")} />
          </div>
          <div className="pointer-events-none text-center space-y-3">
            <h3 className="text-xl font-black heading-sports">{t("import.visualAnalysis")}</h3>
            <p className="text-[10px] font-bold text-muted-foreground/40 uppercase tracking-widest">{t("import.screenshotTab")}</p>
            <span className="inline-flex rounded-lg border border-[#3B82F6]/30 bg-[#3B82F6]/10 px-4 py-2 text-[10px] font-black uppercase tracking-wider text-[#60A5FA]">
              {t("import.chooseImage")}
            </span>
            <p className="text-[9px] font-semibold text-muted-foreground/35">
              {t("import.aiDisclosure")}
            </p>
          </div>
        </div>
       ) : loading || step === "saving" ? (
         <div className="fifa-card overflow-hidden">
           {imagePreview && (
             <div className="relative h-40 overflow-hidden border-b border-white/8 opacity-35">
               <Image src={imagePreview} alt="" fill unoptimized className="object-cover" />
             </div>
           )}
           <div className="p-16 flex flex-col items-center justify-center gap-6">
             <Loader2 className="h-12 w-12 animate-spin text-[#06B6D4]" />
             <p className="text-sm font-black text-white">
               {step === "saving" ? t("import.savingVerifiedTrades") : t("import.analyzingVisibleData")}
             </p>
             <p className="max-w-lg text-center text-xs leading-5 text-muted-foreground">
               {step === "saving" ? t("import.savingVerifiedHelp") : t("import.singleCallDisclosure")}
             </p>
           </div>
         </div>
       ) : (
         <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="space-y-4">
               <div className="flex items-center justify-between">
                 <Label className="label-sports ml-1">{t("import.source")}</Label>
                 <span className="max-w-[65%] truncate text-xs text-muted-foreground">{fileName}</span>
               </div>
               <div className="fifa-card overflow-hidden p-2">
                  <Image
                    src={imagePreview!}
                    alt={t("import.uploadedScreenshot")}
                    width={1600}
                    height={900}
                    unoptimized
                    className="h-auto w-full rounded-lg"
                  />
               </div>
               <div className="rounded-xl border border-[#16D9FF]/15 bg-[#16D9FF]/[0.045] p-4 text-xs leading-5 text-muted-foreground">
                 <span className="font-black text-[#16D9FF]">{t("import.evidenceOnly")} </span>
                 {t("import.evidenceOnlyHelp")}
               </div>
            </div>

            <div className="space-y-6">
               <div className="flex items-center justify-between">
                  <Label className="label-sports ml-1">{t("import.extracted")} ({tradesList.length})</Label>
                 <Button variant="ghost" className="h-auto p-0 text-[10px] font-black uppercase text-[#06B6D4]" onClick={() => setCheckedTrades(new Set(tradesList.map((_, i) => i)))}>{t("import.selectAll")}</Button>
              </div>

               {needsSourceTimezone && (
                 <div className="space-y-2 rounded-xl border border-[#F5B942]/20 bg-[#F5B942]/[0.045] p-4">
                   <Label>{t("import.timezoneQuestion")}</Label>
                   <Select value={sourceTimezone} onValueChange={(value) => setSourceTimezone(value ?? "")}>
                     <SelectTrigger className="h-11 border-white/10 bg-[#101720] text-white">
                       <SelectValue placeholder={t("import.selectTimezone")}>
                         {sourceTimezone ? sourceTimezone.replaceAll("_", " ") : t("import.selectTimezone")}
                       </SelectValue>
                     </SelectTrigger>
                     <SelectContent className="max-h-72 border-[#16D9FF]/20 bg-[#0B1018] text-white">
                       {COMMON_TIMEZONES.map((timezone) => (
                         <SelectItem key={timezone} value={timezone}>
                           {timezone.replaceAll("_", " ")}
                         </SelectItem>
                       ))}
                     </SelectContent>
                   </Select>
                   <p className="text-xs text-muted-foreground">{t("import.screenshotTimezoneHelp")}</p>
                 </div>
               )}

               <div className="space-y-4 max-h-[620px] overflow-y-auto pr-2 custom-scrollbar">
                  {tradesList.map((f, i) => (
                    <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} key={i} className={cn("fifa-card p-5 space-y-4", !checkedTrades.has(i) && "opacity-45")}>
                       <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                             <button type="button" aria-label={t("import.toggleTrade")} onClick={() => { const n = new Set(checkedTrades); if(n.has(i)) n.delete(i); else n.add(i); setCheckedTrades(n); }}>
                                {checkedTrades.has(i) ? <CheckSquare className="h-5 w-5 text-[#3B82F6]" /> : <Square className="h-5 w-5 text-white/10" />}
                             </button>
                             <span className="font-black heading-sports text-sm">{f.symbol || t("import.needsReview")}</span>
                             <Badge className={cn(
                               "border text-[8px] font-black uppercase",
                               f.confidence >= 0.8
                                 ? "border-[#20D785]/20 bg-[#20D785]/10 text-[#20D785]"
                                 : "border-[#F5B942]/20 bg-[#F5B942]/10 text-[#F5B942]"
                             )}>
                               {Math.round(f.confidence * 100)}% {t("import.confidence")}
                             </Badge>
                          </div>
                          <span className="text-[10px] font-black text-white/25">#{i + 1}</span>
                       </div>

                       {f.evidence && (
                         <div className="rounded-lg border border-white/7 bg-black/15 px-3 py-2 text-xs leading-5 text-muted-foreground">
                           <span className="font-black text-white/65">{t("import.visibleEvidence")}: </span>
                           {f.evidence}
                         </div>
                       )}

                       <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                          {SCREENSHOT_FIELD_KEYS.map((key) => (
                            <div key={key} className={cn("space-y-1", key === "tradedAt" && "col-span-2 md:col-span-3")}>
                               <p className="text-[9px] font-black text-muted-foreground uppercase tracking-wider">
                                 {fieldLabels[key]}
                                 {["symbol", "direction", "tradedAt"].includes(key) && <span className="ml-1 text-[#FF4D67]">*</span>}
                               </p>
                               {key === "direction" ? (
                                 <Select value={f.direction || undefined} onValueChange={(value) => updateTradeField(i, "direction", value ?? "")}>
                                   <SelectTrigger className={cn("h-9 bg-white/5 text-xs", !f.direction && "border-[#FF4D67]/45")}>
                                     <SelectValue placeholder={t("import.selectDirection")} />
                                   </SelectTrigger>
                                   <SelectContent className="border-[#16D9FF]/20 bg-[#0B1018] text-white">
                                     <SelectItem value="LONG">{t("import.directionLong")}</SelectItem>
                                     <SelectItem value="SHORT">{t("import.directionShort")}</SelectItem>
                                   </SelectContent>
                                 </Select>
                               ) : (
                                 <Input
                                   value={f[key]}
                                   inputMode={SCREENSHOT_NUMERIC_FIELDS.includes(key) ? "decimal" : undefined}
                                   onChange={(event) => updateTradeField(i, key, event.target.value)}
                                   className={cn(
                                     "h-9 bg-white/5 border-white/8 rounded-md text-xs font-bold",
                                     ["symbol", "tradedAt"].includes(key) && !f[key].trim() && "border-[#FF4D67]/45",
                                     SCREENSHOT_NUMERIC_FIELDS.includes(key) &&
                                       f[key].trim() !== "" &&
                                       !Number.isFinite(Number(f[key])) &&
                                       "border-[#FF4D67]/65"
                                   )}
                                 />
                               )}
                            </div>
                          ))}
                       </div>
                   </motion.div>
                 ))}
              </div>

               <div className="flex gap-4">
                  <Button variant="ghost" className="h-14 flex-1 font-black uppercase text-muted-foreground" onClick={resetScreenshotImport}>{t("import.chooseAnotherImage")}</Button>
                  <Button className="h-14 flex-[2] brand-gradient text-white font-black uppercase glow-primary" onClick={handleSaveAll} disabled={!canSaveScreenshotTrades}>
                     {t("import.saveVerifiedCount", String(checkedTrades.size))}
                  </Button>
               </div>
               {!canSaveScreenshotTrades && checkedTrades.size > 0 && (
                 <p className="text-xs leading-5 text-[#F5B942]">
                   {hasInvalidNumericValues
                     ? t("import.invalidNumericFields")
                     : t("import.completeRequiredFields")}
                 </p>
               )}
            </div>
         </div>
      )}
    </div>
  );
}

/* ============================================================
   Main Import Page
   ============================================================ */
export default function ImportPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("screenshot");
  const { t } = useI18n();

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth/signin");
  }, [status, router]);

  if (status === "loading" || !session) return null;

  return (
    <div className="page-container">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <p className="label-sports mb-1">{t("common.incomingStream")}</p>
        <h1 className="text-3xl font-black heading-sports">{t("import.title")}</h1>
      </motion.div>

      <Tabs defaultValue="screenshot" value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="mb-10 bg-white/5 p-1.5 h-auto rounded-2xl border border-white/5 gap-2">
           <TabsTrigger value="screenshot" className="rounded-xl px-10 py-4 text-[11px] font-black uppercase tracking-widest data-[state=active]:bg-[#3B82F6] data-[state=active]:text-white transition-all gap-3">
              <Camera className="h-4 w-4" /> {t("import.optical")}
           </TabsTrigger>
           <TabsTrigger value="csv" className="rounded-xl px-10 py-4 text-[11px] font-black uppercase tracking-widest data-[state=active]:bg-[#3B82F6] data-[state=active]:text-white transition-all gap-3">
              <FileSpreadsheet className="h-4 w-4" /> {t("import.csv")}
           </TabsTrigger>
        </TabsList>

        <AnimatePresence mode="wait">
          {activeTab === "screenshot" && (
            <motion.div key="screenshot" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <ScreenshotImportTab />
            </motion.div>
          )}
          {activeTab === "csv" && (
            <motion.div key="csv" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <CsvImportTab router={router} />
            </motion.div>
          )}
        </AnimatePresence>
      </Tabs>
    </div>
  );
}
