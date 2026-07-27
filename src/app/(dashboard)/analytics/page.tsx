"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Clock3,
  SearchCheck,
  ShieldAlert,
  Target,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  PerformanceHeatmap,
  type InstrumentPerformance,
  type PerformanceHeatmapCell,
} from "@/components/performance-heatmap";
import { useI18n } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";

interface KPIData {
  totalTrades: number;
  closedTrades: number;
  openTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number | null;
  totalPnL: number;
  totalFees: number;
  avgRR: number | null;
  profitFactor: number | null;
  expectancy: number | null;
  maxDrawdown: number;
  maxDrawdownPercent: number | null;
  bestTrade: number | null;
  worstTrade: number | null;
  consecutiveWins: number;
  consecutiveLosses: number;
}

interface BreakdownItem {
  label: string;
  trades: number;
  wins: number;
  losses: number;
  winRate: number | null;
  totalPnL: number;
  avgRR: number | null;
}

interface AnalyticsBundle {
  kpi: KPIData;
  sessions: BreakdownItem[];
  weekdays: BreakdownItem[];
  directions: BreakdownItem[];
  heatmap: PerformanceHeatmapCell[];
  instruments: InstrumentPerformance[];
}

let analyticsCache: AnalyticsBundle | null = null;

function formatUSD(value: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}$${Math.abs(value).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  })}`;
}

function sampleTone(trades: number) {
  if (trades >= 50) return "text-[#20D785]";
  if (trades >= 30) return "text-[#16D9FF]";
  return "text-[#FFB84D]";
}

export default function AnalyticsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { t } = useI18n();
  const [loading, setLoading] = useState(analyticsCache === null);
  const [error, setError] = useState(false);
  const [data, setData] = useState<AnalyticsBundle | null>(analyticsCache);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const response = await fetch(
        "/api/analytics?type=analyticsBundle&granularity=day",
        { cache: "no-store" }
      );
      if (!response.ok) throw new Error("analytics");
      const result = (await response.json()) as AnalyticsBundle;
      analyticsCache = result;
      setData(result);
    } catch (fetchError) {
      console.error("Analytics fetch error", fetchError);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth/signin");
    if (status === "authenticated") void fetchData();
  }, [fetchData, router, status]);

  const closedOutcomes =
    (data?.kpi.winningTrades ?? 0) + (data?.kpi.losingTrades ?? 0);
  const maxInstrumentTrades = Math.max(
    1,
    ...(data?.instruments.map((instrument) => instrument.trades) ?? [1])
  );
  const dominantRisk = useMemo(() => {
    if (!data?.instruments.length) return null;
    return [...data.instruments].sort(
      (a, b) => a.totalPnL - b.totalPnL || b.trades - a.trades
    )[0];
  }, [data]);

  if (status === "loading" || !session) return null;

  return (
    <div className="page-container">
      <header className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#D65CFF]">
            {t("common.intelligence")}
          </p>
          <h1 className="mt-2 text-[31px] font-extrabold tracking-[-0.025em] text-white">
            {t("analytics.evidenceTitle")}
          </h1>
          <p className="mt-2 max-w-2xl text-[13px] leading-6 text-[#718094]">
            {t("analytics.evidenceSubtitle")}
          </p>
        </div>
        <Link href="/import">
          <Button className="h-10 gap-2 rounded-md border border-[#4D82FF]/65 bg-gradient-to-b from-[#356FFF] to-[#2459D8] px-4 text-[12px] font-extrabold text-white">
            {t("empty.importCta")} <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </header>

      {loading && !data ? (
        <div className="grid gap-5" aria-label={t("common.loading")}>
          <div className="panel-surface h-28 animate-pulse" />
          <div className="panel-surface h-[480px] animate-pulse" />
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="panel-surface h-64 animate-pulse" />
            <div className="panel-surface h-64 animate-pulse" />
          </div>
        </div>
      ) : error || !data ? (
        <div className="panel-surface flex min-h-80 flex-col items-center justify-center p-8 text-center">
          <AlertTriangle className="h-8 w-8 text-[#FF4D64]" />
          <h2 className="mt-4 text-xl font-extrabold text-white">
            {t("error.failed")}
          </h2>
          <Button
            type="button"
            onClick={fetchData}
            variant="outline"
            className="mt-5 border-white/10 bg-transparent"
          >
            {t("common.retry")}
          </Button>
        </div>
      ) : data.kpi.totalTrades === 0 ? (
        <div className="panel-surface flex min-h-96 flex-col items-center justify-center p-8 text-center">
          <BarChart3 className="h-10 w-10 text-[#16D9FF]" />
          <h2 className="mt-5 text-xl font-extrabold text-white">
            {t("analytics.locked")}
          </h2>
          <p className="mt-2 text-[13px] text-[#718094]">
            {t("analytics.lockedDesc")}
          </p>
        </div>
      ) : (
        <>
          <section className="panel-surface grid gap-5 p-5 sm:grid-cols-3 sm:p-6">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#16D9FF]/20 bg-[#16D9FF]/8 text-[#16D9FF]">
                <SearchCheck className="h-4 w-4" />
              </span>
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[#59697C]">
                  {t("analytics.sampleState")}
                </p>
                <strong className={cn("mt-1 block text-[18px]", sampleTone(closedOutcomes))}>
                  {closedOutcomes} {t("analytics.resultTrades")}
                </strong>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#D65CFF]/20 bg-[#D65CFF]/8 text-[#D65CFF]">
                <Target className="h-4 w-4" />
              </span>
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[#59697C]">
                  {t("analytics.instrumentEvidence")}
                </p>
                <strong className="mt-1 block text-[18px] text-white">
                  {data.instruments.length}
                </strong>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#FFB84D]/20 bg-[#FFB84D]/8 text-[#FFB84D]">
                <ShieldAlert className="h-4 w-4" />
              </span>
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[#59697C]">
                  {t("analytics.riskEvidence")}
                </p>
                <strong className="mt-1 block text-[18px] text-[#FF4D64]">
                  {data.kpi.consecutiveLosses}
                </strong>
              </div>
            </div>
          </section>

          <section className="panel-surface p-5 sm:p-6">
            <PerformanceHeatmap
              cells={data.heatmap}
              instruments={data.instruments}
            />
          </section>

          <section className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
            <div className="panel-surface p-5 sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-[17px] font-extrabold text-white">
                    {t("analytics.instrumentEvidence")}
                  </h2>
                  <p className="mt-1 text-[12px] text-[#718094]">
                    {t("analytics.instrumentEvidenceDesc")}
                  </p>
                </div>
                <Target className="h-5 w-5 text-[#D65CFF]" />
              </div>

              <div className="mt-5 grid gap-3">
                {data.instruments.map((instrument) => {
                  const outcomeCount = instrument.wins + instrument.losses;
                  const tone =
                    instrument.totalPnL > 0
                      ? "#20D785"
                      : instrument.totalPnL < 0
                        ? "#FF4D64"
                        : "#9AA8B8";
                  return (
                    <div
                      key={instrument.symbol}
                      className="rounded-lg border border-white/8 bg-black/15 p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <strong className="text-[15px] text-white">
                            {instrument.symbol}
                          </strong>
                          <p className="mt-1 text-[10px] text-[#718094]">
                            {instrument.trades} {t("heatmap.sample")} · {instrument.wins}/{outcomeCount}
                          </p>
                        </div>
                        <div className="text-right">
                          <strong
                            className="font-data text-[16px]"
                            style={{ color: tone }}
                          >
                            {formatUSD(instrument.totalPnL)}
                          </strong>
                          <p className="mt-1 text-[10px] text-[#718094]">
                            {instrument.winRate?.toFixed(1) ?? "—"}% ·{" "}
                            {instrument.totalR === null
                              ? "—"
                              : `${instrument.totalR > 0 ? "+" : ""}${instrument.totalR.toFixed(2)}R`}
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/5">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.max(5, (instrument.trades / maxInstrumentTrades) * 100)}%`,
                            backgroundColor: tone,
                          }}
                        />
                      </div>
                      <div className="mt-3 flex items-center gap-2 text-[10px]">
                        {outcomeCount >= 30 ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-[#20D785]" />
                        ) : (
                          <Clock3 className="h-3.5 w-3.5 text-[#FFB84D]" />
                        )}
                        <span className={sampleTone(outcomeCount)}>
                          {outcomeCount >= 50
                            ? t("heatmap.stable")
                            : outcomeCount >= 30
                              ? t("heatmap.preliminary")
                              : t("heatmap.insufficient")}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-5">
              <div className="panel-surface p-5 sm:p-6">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-[17px] font-extrabold text-white">
                    {t("analytics.riskEvidence")}
                  </h2>
                  <ShieldAlert className="h-5 w-5 text-[#FF4D64]" />
                </div>
                <div className="mt-5 grid gap-4">
                  <div className="rounded-lg border border-[#FF4D64]/15 bg-[#FF4D64]/5 p-4">
                    <span className="text-[10px] font-extrabold text-[#8A98A9]">
                      {t("analytics.worstTrade")}
                    </span>
                    <strong className="mt-1 block font-data text-[22px] text-[#FF4D64]">
                      {formatUSD(data.kpi.worstTrade ?? 0)}
                    </strong>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg border border-white/8 bg-black/15 p-4">
                      <span className="text-[10px] text-[#718094]">
                        {t("analytics.longestLoss")}
                      </span>
                      <strong className="mt-1 block text-[20px] text-[#FF4D64]">
                        {data.kpi.consecutiveLosses}
                      </strong>
                    </div>
                    <div className="rounded-lg border border-white/8 bg-black/15 p-4">
                      <span className="text-[10px] text-[#718094]">
                        {t("analytics.maxDrawdown")}
                      </span>
                      <strong className="mt-1 block text-[20px] text-[#FFB84D]">
                        {data.kpi.maxDrawdownPercent === null
                          ? "—"
                          : `${data.kpi.maxDrawdownPercent.toFixed(1)}%`}
                      </strong>
                    </div>
                  </div>
                  {dominantRisk && dominantRisk.totalPnL < 0 && (
                    <div className="border-t border-white/8 pt-4">
                      <p className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-[#59697C]">
                        {t("analytics.instrumentEvidence")}
                      </p>
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <span className="text-[13px] font-extrabold text-white">
                          {dominantRisk.symbol}
                        </span>
                        <span className={cn("font-data text-[13px]", dominantRisk.totalPnL < 0 ? "text-[#FF4D64]" : "text-[#20D785]")}>
                          {formatUSD(dominantRisk.totalPnL)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="panel-surface p-5 sm:p-6">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-[17px] font-extrabold text-white">
                    {t("analytics.timeEvidence")}
                  </h2>
                  <ArrowDownRight className="h-5 w-5 text-[#16D9FF]" />
                </div>
                <div className="mt-4 grid gap-3">
                  {data.sessions.slice(0, 5).map((item) => (
                    <div
                      key={item.label}
                      className="flex items-center justify-between gap-3 rounded-md border border-white/8 bg-black/15 px-3 py-3"
                    >
                      <span className="text-[11px] font-extrabold text-[#B6C1CE]">
                        {item.label}
                      </span>
                      <span className={cn("font-data text-[11px]", item.totalPnL >= 0 ? "text-[#20D785]" : "text-[#FF4D64]")}>
                        {item.trades} · {formatUSD(item.totalPnL)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
