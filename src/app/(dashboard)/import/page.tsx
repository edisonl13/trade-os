"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
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
  fields: ExtractedField[];
}

const FIELD_LABELS: Record<string, string> = {
  symbol: "Symbol",
  direction: "Side",
  entryPrice: "Entry",
  exitPrice: "Exit",
  stopLoss: "SL",
  targetPrice: "TP",
  positionSize: "Size",
  pnl: "P&L",
  tradedAt: "Time",
};

/* ============================================================
   CSV Import Tab
   ============================================================ */
type PnlMode = "GROSS" | "NET" | "";
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
  const [feesConfirmed, setFeesConfirmed] = useState(false);
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const [result, setResult] = useState<{
    inserted: number;
    skipped: number;
    errors?: { row: number; error: string }[];
    importBatch?: string;
  } | null>(null);

  const handleFileDrop = useCallback(async (f: File) => {
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
    setFeesConfirmed(false);
    setReviewConfirmed(false);
  }, [t]);

  const resetImport = () => {
    setFile(null);
    setPreview(null);
    setStep("upload");
    setSourceTimezone("");
    setPnlMode("");
    setFeeSignConvention("");
    setFeesConfirmed(false);
    setReviewConfirmed(false);
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

  const buildFormData = (previewOnly: boolean) => {
    const formData = new FormData();
    if (file) formData.append("file", file);
    if (previewOnly) formData.append("preview", "true");
    if (preview?.mappings) {
      formData.append("mappings", JSON.stringify(preview.mappings));
    }
    if (sourceTimezone) formData.append("sourceTimezone", sourceTimezone);
    if (pnlMode) formData.append("pnlMode", pnlMode);
    if (feeSignConvention) {
      formData.append("feeSignConvention", feeSignConvention);
    }
    formData.append("feesConfirmed", String(feesConfirmed));
    return formData;
  };

  const requestPreview = async (): Promise<ImportPreview | null> => {
    if (!file) return null;
    try {
      const res = await fetch("/api/import/csv", {
        method: "POST",
        body: buildFormData(true),
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
      if (nextPreview.detectedBroker === "mt4") {
        setPnlMode("GROSS");
        setFeeSignConvention("SIGNED");
      }
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
  const grossPnlReady =
    pnlMode !== "GROSS" || (feesConfirmed && feeSignConvention !== "");
  const canSave =
    Boolean(preview?.importability.canSave) &&
    preview?.invalidRowCount === 0 &&
    (!requiresTimezone || sourceTimezone !== "") &&
    pnlMode !== "" &&
    grossPnlReady &&
    reviewConfirmed;

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
            <Button className="flex-1 brand-gradient text-white font-black uppercase rounded-xl h-12 glow-primary" onClick={() => navRouter.push("/")}>{t("import.liveView")}</Button>
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
                {t("import.reviewEyebrow")}
              </p>
              <h2 className="mt-2 text-2xl font-black heading-sports">
                {t("import.reviewTitle")}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {t("import.reviewDescription")}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {[
                [t("import.detectedFormat"), preview.fileFormat],
                [t("import.detectedBroker"), preview.detectedBroker ?? "—"],
                [t("import.detectedRows"), String(preview.totalRows)],
                [t("import.invalidRows"), String(preview.invalidRowCount)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-white/8 bg-white/[0.025] p-4">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    {label}
                  </p>
                  <p className="mt-2 text-lg font-black text-white">{value}</p>
                </div>
              ))}
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

            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-2">
                <Label>{t("import.sourceTimezone")}</Label>
                {requiresTimezone ? (
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
                ) : (
                  <div className="flex h-12 items-center rounded-xl border border-white/8 bg-white/[0.025] px-4 text-sm font-bold text-[#20D785]">
                    {t("import.embeddedTimezone")}
                  </div>
                )}
                <p className="text-xs leading-5 text-muted-foreground">{t("import.timezoneHelp")}</p>
              </div>

              <div className="space-y-2">
                <Label>{t("import.pnlBasis")}</Label>
                <Select value={pnlMode} onValueChange={(value) => {
                  const nextMode = (value ?? "") as PnlMode;
                  setPnlMode(nextMode);
                  if (nextMode !== "GROSS") {
                    setFeeSignConvention("");
                    setFeesConfirmed(false);
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
            </div>

            {pnlMode === "GROSS" && (
              <div className="grid gap-5 rounded-xl border border-[#F5B942]/20 bg-[#F5B942]/5 p-5 md:grid-cols-2">
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
                <button
                  type="button"
                  onClick={() => setFeesConfirmed((current) => !current)}
                  className={cn(
                    "flex min-h-12 items-center gap-3 rounded-xl border px-4 text-left text-sm font-bold transition-colors",
                    feesConfirmed
                      ? "border-[#20D785]/35 bg-[#20D785]/8 text-[#20D785]"
                      : "border-white/10 bg-black/10 text-muted-foreground"
                  )}
                >
                  {feesConfirmed ? <CheckSquare className="h-5 w-5" /> : <Square className="h-5 w-5" />}
                  {t("import.feeConfirmed")}
                </button>
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

            <button
              type="button"
              onClick={() => setReviewConfirmed((current) => !current)}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl border p-4 text-left text-sm font-bold transition-colors",
                reviewConfirmed
                  ? "border-[#16D9FF]/35 bg-[#16D9FF]/8 text-white"
                  : "border-white/10 bg-white/[0.02] text-muted-foreground"
              )}
            >
              {reviewConfirmed ? <CheckSquare className="h-5 w-5 text-[#16D9FF]" /> : <Square className="h-5 w-5" />}
              {t("import.reviewConfirmed")}
            </button>

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
                  : <><Save className="mr-2 h-5 w-5" /> {t("import.saveImport")}</>}
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
  const [step, setStep] = useState<ScreenshotStep>("upload");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [tradesList, setTradesList] = useState<Record<string, string>[]>([]);
  const [checkedTrades, setCheckedTrades] = useState<Set<number>>(new Set());

  const handleImageFile = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error(t("import.invalidImage"));
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => setImagePreview(e.target?.result as string);
    reader.readAsDataURL(file);

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

        const fields = extractedTrades.map((trade) => {
           const f: Record<string, string> = {};
           Object.keys(FIELD_LABELS).forEach((key) => {
             const value = trade[key as keyof ExtractionResult];
             if (value !== undefined && value !== null && key !== "fields") f[key] = String(value);
           });
           return f;
        });

        setTradesList(fields);
        setCheckedTrades(new Set(fields.map((_, i) => i)));
        toast.success(t("import.detectedCount", String(extractedTrades.length)));
      })
      .catch((err: unknown) => {
        toast.error(err instanceof Error ? err.message : t("error.generic"));
        setStep("upload");
      })
      .finally(() => setLoading(false));
  }, [t]);

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) handleImageFile(file);
        }
      }
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [handleImageFile]);

  const handleSaveAll = async () => {
    setStep("saving");
    try {
      const selected = Array.from(checkedTrades).map(i => {
         const f = tradesList[i];
         return {
            symbol: f.symbol || "UNKNOWN",
            direction: f.direction || "LONG",
            entryPrice: f.entryPrice ? parseFloat(f.entryPrice) : null,
            exitPrice: f.exitPrice ? parseFloat(f.exitPrice) : null,
            stopLoss: f.stopLoss ? parseFloat(f.stopLoss) : null,
            targetPrice: f.targetPrice ? parseFloat(f.targetPrice) : null,
            positionSize: f.positionSize ? parseFloat(f.positionSize) : null,
            pnl: f.pnl ? parseFloat(f.pnl) : null,
            tradedAt: f.tradedAt || new Date().toISOString(),
         };
      });

      const res = await fetch("/api/import/screenshot", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trades: selected }),
      });

      if (!res.ok) throw new Error(t("import.transferFailed"));
      toast.success(t("import.saved"));
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
         <Button className="brand-gradient text-white font-black uppercase glow-primary px-10 h-14" onClick={() => router.push("/")}>{t("import.return")}</Button>
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
      ) : loading ? (
        <div className="fifa-card p-20 flex flex-col items-center justify-center gap-6">
           <Loader2 className="h-12 w-12 animate-spin text-[#06B6D4]" />
            <p className="text-[10px] font-black uppercase tracking-widest text-[#06B6D4] animate-pulse">{t("import.analyzing")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
           <div className="space-y-4">
              <Label className="label-sports ml-1">{t("import.source")}</Label>
              <div className="fifa-card overflow-hidden p-2">
                 <img src={imagePreview!} alt="Feed" className="w-full h-auto rounded-lg grayscale hover:grayscale-0 transition-all duration-500" />
              </div>
           </div>

           <div className="space-y-6">
              <div className="flex items-center justify-between">
                 <Label className="label-sports ml-1">{t("import.extracted")} ({tradesList.length})</Label>
                 <Button variant="ghost" className="h-auto p-0 text-[10px] font-black uppercase text-[#06B6D4]" onClick={() => setCheckedTrades(new Set(tradesList.map((_, i) => i)))}>{t("import.selectAll")}</Button>
              </div>

              <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                 {tradesList.map((f, i) => (
                   <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} key={i} className={cn("fifa-card p-4 space-y-4", !checkedTrades.has(i) && "opacity-40 grayscale")}>
                      <div className="flex items-center justify-between">
                         <div className="flex items-center gap-3">
                            <button onClick={() => { const n = new Set(checkedTrades); if(n.has(i)) n.delete(i); else n.add(i); setCheckedTrades(n); }}>
                               {checkedTrades.has(i) ? <CheckSquare className="h-5 w-5 text-[#3B82F6]" /> : <Square className="h-5 w-5 text-white/10" />}
                            </button>
                            <span className="font-black heading-sports text-sm">{f.symbol || "UNKNOWN"}</span>
                            <Badge className={cn("text-[8px] font-black uppercase", f.direction === "SHORT" ? "bg-red-500/10 text-red-400" : "bg-[#22C55E]/10 text-[#22C55E]")}>{f.direction || "???"}</Badge>
                         </div>
                         <span className="text-[10px] font-black text-white/20">SIG-{String(i+1).padStart(2,'0')}</span>
                      </div>
                      
                      <div className="grid grid-cols-3 gap-3">
                         {['entryPrice', 'exitPrice', 'pnl'].map(k => (
                           <div key={k} className="space-y-1">
                              <p className="text-[7px] font-black text-muted-foreground/40 uppercase tracking-widest">{FIELD_LABELS[k]}</p>
                              <Input value={f[k] || ''} onChange={(e) => { const nl = [...tradesList]; nl[i][k] = e.target.value; setTradesList(nl); }} className="h-7 bg-white/5 border-white/5 rounded-md text-[10px] font-bold" />
                           </div>
                         ))}
                      </div>
                   </motion.div>
                 ))}
              </div>

              <div className="flex gap-4">
                 <Button variant="ghost" className="h-14 flex-1 font-black uppercase text-muted-foreground" onClick={() => setStep("upload")}>{t("import.abort")}</Button>
                 <Button className="h-14 flex-[2] brand-gradient text-white font-black uppercase glow-primary" onClick={handleSaveAll} disabled={checkedTrades.size === 0}>
                    {t("import.save")} {checkedTrades.size} {t("import.signals")}
                 </Button>
              </div>
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
