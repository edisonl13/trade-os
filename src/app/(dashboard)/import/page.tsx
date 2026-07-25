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
  ArrowRight,
  Database,
  ImageIcon,
  Save,
  Edit3,
  ScanLine,
  CheckSquare,
  Square,
  Zap,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/provider";

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
function CsvImportTab({ router: navRouter }: { router: ReturnType<typeof useRouter> }) {
  const { t } = useI18n();
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<ImportStep>("upload");
  const [result, setResult] = useState<{
    inserted: number;
    skipped: number;
    errors?: { row: number; error: string }[];
    importBatch?: string;
  } | null>(null);

  const handleFileDrop = useCallback(async (f: File) => {
    const validTypes = [
      "text/csv",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ];
    if (!validTypes.includes(f.type) && !f.name.match(/\.(csv|xls|xlsx)$/i)) {
      toast.error(t("import.invalidFormat"));
      return;
    }
    setFile(f);
    setStep("upload");
  }, [t]);

  const handleImport = async () => {
    if (!file) return;
    setLoading(true);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/import/csv", { method: "POST", body: formData });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error ?? t("import.transferFailed"));
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
            <Button variant="outline" className="flex-1 border-white/5 font-black uppercase rounded-xl h-12" onClick={() => { setFile(null); setStep("upload"); }}>{t("import.reset")}</Button>
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
          <input type="file" accept=".csv,.xls,.xlsx" className="hidden" id="csv-upload" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileDrop(f); }} />
        </div>
      ) : (
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
               <Button variant="ghost" className="h-14 flex-1 font-black uppercase text-muted-foreground" onClick={() => setFile(null)}>{t("import.cancel")}</Button>
              <Button className="h-14 flex-[2] brand-gradient text-white font-black uppercase glow-primary" onClick={handleImport} disabled={loading}>
                  {loading ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> {t("import.synchronizing")}</> : <><Upload className="mr-2 h-5 w-5" /> {t("import.uploadBtn")}</>}
              </Button>
           </div>
        </motion.div>
      )}
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
  const [tradesList, setTradesList] = useState<Record<string, string>[]>([]);
  const [checkedTrades, setCheckedTrades] = useState<Set<number>>(new Set());

  const handleImageFile = useCallback((file: File) => {
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
          className="fifa-card p-20 flex flex-col items-center justify-center border-2 border-dashed border-white/5 hover:border-white/10 transition-all cursor-pointer group"
          onClick={() => fileInputRef.current?.click()}
        >
          <div className="mb-6 h-20 w-20 rounded-3xl bg-white/5 flex items-center justify-center border border-white/10 group-hover:scale-110 transition-transform">
            <Camera className="h-10 w-10 text-muted-foreground/40" />
          </div>
          <div className="text-center space-y-2">
            <h3 className="text-xl font-black heading-sports">{t("import.visualAnalysis")}</h3>
            <p className="text-[10px] font-bold text-muted-foreground/40 uppercase tracking-widest">{t("import.screenshotTab")}</p>
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { if(e.target.files?.[0]) handleImageFile(e.target.files[0]); }} />
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
