"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  LayoutDashboard,
  Loader2,
  Plus,
  RefreshCw,
} from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import {
  Area,
  AreaChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { InfoButton } from "@/components/info-button";
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
  avgPnL: number | null;
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

interface CumulativePnLPoint {
  date: string;
  cumulativePnL: number;
  pnl: number;
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

interface CalendarDay {
  date: string;
  pnl: number;
  trades: number;
  wins: number;
  losses: number;
}

interface KpiTrendInfo {
  direction: "up" | "down" | "neutral";
  change: string | null;
  insufficientData: boolean;
}

interface KpiTrends {
  winRate: KpiTrendInfo;
  profitFactor: KpiTrendInfo;
  avgRR: KpiTrendInfo;
  expectancy: KpiTrendInfo;
  maxDrawdown: KpiTrendInfo;
}

interface RecentTrade {
  id: string;
  symbol: string;
  direction: "LONG" | "SHORT";
  strategy: string | null;
  setup: string | null;
  pnl: number | null;
  tradedAt: number;
  status: "OPEN" | "CLOSED";
}

interface OverviewResponse {
  kpi: KPIData;
  equityCurve: CumulativePnLPoint[];
  directions: BreakdownItem[];
  heatmap: PerformanceHeatmapCell[];
  instruments: InstrumentPerformance[];
  trends: KpiTrends;
  recentTrades: RecentTrade[];
}

let overviewCache: OverviewResponse | null = null;

function formatUSD(value: number, includePlus = true): string {
  const absolute = Math.abs(value);
  const sign = value < 0 ? "-" : includePlus ? "+" : "";
  if (absolute >= 1000) return `${sign}$${(absolute / 1000).toFixed(1)}K`;
  return `${sign}$${absolute.toFixed(2)}`;
}

function TrendBadge({
  trend,
  higherIsBetter = true,
}: {
  trend?: KpiTrendInfo;
  higherIsBetter?: boolean;
}) {
  const { t } = useI18n();

  if (!trend || trend.insufficientData) {
    return <span className="text-[10px] font-bold text-[#FFB84D]">{t("kpi.sample")}</span>;
  }

  if (trend.direction === "neutral" || !trend.change) {
    return <span className="text-[10px] font-bold text-[#59697C]">—</span>;
  }

  const movedUp = trend.direction === "up";
  const favourable = higherIsBetter ? movedUp : !movedUp;

  return (
    <span className={cn("inline-flex items-center gap-1 text-[10px] font-extrabold", favourable ? "text-[#20D785]" : "text-[#FF4D64]")}>
      {movedUp ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      {trend.change}
    </span>
  );
}

function MetricInfo({
  label,
  title,
  purpose,
  formula,
  requirement,
}: {
  label: string;
  title: string;
  purpose: string;
  formula: string;
  requirement: string;
}) {
  const { t } = useI18n();
  return (
    <InfoButton label={label}>
      <p className="text-[12px] font-extrabold text-white">{title}</p>
      <p className="text-[11px] text-[#B6C1CE]">{purpose}</p>
      <p className="text-[10.5px] text-[#8A98A9]"><span className="text-[#16D9FF]">{t("info.formula")}:</span> {formula}</p>
      <p className="text-[10.5px] text-[#8A98A9]"><span className="text-[#FFB84D]">{t("info.requirement")}:</span> {requirement}</p>
    </InfoButton>
  );
}

function KpiRailItem({
  label,
  value,
  colour,
  trend,
  higherIsBetter,
  help,
  attention = false,
}: {
  label: string;
  value: string;
  colour: string;
  trend?: KpiTrendInfo;
  higherIsBetter?: boolean;
  help: {
    label: string;
    purpose: string;
    formula: string;
    requirement: string;
  };
  attention?: boolean;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{
        opacity: 1,
        y: 0,
        backgroundColor: attention && !reduceMotion
          ? ["rgba(255,77,100,0)", "rgba(255,77,100,0.08)", "rgba(255,77,100,0)"]
          : "rgba(255,77,100,0)",
      }}
      transition={{ duration: attention && !reduceMotion ? 0.85 : 0.25 }}
      whileHover={{ y: -2 }}
      className={cn(
        "relative min-w-0 border-l border-[#9AA8B8]/10 px-4 py-4 first:border-l-0 first:pl-0",
        attention && "after:absolute after:inset-x-4 after:bottom-0 after:h-px after:bg-[#FF4D64] after:shadow-[0_0_12px_#FF4D64]"
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[10px] font-extrabold uppercase leading-4 tracking-[0.08em] text-[#59697C]">{label}</span>
        <MetricInfo title={label} {...help} />
      </div>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <strong className={cn("font-data text-[22px] font-extrabold tracking-[-0.04em]", colour)}>{value}</strong>
        <TrendBadge trend={trend} higherIsBetter={higherIsBetter} />
      </div>
    </motion.div>
  );
}

function EvidenceBar({
  label,
  value,
  width,
  colour,
}: {
  label: string;
  value: string;
  width: number;
  colour: string;
}) {
  return (
    <div className="grid grid-cols-[100px_1fr_48px] items-center gap-3 text-[12px] text-[#8795A6]">
      <span>{label}</span>
      <div className="h-1 overflow-hidden rounded-full bg-white/5">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${Math.max(0, Math.min(100, width))}%` }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          className="h-full rounded-full"
          style={{ backgroundColor: colour }}
        />
      </div>
      <strong className="text-right text-[11px]" style={{ color: colour }}>{value}</strong>
    </div>
  );
}

const DAY_KEYS = [
  "weekday.sun",
  "weekday.mon",
  "weekday.tue",
  "weekday.wed",
  "weekday.thu",
  "weekday.fri",
  "weekday.sat",
];

export default function OverviewPage() {
  const { status } = useSession();
  const router = useRouter();
  const { locale, t } = useI18n();
  const [dataLoading, setDataLoading] = useState(overviewCache === null);
  const [dataError, setDataError] = useState(false);
  const [kpi, setKpi] = useState<KPIData | null>(overviewCache?.kpi ?? null);
  const [equityCurve, setEquityCurve] = useState<CumulativePnLPoint[]>(overviewCache?.equityCurve ?? []);
  const [directions, setDirections] = useState<BreakdownItem[]>(overviewCache?.directions ?? []);
  const [heatmap, setHeatmap] = useState<PerformanceHeatmapCell[]>(overviewCache?.heatmap ?? []);
  const [instruments, setInstruments] = useState<InstrumentPerformance[]>(overviewCache?.instruments ?? []);
  const [calendar] = useState<CalendarDay[]>([]);
  const [trends, setTrends] = useState<KpiTrends | null>(overviewCache?.trends ?? null);
  const [recentTrades, setRecentTrades] = useState<RecentTrade[]>(overviewCache?.recentTrades ?? []);
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth() + 1);
  const initialDashboardLoad = useRef(false);

  const fetchAllData = useCallback(async () => {
    setDataLoading(true);
    setDataError(false);
    try {
      const response = await fetch("/api/analytics?type=overview", {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("analytics");
      const data = (await response.json()) as OverviewResponse;
      overviewCache = data;
      setKpi(data.kpi);
      setEquityCurve(data.equityCurve);
      setDirections(data.directions);
      setHeatmap(data.heatmap);
      setInstruments(data.instruments);
      setTrends(data.trends);
      setRecentTrades(data.recentTrades ?? []);
    } catch (error) {
      console.error("Failed to fetch dashboard data", error);
      setDataError(true);
    } finally {
      setDataLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth/signin");
    if (status === "authenticated" && !initialDashboardLoad.current) {
      initialDashboardLoad.current = true;
      void fetchAllData();
    }
  }, [fetchAllData, router, status]);

  const hasData = Boolean(kpi && kpi.totalTrades > 0);
  const currentPnL = kpi?.totalPnL ?? 0;
  const monthPnL = 0;
  const monthTrades = 0;
  const monthWinRate = 0;
  const longs = directions.find((item) => item.label === "LONG");
  const shorts = directions.find((item) => item.label === "SHORT");
  const totalDirectionTrades = (longs?.trades ?? 0) + (shorts?.trades ?? 0);
  const longShare = totalDirectionTrades > 0 ? ((longs?.trades ?? 0) / totalDirectionTrades) * 100 : 50;
  const strongestHeatmap = useMemo(
    () => [...heatmap].sort((a, b) => Math.abs(b.value) - Math.abs(a.value))[0],
    [heatmap]
  );
  const chartData = useMemo(
    () => equityCurve.length > 0
      ? [{ date: t("overview.start"), cumulativePnL: 0, pnl: 0 }, ...equityCurve]
      : [],
    [equityCurve, t]
  );

  const reviewState = useMemo(() => {
    const closed = kpi?.closedTrades ?? 0;
    if (closed < 10) {
      return {
        tone: "#FFB84D",
        label: t("review.sampleLabel"),
        title: t("review.sampleTitle"),
        detail: t("review.sampleDetail"),
      };
    }
    if ((kpi?.consecutiveLosses ?? 0) >= 3) {
      return {
        tone: "#FF4D64",
        label: t("review.riskLabel"),
        title: t("review.lossTitle"),
        detail: t("review.lossDetail"),
      };
    }
    if ((kpi?.winRate ?? 100) < 40) {
      return {
        tone: "#D65CFF",
        label: t("review.patternLabel"),
        title: t("review.winRateTitle"),
        detail: t("review.winRateDetail"),
      };
    }
    return {
      tone: "#20D785",
      label: t("review.reviewLabel"),
      title: t("review.stableTitle"),
      detail: t("review.stableDetail"),
    };
  }, [kpi, t]);

  const daysInMonth = new Date(calYear, calMonth, 0).getDate();
  const firstDayOfWeek = new Date(calYear, calMonth - 1, 1).getDay();

  const previousMonth = () => {
    setCalMonth((month) => {
      if (month === 1) {
        setCalYear((year) => year - 1);
        return 12;
      }
      return month - 1;
    });
  };

  const nextMonth = () => {
    setCalMonth((month) => {
      if (month === 12) {
        setCalYear((year) => year + 1);
        return 1;
      }
      return month + 1;
    });
  };

  const retryAll = () => {
    void fetchAllData();
  };

  if (status === "loading") {
    return (
      <div className="flex h-screen items-center justify-center bg-[#03050A]">
        <Loader2 className="h-9 w-9 animate-spin text-[#16D9FF]" aria-label={t("common.loading")} />
      </div>
    );
  }

  return (
    <div className="page-container">
          <motion.header
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col justify-between gap-5 md:flex-row md:items-start"
          >
            <div>
              <p className="mb-2 text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#16D9FF]">
                TRADE//OS · {t("common.productCategory")}
              </p>
              <h1 className="text-[31px] font-extrabold tracking-[-0.025em] text-white">{t("overview.title")}</h1>
              <p className="mt-2 text-[13px] text-[#718094]">{t("overview.subtitle")}</p>
            </div>
            <Link href="/import">
              <Button className="h-10 gap-2 rounded-md border border-[#4D82FF]/65 bg-gradient-to-b from-[#356FFF] to-[#2459D8] px-4 text-[12px] font-extrabold text-white shadow-[0_8px_24px_rgba(47,107,255,0.18)] transition hover:-translate-y-px hover:shadow-[0_10px_28px_rgba(47,107,255,0.28)]">
                <Plus className="h-4 w-4" /> {t("empty.importCta")}
              </Button>
            </Link>
          </motion.header>

          {dataLoading && !kpi ? (
            <div className="data-surface flex min-h-[430px] items-center justify-center">
              <div className="text-center">
                <Loader2 className="mx-auto h-9 w-9 animate-spin text-[#16D9FF]" />
                <p className="mt-4 text-[13px] text-[#718094]">{t("common.loading")}</p>
              </div>
            </div>
          ) : dataError && !kpi ? (
            <div className="data-surface flex min-h-[360px] flex-col items-center justify-center px-6 text-center">
              <AlertTriangle className="h-9 w-9 text-[#FF4D64]" />
              <h2 className="mt-4 text-xl font-extrabold">{t("error.failed")}</h2>
              <p className="mt-2 max-w-md text-[13px] text-[#718094]">{t("overview.errorDesc")}</p>
              <Button onClick={retryAll} variant="outline" className="mt-5 gap-2 border-white/10 bg-transparent text-white hover:border-[#16D9FF]/40 hover:bg-[#16D9FF]/5">
                <RefreshCw className="h-4 w-4" /> {t("common.retry")}
              </Button>
            </div>
          ) : !hasData ? (
            <div className="data-surface flex min-h-[430px] flex-col items-center justify-center px-6 text-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-xl border border-[#16D9FF]/20 bg-[#16D9FF]/5 text-[#16D9FF] shadow-[0_0_24px_rgba(22,217,255,0.1)]">
                <LayoutDashboard className="h-7 w-7" />
              </span>
              <h2 className="mt-6 text-2xl font-extrabold">{t("empty.noTrades")}</h2>
              <p className="mt-3 max-w-lg text-[13px] leading-6 text-[#718094]">{t("empty.noTradesDesc")}</p>
              <Link href="/import" className="mt-6 text-[12px] font-extrabold text-[#16D9FF] hover:text-white">
                {t("empty.importCta")} <ArrowRight className="ml-1 inline h-4 w-4" />
              </Link>
            </div>
          ) : (
            <>
              {dataError && (
                <div className="flex items-center justify-between gap-4 rounded-md border border-[#FFB84D]/20 bg-[#FFB84D]/5 px-4 py-3 text-[12px] text-[#FFB84D]" role="status">
                  <span className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    {t("overview.partialData")}
                  </span>
                  <button type="button" onClick={retryAll} className="font-extrabold text-white hover:text-[#FFB84D] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFB84D]">
                    {t("common.retry")}
                  </button>
                </div>
              )}
              <section className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1.65fr)_minmax(290px,0.72fr)]">
                <div className="panel-surface overflow-hidden p-5">
                  <div className="flex flex-col justify-between gap-5 px-1 sm:flex-row sm:items-start">
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-[16px] font-extrabold">{t("overview.cumulativePnl")}</h2>
                        <MetricInfo
                          label={t("info.aboutCumulative")}
                          title={t("overview.cumulativePnl")}
                          purpose={t("info.cumulativePurpose")}
                          formula={t("info.cumulativeFormula")}
                          requirement={t("info.cumulativeRequirement")}
                        />
                        <span className="text-[10px] font-bold text-[#FFB84D]">{t("common.feesExcluded")}</span>
                      </div>
                      <p className="mt-2 text-[12px] text-[#718094]">{t("overview.cumulativeCaption")}</p>
                      <strong className={cn("mt-3 block font-data text-[48px] font-extrabold tracking-[-0.05em]", currentPnL >= 0 ? "text-[#20D785]" : "text-[#FF4D64]")}>
                        {formatUSD(currentPnL)}
                      </strong>
                    </div>
                    <div className="text-left sm:text-right">
                      <p className="text-[11px] font-bold text-[#59697C]">
                        {kpi?.closedTrades} {t("overview.closed")} · {kpi?.openTrades} {t("overview.open")}
                      </p>
                      <p className="mt-1 text-[10px] text-[#59697C]">
                        {t("overview.recordedFees")}: {formatUSD(-(kpi?.totalFees ?? 0), false)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-2 h-[200px]">
                    {chartData.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData} margin={{ top: 12, right: 8, left: 4, bottom: 0 }}>
                          <defs>
                            <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#2F6BFF" stopOpacity={0.3} />
                              <stop offset="100%" stopColor="#2F6BFF" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <XAxis
                            dataKey="date"
                            axisLine={false}
                            tickLine={false}
                            minTickGap={34}
                            tick={{ fontSize: 10, fill: "#59697C" }}
                            tickFormatter={(value: string) => value.includes("-") ? value.split("-").slice(1).join("/") : value}
                          />
                          <YAxis
                            axisLine={false}
                            tickLine={false}
                            width={62}
                            tick={{ fontSize: 10, fill: "#59697C" }}
                            tickFormatter={(value: number) => formatUSD(value, false)}
                          />
                          <ReferenceLine y={0} stroke="#9AA8B8" strokeOpacity={0.22} strokeDasharray="4 4" />
                          <Tooltip
                            cursor={{ stroke: "#16D9FF", strokeOpacity: 0.35, strokeDasharray: "3 3" }}
                            content={({ active, payload }) => {
                              if (!active || !payload?.length) return null;
                              const point = payload[0].payload as CumulativePnLPoint;
                              return (
                                <div className="rounded-md border border-[#16D9FF]/25 bg-[#070A10]/95 p-3 text-[12px] shadow-[0_0_22px_rgba(22,217,255,0.12)] backdrop-blur-xl">
                                  <p className="font-bold text-[#9AA8B8]">{point.date}</p>
                                  <p className="mt-1"><span className="text-[#718094]">{t("overview.tradePnl")} </span><strong className={point.pnl >= 0 ? "text-[#20D785]" : "text-[#FF4D64]"}>{formatUSD(point.pnl)}</strong></p>
                                  <p><span className="text-[#718094]">{t("overview.cumulativePnl")} </span><strong className={point.cumulativePnL >= 0 ? "text-[#20D785]" : "text-[#FF4D64]"}>{formatUSD(point.cumulativePnL)}</strong></p>
                                </div>
                              );
                            }}
                          />
                          <Area
                            type="monotone"
                            dataKey="cumulativePnL"
                            stroke="#2F6BFF"
                            strokeWidth={2.5}
                            fill="url(#equityFill)"
                            activeDot={{ r: 5, fill: "#16D9FF", stroke: "#03050A", strokeWidth: 2 }}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex h-full items-center justify-center border-y border-[#9AA8B8]/8">
                        <div className="text-center">
                          <AlertTriangle className="mx-auto h-5 w-5 text-[#FFB84D]" />
                          <p className="mt-2 text-[13px] font-bold text-[#FFB84D]">{t("overview.pnlIncomplete")}</p>
                          <p className="mt-1 text-[11px] text-[#718094]">{t("overview.pnlIncompleteDesc")}</p>
                        </div>
                      </div>
                    )}
                  </div>

                  <p className="mt-2 rounded-md border border-[#9AA8B8]/10 bg-black/15 px-3 py-2 text-right text-[12px] font-semibold text-[#7E8C9D]">
                    {t("overview.trendBasis")}
                  </p>
                  <div className="grid grid-cols-2 border-t border-[#9AA8B8]/10 md:grid-cols-5">
                    <KpiRailItem
                      label={t("overview.winRate")}
                      value={kpi?.winRate === null ? "—" : `${kpi?.winRate ?? 0}%`}
                      colour={(kpi?.winRate ?? 100) < 30 ? "text-[#FF4D64]" : "text-white"}
                      trend={trends?.winRate}
                      attention={(kpi?.winRate ?? 100) < 30}
                      help={{ label: t("info.aboutWinRate"), purpose: t("info.winRatePurpose"), formula: t("info.winRateFormula"), requirement: t("info.closedTradesRequirement") }}
                    />
                    <KpiRailItem
                      label={t("overview.profitFactor")}
                      value={kpi?.profitFactor === null ? "—" : (kpi?.profitFactor ?? 0).toFixed(2)}
                      colour={(kpi?.profitFactor ?? 1) < 1 ? "text-[#FFB84D]" : "text-[#20D785]"}
                      trend={trends?.profitFactor}
                      help={{ label: t("info.aboutProfitFactor"), purpose: t("info.profitFactorPurpose"), formula: t("info.profitFactorFormula"), requirement: t("info.pnlRequirement") }}
                    />
                    <KpiRailItem
                      label={t("overview.avgRR")}
                      value={kpi?.avgRR === null ? "—" : `${(kpi?.avgRR ?? 0).toFixed(2)}R`}
                      colour={(kpi?.avgRR ?? 1) < 1 ? "text-[#FFB84D]" : "text-white"}
                      trend={trends?.avgRR}
                      help={{ label: t("info.aboutAvgRR"), purpose: t("info.avgRRPurpose"), formula: t("info.avgRRFormula"), requirement: t("info.rrRequirement") }}
                    />
                    <KpiRailItem
                      label={t("overview.expectancy")}
                      value={kpi?.expectancy === null ? "—" : `${(kpi?.expectancy ?? 0).toFixed(2)}R`}
                      colour={(kpi?.expectancy ?? 0) >= 0 ? "text-[#20D785]" : "text-[#FF4D64]"}
                      trend={trends?.expectancy}
                      help={{ label: t("info.aboutExpectancy"), purpose: t("info.expectancyPurpose"), formula: t("info.expectancyFormula"), requirement: t("info.pnlRequirement") }}
                    />
                    <KpiRailItem
                      label={t("overview.maxDrawdown")}
                      value={kpi?.maxDrawdownPercent === null ? "—" : `${kpi?.maxDrawdownPercent.toFixed(1)}%`}
                      colour={kpi?.maxDrawdownPercent === null ? "text-[#59697C]" : "text-[#FF4D64]"}
                      trend={trends?.maxDrawdown}
                      higherIsBetter={false}
                      help={{ label: t("info.aboutDrawdown"), purpose: t("info.drawdownPurpose"), formula: t("info.drawdownFormula"), requirement: t("info.drawdownRequirement") }}
                    />
                  </div>
                </div>

                <aside className="panel-surface relative p-5">
                  <div className="flex items-center gap-2">
                    <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#D65CFF]">{t("review.nextAction")}</p>
                    <MetricInfo
                      label={t("info.aboutReview")}
                      title={t("review.nextAction")}
                      purpose={t("info.reviewPurpose")}
                      formula={t("info.reviewFormula")}
                      requirement={t("info.reviewRequirement")}
                    />
                  </div>
                  <h2 className="mt-2 text-[20px] font-extrabold">{t("review.oneThing")}</h2>
                  <p className="mt-2 text-[12px] leading-5 text-[#718094]">{t("review.caption")}</p>

                  <div className="my-5 border-y border-[#9AA8B8]/10 py-4">
                    <span className="text-[10px] font-extrabold uppercase tracking-[0.12em]" style={{ color: reviewState.tone }}>
                      {reviewState.label}
                    </span>
                    <strong className="mt-2 block text-[16px] leading-6 text-white">{reviewState.title}</strong>
                    <p className="mt-2 text-[12px] leading-5 text-[#758396]">{reviewState.detail}</p>
                  </div>

                  <div className="grid gap-3">
                    <EvidenceBar
                      label={t("review.sampleSize")}
                      value={`${kpi?.closedTrades ?? 0}`}
                      width={Math.min(100, ((kpi?.closedTrades ?? 0) / 20) * 100)}
                      colour={(kpi?.closedTrades ?? 0) >= 20 ? "#20D785" : "#FFB84D"}
                    />
                    <EvidenceBar
                      label={t("overview.winRate")}
                      value={kpi?.winRate === null ? "—" : `${kpi?.winRate ?? 0}%`}
                      width={kpi?.winRate ?? 0}
                      colour="#16D9FF"
                    />
                    <EvidenceBar
                      label={t("review.lossStreak")}
                      value={`${kpi?.consecutiveLosses ?? 0}`}
                      width={Math.min(100, (kpi?.consecutiveLosses ?? 0) * 15)}
                      colour={(kpi?.consecutiveLosses ?? 0) >= 3 ? "#FF4D64" : "#D65CFF"}
                    />
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-4 border-t border-[#9AA8B8]/10 pt-4">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#59697C]">{t("overview.bestTrade")}</span>
                      <strong className="mt-1 block text-[16px] text-[#20D785]">{kpi?.bestTrade == null ? "—" : formatUSD(kpi.bestTrade)}</strong>
                    </div>
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#59697C]">{t("overview.worstTrade")}</span>
                      <strong className="mt-1 block text-[16px] text-[#FF4D64]">{kpi?.worstTrade == null ? "—" : formatUSD(kpi.worstTrade)}</strong>
                    </div>
                  </div>

                  <Link href="/analytics" className="mt-5 inline-flex items-center gap-2 text-[12px] font-extrabold text-[#D65CFF] transition hover:drop-shadow-[0_0_8px_rgba(214,92,255,0.45)]">
                    {t("review.openAnalytics")} <ArrowRight className="h-4 w-4" />
                  </Link>
                </aside>
              </section>

              <section className="mt-8 grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1.12fr)_minmax(360px,0.88fr)]">
                <div className="panel-surface p-5">
                  <div className="mb-5 flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-[16px] font-extrabold">{t("overview.comparisonEvidence")}</h2>
                      <p className="mt-1 text-[12px] text-[#718094]">{t("overview.comparisonCaption")}</p>
                    </div>
                    <MetricInfo
                      label={t("info.aboutDirection")}
                      title={t("overview.directionBias")}
                      purpose={t("info.directionPurpose")}
                      formula={t("info.directionFormula")}
                      requirement={t("info.directionRequirement")}
                    />
                  </div>

                  <div className="grid gap-x-7 md:grid-cols-2">
                    {[longs, shorts].map((direction, index) => {
                      const isLong = index === 0;
                      const tone = isLong ? "#2F6BFF" : "#D65CFF";
                      return (
                        <div key={isLong ? "long" : "short"} className="border-b border-[#9AA8B8]/8 py-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <span className="text-[11px] font-extrabold uppercase tracking-[0.08em]" style={{ color: tone }}>
                                {isLong ? t("common.longTrades") : t("common.shortTrades")}
                              </span>
                              <p className="mt-1 text-[12px] text-[#718094]">{direction?.trades ?? 0} {t("kpi.sample")} · {t("overview.winRate")} {direction?.winRate ?? 0}%</p>
                            </div>
                            <strong className={cn("text-[18px]", (direction?.totalPnL ?? 0) >= 0 ? "text-[#20D785]" : "text-[#FF4D64]")}>
                              {formatUSD(direction?.totalPnL ?? 0)}
                            </strong>
                          </div>
                          <div className="mt-4 h-1 overflow-hidden rounded-full bg-white/5">
                            <div className="h-full rounded-full" style={{ width: `${isLong ? longShare : 100 - longShare}%`, backgroundColor: tone }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-5 flex flex-col justify-between gap-4 border-t border-[#9AA8B8]/8 pt-5 sm:flex-row sm:items-center">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#59697C]">{t("overview.strongestWindow")}</span>
                      <p className="mt-1 text-[13px] font-bold text-white">
                        {strongestHeatmap
                          ? `${t(DAY_KEYS[strongestHeatmap.day])} · ${String(strongestHeatmap.hour).padStart(2, "0")}:00`
                          : t("overview.insufficientSample")}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-[12px] text-[#718094]">
                      <Clock3 className="h-4 w-4 text-[#16D9FF]" />
                      {strongestHeatmap
                        ? `${strongestHeatmap.trades} ${t("kpi.sample")} · ${formatUSD(strongestHeatmap.value)}`
                        : t("overview.keepLogging")}
                    </div>
                  </div>
                </div>

                <div className="panel-surface p-5">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-[16px] font-extrabold">{t("overview.recentTrades")}</h2>
                      <p className="mt-1 text-[12px] text-[#718094]">{t("overview.recentTradesCaption")}</p>
                    </div>
                    <MetricInfo
                      label={t("info.aboutRecent")}
                      title={t("overview.recentTrades")}
                      purpose={t("info.recentPurpose")}
                      formula={t("info.recentFormula")}
                      requirement={t("info.recentRequirement")}
                    />
                  </div>

                  <div className="divide-y divide-[#9AA8B8]/8">
                    {recentTrades.map((trade) => (
                      <Link key={trade.id} href="/trades" className="grid grid-cols-[84px_1fr_auto] items-center gap-3 py-3 text-[12px] transition hover:bg-white/[0.025] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#16D9FF]">
                        <span className="text-[10px] font-bold uppercase text-[#59697C]">
                          {new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short" }).format(new Date(trade.tradedAt))}
                        </span>
                        <span className="min-w-0">
                          <strong className="block truncate text-[12px] text-[#D8E0E9]">
                            {trade.symbol} · {trade.setup ?? trade.strategy ?? (trade.direction === "LONG" ? t("common.longTrades") : t("common.shortTrades"))}
                          </strong>
                          <span className="mt-0.5 block text-[10px] text-[#59697C]">{trade.status === "CLOSED" ? t("overview.closed") : t("overview.open")}</span>
                        </span>
                        <strong className={cn("font-data text-[12px]", trade.pnl == null ? "text-[#59697C]" : trade.pnl >= 0 ? "text-[#20D785]" : "text-[#FF4D64]")}>
                          {trade.pnl == null ? "—" : formatUSD(trade.pnl)}
                        </strong>
                      </Link>
                    ))}
                    {recentTrades.length === 0 && <p className="py-8 text-center text-[12px] text-[#718094]">{t("empty.noTrades")}</p>}
                  </div>

                  <Link href="/trades" className="mt-4 inline-flex items-center gap-2 text-[11px] font-extrabold text-[#16D9FF] hover:text-white">
                    {t("overview.viewJournal")} <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </section>

              <section className="panel-surface mt-8 p-5 sm:p-6">
                <PerformanceHeatmap cells={heatmap} instruments={instruments} />
              </section>

              {false && (
              <section className="hidden" aria-hidden="true">
                <div className="mb-5 flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-[16px] font-extrabold">{t("overview.calendar")}</h2>
                      <MetricInfo
                        label={t("info.aboutCalendar")}
                        title={t("overview.calendar")}
                        purpose={t("info.calendarPurpose")}
                        formula={t("info.calendarFormula")}
                        requirement={t("info.calendarRequirement")}
                      />
                    </div>
                    <p className="mt-1 text-[12px] text-[#718094]">{t("overview.calendarCaption")}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={previousMonth} aria-label={t("calendar.previousMonth")} className="flex h-9 w-9 items-center justify-center rounded-md border border-white/8 text-[#718094] transition hover:border-[#16D9FF]/35 hover:text-[#16D9FF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16D9FF]">
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <div className="min-w-[92px] text-center text-[12px] font-extrabold text-white">{calYear}-{String(calMonth).padStart(2, "0")}</div>
                    <button type="button" onClick={nextMonth} aria-label={t("calendar.nextMonth")} className="flex h-9 w-9 items-center justify-center rounded-md border border-white/8 text-[#718094] transition hover:border-[#16D9FF]/35 hover:text-[#16D9FF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16D9FF]">
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_270px]">
                  <div className="grid grid-cols-7 gap-1.5">
                    {DAY_KEYS.map((dayKey) => <div key={dayKey} className="pb-2 text-center text-[10px] font-extrabold uppercase text-[#59697C]">{t(dayKey).slice(0, 1)}</div>)}
                    {Array.from({ length: firstDayOfWeek }).map((_, index) => <div key={`empty-${index}`} />)}
                    {Array.from({ length: daysInMonth }, (_, index) => index + 1).map((day) => {
                      const date = `${calYear}-${String(calMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                      const record = calendar.find((item) => item.date === date);
                      return (
                        <div
                          key={day}
                          title={record ? `${record.trades} ${t("kpi.sample")} · ${formatUSD(record.pnl)}` : undefined}
                          className={cn(
                            "flex min-h-10 items-center justify-center rounded text-[11px] font-extrabold",
                            !record && "bg-white/[0.02] text-[#435164]",
                            record && record.pnl >= 0 && "border border-[#20D785]/20 bg-[#20D785]/8 text-[#20D785]",
                            record && record.pnl < 0 && "border border-[#FF4D64]/20 bg-[#FF4D64]/8 text-[#FF4D64]"
                          )}
                        >
                          {day}
                        </div>
                      );
                    })}
                  </div>

                  <div className="border-l border-[#9AA8B8]/10 pl-6">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#16D9FF]/15 bg-[#16D9FF]/5 text-[#16D9FF]">
                      <CalendarDays className="h-5 w-5" />
                    </div>
                    <p className="mt-5 text-[10px] font-extrabold uppercase tracking-[0.1em] text-[#59697C]">{t("overview.monthlyPnl")}</p>
                    <strong className={cn("mt-1 block text-[27px] font-extrabold", monthPnL >= 0 ? "text-[#20D785]" : "text-[#FF4D64]")}>{formatUSD(monthPnL)}</strong>
                    <div className="mt-5 grid grid-cols-2 gap-4 border-t border-[#9AA8B8]/10 pt-4">
                      <div>
                        <span className="text-[10px] text-[#59697C]">{t("common.total")}</span>
                        <strong className="mt-1 block text-[16px]">{monthTrades}</strong>
                      </div>
                      <div>
                        <span className="text-[10px] text-[#59697C]">{t("overview.winRate")}</span>
                        <strong className="mt-1 block text-[16px] text-[#16D9FF]">{monthWinRate.toFixed(1)}%</strong>
                      </div>
                    </div>
                    <p className="mt-5 text-[11px] leading-5 text-[#718094]">
                      {t("empty.noInsights")}
                    </p>
                  </div>
                </div>
              </section>
              )}
            </>
          )}
    </div>
  );
}
