"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import {
  TrendingUp,
  Scan,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  BarChart3,
  Calendar,
  Activity,
  History,
  LayoutDashboard,
  Filter,
  Loader2,
  Plus,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { cn } from "@/lib/utils";

/* ──────────────────────────────
   Types
   ────────────────────────────── */

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
  maxDrawdownPercent: number;
  bestTrade: number | null;
  worstTrade: number | null;
  consecutiveWins: number;
  consecutiveLosses: number;
}

interface EquityPoint {
  date: string;
  equity: number;
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

interface HeatmapCell {
  hour: number;
  day: number;
  value: number;
  trades: number;
}

interface CalendarDay {
  date: string;
  pnl: number;
  trades: number;
  wins: number;
  losses: number;
}

/* ──────────────────────────────
   Components
   ────────────────────────────── */

function KPIPlayerCard({
  label,
  value,
  subValue,
  trend,
  colorClass = "text-white",
}: {
  label: string;
  value: string;
  subValue?: string;
  trend?: "up" | "down";
  colorClass?: string;
}) {
  return (
    <div className="fifa-card p-5 group relative overflow-hidden">
      <div className="absolute top-0 right-0 p-2 opacity-5 group-hover:opacity-10 transition-opacity">
        <TrendingUp className="h-12 w-12" />
      </div>
      <span className="label-sports mb-1 block">{label}</span>
      <div className="flex items-baseline gap-2">
        <span className={cn("text-2xl font-black heading-sports font-data", colorClass)}>{value}</span>
        {trend && (
          <span className={cn(
            "text-[10px] font-bold px-1.5 py-0.5 rounded-full flex items-center",
            trend === "up" ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"
          )}>
            {trend === "up" ? <ArrowUpRight className="h-3 w-3 mr-0.5" /> : <ArrowDownRight className="h-3 w-3 mr-0.5" />}
            {trend === "up" ? "High" : "Low"}
          </span>
        )}
      </div>
      {subValue && <span className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-wider">{subValue}</span>}
    </div>
  );
}

/* ──────────────────────────────
   Helpers
   ────────────────────────────── */

function formatUSD(n: number): string {
  const abs = Math.abs(n);
  const sign = n >= 0 ? "+" : "-";
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(2)}`;
}

function formatR(n: number | null): string {
  if (n === null) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}R`;
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/* ──────────────────────────────
   Main Page
   ────────────────────────────── */

export default function OverviewPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(true);

  // Fetched data
  const [kpi, setKpi] = useState<KPIData | null>(null);
  const [equityCurve, setEquityCurve] = useState<EquityPoint[]>([]);
  const [directions, setDirections] = useState<BreakdownItem[]>([]);
  const [heatmap, setHeatmap] = useState<HeatmapCell[]>([]);
  const [calendar, setCalendar] = useState<CalendarDay[]>([]);

  // Calendar nav
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth() + 1);

  const fetchAllData = useCallback(async () => {
    setDataLoading(true);
    try {
      const [kpiRes, equityRes, dirRes, heatRes] = await Promise.all([
        fetch("/api/analytics?type=kpi"),
        fetch("/api/analytics?type=equity&granularity=day"),
        fetch("/api/analytics?type=directions"),
        fetch("/api/analytics?type=heatmap"),
      ]);

      if (kpiRes.ok) setKpi(await kpiRes.json());
      if (equityRes.ok) setEquityCurve(await equityRes.json());
      if (dirRes.ok) setDirections(await dirRes.json());
      if (heatRes.ok) setHeatmap(await heatRes.json());

      fetchCalendar(calYear, calMonth);
    } catch (err) {
      console.error("Failed to fetch analytics data", err);
    } finally {
      setDataLoading(false);
    }
  }, [calYear, calMonth]);

  const fetchCalendar = useCallback(async (year: number, month: number) => {
    try {
      const calRes = await fetch(`/api/analytics?type=calendar&year=${year}&month=${month}`);
      if (calRes.ok) setCalendar(await calRes.json());
    } catch {}
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth/signin");
    if (status === "authenticated") {
      fetchAllData();
      setTimeout(() => setLoading(false), 300);
    }
  }, [status, router, fetchAllData]);

  if (status === "loading" || loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0F0F1A]">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-[#2563EB] border-t-transparent glow-primary" />
      </div>
    );
  }

  const hasData = kpi && kpi.totalTrades > 0;
  const currentPnL = kpi?.totalPnL ?? 0;

  // Monthly stats
  const monthPnL = calendar.reduce((sum, d) => sum + d.pnl, 0);
  const monthTrades = calendar.reduce((sum, d) => sum + d.trades, 0);
  const monthWinRate = monthTrades > 0 ? (calendar.reduce((sum, d) => sum + d.wins, 0) / monthTrades) * 100 : 0;

  // Direction stats
  const longs = directions.find((d) => d.label === "LONG");
  const shorts = directions.find((d) => d.label === "SHORT");
  const longTotalPnL = longs?.totalPnL ?? 0;
  const shortTotalPnL = shorts?.totalPnL ?? 0;
  const totalPnLAbs = Math.abs(longTotalPnL) + Math.abs(shortTotalPnL) || 1;
  const longPct = Math.max(10, Math.min(90, Math.round((Math.abs(longTotalPnL) / totalPnLAbs) * 100)));
  const shortPct = 100 - longPct;

  // Heatmap
  const heatmapValue = (hour: number, day: number) => heatmap.find((h) => h.hour === hour && h.day === day)?.value ?? 0;
  const heatmapColor = (val: number) => {
    if (val > 1) return "bg-[#22C55E]";
    if (val > 0) return "bg-[#22C55E]/40";
    if (val < -1) return "bg-[#EF4444]";
    if (val < 0) return "bg-[#EF4444]/40";
    return "bg-white/5";
  };

  // Calendar
  const daysInMonth = new Date(calYear, calMonth, 0).getDate();
  const firstDayOfWeek = new Date(calYear, calMonth - 1, 1).getDay();
  const calendarDays = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  return (
    <div className="page-container">
      {/* Broadcast Header */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div className="flex items-center gap-6">
          <div className="h-14 w-14 rounded-2xl brand-gradient flex items-center justify-center glow-primary">
            <LayoutDashboard className="h-8 w-8 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-black heading-sports">
              Performance <span className="brand-gradient-text">Command Center</span>
            </h1>
            <p className="label-sports mt-1">Season 2026 &middot; Live Data Feed</p>
          </div>
        </div>
        
        <div className="hidden md:flex items-center gap-3">
          <Link href="/import">
            <Button size="lg" className="brand-gradient text-white font-black uppercase glow-primary gap-2">
              <Plus className="h-5 w-5" /> Import Feed
            </Button>
          </Link>
        </div>
      </motion.div>

      {dataLoading && !hasData ? (
        <div className="flex items-center justify-center py-32">
          <Loader2 className="h-10 w-10 animate-spin text-[#2563EB]" />
        </div>
      ) : !hasData ? (
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="fifa-card p-20 flex flex-col items-center justify-center text-center gap-8"
        >
          <div className="h-24 w-24 rounded-3xl bg-white/5 flex items-center justify-center border border-white/10 glow-primary">
            <TrendingUp className="h-12 w-12 text-[#2563EB]" />
          </div>
          <div className="max-w-md space-y-4">
            <h2 className="text-4xl font-black heading-sports">Awaiting <span className="text-[#06B6D4]">Kickoff</span></h2>
            <p className="text-muted-foreground font-medium">Your intelligence journal is empty. Sync your broker data or upload trade screenshots to start the broadcast.</p>
          </div>
          <Link href="/import">
            <Button size="lg" className="brand-gradient text-white px-10 py-7 text-lg font-black uppercase glow-primary gap-3">
              <Plus className="h-6 w-6" /> Sync First Data
            </Button>
          </Link>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Main Stage */}
          <div className="lg:col-span-8 space-y-8">
            {/* Top Scoreboard */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <motion.div 
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="fifa-card p-8 flex flex-col justify-center relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 p-4 opacity-10">
                  <Activity className="h-20 w-20 text-[#2563EB]" />
                </div>
                <span className="label-sports mb-2">Total Season P&L</span>
                <div className="flex items-baseline gap-2">
                  <span className={cn(
                    "text-6xl font-black heading-sports tracking-tighter font-data",
                    currentPnL >= 0 ? "text-[#22C55E]" : "text-[#EF4444]"
                  )}>
                    {formatUSD(currentPnL)}
                  </span>
                </div>
                <div className="flex items-center gap-4 mt-6">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black uppercase text-muted-foreground/40">Closed</span>
                    <span className="text-lg font-black heading-sports font-data">{kpi?.closedTrades}</span>
                  </div>
                  <div className="w-px h-8 bg-white/5" />
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black uppercase text-muted-foreground/40">Active</span>
                    <span className="text-lg font-black heading-sports text-[#06B6D4] font-data">{kpi?.openTrades}</span>
                  </div>
                </div>
              </motion.div>

              <motion.div 
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="fifa-card p-6 min-h-[220px]"
              >
                <div className="flex items-center justify-between mb-4">
                  <span className="label-sports">Equity Curve</span>
                  <div className="flex gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-[#2563EB] animate-pulse" />
                    <span className="text-[8px] font-black uppercase tracking-widest text-[#2563EB]">Live Chart</span>
                  </div>
                </div>
                <div className="h-32">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={equityCurve}>
                      <defs>
                        <linearGradient id="colorEquity" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#2563EB" stopOpacity={0.4}/>
                          <stop offset="95%" stopColor="#2563EB" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <Area type="monotone" dataKey="equity" stroke="#2563EB" strokeWidth={3} fillOpacity={1} fill="url(#colorEquity)" dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-4 flex justify-between items-center text-[10px] font-bold uppercase text-muted-foreground/40">
                  <span>Start Season</span>
                  <span>Present Day</span>
                </div>
              </motion.div>
            </div>

            {/* Player Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
              <KPIPlayerCard label="Win Rate" value={kpi?.winRate ? `${kpi.winRate}%` : "—"} trend={kpi?.winRate && kpi.winRate > 50 ? "up" : "down"} />
              <KPIPlayerCard label="Profit Factor" value={kpi?.profitFactor?.toFixed(2) ?? "—"} colorClass="text-[#06B6D4]" />
              <KPIPlayerCard label="Avg R:R" value={kpi?.avgRR?.toFixed(2) ?? "—"} />
              <KPIPlayerCard label="Expectancy" value={kpi?.expectancy ? `${kpi.expectancy.toFixed(2)}R` : "—"} colorClass={currentPnL >= 0 ? "text-[#22C55E]" : "text-[#EF4444]"} />
              <KPIPlayerCard label="Max Drawdown" value={kpi?.maxDrawdownPercent ? `${kpi.maxDrawdownPercent.toFixed(1)}%` : "—"} colorClass="text-[#EF4444]" />
            </div>

            {/* Technical Analysis Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
              {/* Long vs Short Broadcast */}
              <div className="fifa-card p-6 space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="heading-sports text-sm">Squad Balance</h3>
                  <Filter className="h-3 w-3 text-muted-foreground/30" />
                </div>
                <div className="flex justify-between items-center px-2">
                  <div className="text-center">
                    <span className="label-sports text-[#2563EB]">Longs</span>
                    <p className="text-xl font-black heading-sports mt-1 font-data">{formatUSD(longTotalPnL)}</p>
                  </div>
                  <div className="h-10 w-10 rounded-full border border-white/5 flex items-center justify-center">
                    <span className="text-[10px] font-black opacity-20">VS</span>
                  </div>
                  <div className="text-center">
                    <span className="label-sports text-[#EC4899]">Shorts</span>
                    <p className="text-xl font-black heading-sports mt-1 font-data">{formatUSD(shortTotalPnL)}</p>
                  </div>
                </div>
                <div className="relative h-6 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${longPct}%` }}
                    className="absolute inset-y-0 left-0 bg-[#2563EB] glow-primary z-10"
                  />
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${shortPct}%` }}
                    className="absolute inset-y-0 right-0 bg-[#EC4899] z-10" 
                  />
                </div>
                <div className="grid grid-cols-2 gap-4 pt-2">
                  <div className="space-y-1">
                    <div className="flex justify-between text-[9px] font-black uppercase"><span className="text-muted-foreground/40">Win Rate</span><span className="text-[#2563EB]">{longs?.winRate ?? 0}%</span></div>
                    <div className="flex justify-between text-[9px] font-black uppercase"><span className="text-muted-foreground/40">Total</span><span>{longs?.trades ?? 0}</span></div>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-[9px] font-black uppercase"><span className="text-muted-foreground/40">Win Rate</span><span className="text-[#EC4899]">{shorts?.winRate ?? 0}%</span></div>
                    <div className="flex justify-between text-[9px] font-black uppercase"><span className="text-muted-foreground/40">Total</span><span>{shorts?.trades ?? 0}</span></div>
                  </div>
                </div>
              </div>

              {/* Training Heatmap */}
              <div className="fifa-card p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="heading-sports text-sm">Session Intensity</h3>
                  <Badge variant="outline" className="text-[8px] font-black uppercase border-white/5 bg-white/5">H &times; W</Badge>
                </div>
                <div className="grid grid-cols-8 gap-1.5">
                  <div />
                  {DAY_LABELS.map((d) => (
                    <div key={d} className="text-[7px] font-black text-muted-foreground/30 text-center uppercase">{d[0]}</div>
                  ))}
                  {Array.from({ length: 8 }).map((_, r) => (
                    <div key={`row-${r}`} className="contents">
                      <div className="text-[7px] font-black text-muted-foreground/20 py-0.5">{String(r * 3).padStart(2, '0')}</div>
                      {Array.from({ length: 7 }).map((_, c) => {
                        const val = heatmapValue(r * 3, c);
                        return (
                          <div
                            key={`cell-${r}-${c}`}
                            className={cn(
                              "w-full aspect-square rounded-[3px] transition-all hover:scale-125 hover:z-20",
                              heatmapColor(val)
                            )}
                            title={`${DAY_LABELS[c]} ${r * 3}:00 — ${formatUSD(val)}`}
                          />
                        );
                      })}
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-center gap-4 pt-2 border-t border-white/5">
                   <div className="flex items-center gap-1.5"><div className="h-1.5 w-1.5 rounded-full bg-[#EF4444]" /><span className="text-[7px] font-black uppercase text-muted-foreground/40">Loss Zone</span></div>
                   <div className="flex items-center gap-1.5"><div className="h-1.5 w-1.5 rounded-full bg-[#22C55E]" /><span className="text-[7px] font-black uppercase text-muted-foreground/40">Profit Zone</span></div>
                </div>
              </div>

              {/* Match Calendar */}
              <div className="fifa-card p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="heading-sports text-sm">Monthly Schedule</h3>
                  <div className="flex gap-2">
                    <button onClick={() => { setCalMonth(m => m === 1 ? 12 : m - 1); if (calMonth === 1) setCalYear(y => y - 1); }} className="hover:text-[#2563EB] transition-colors"><ChevronLeft className="h-3 w-3" /></button>
                    <button onClick={() => { setCalMonth(m => m === 12 ? 1 : m + 1); if (calMonth === 12) setCalYear(y => y + 1); }} className="hover:text-[#2563EB] transition-colors"><ChevronRight className="h-3 w-3" /></button>
                  </div>
                </div>
                <div className="grid grid-cols-7 gap-1 bg-white/5 p-1 rounded-lg">
                  {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d) => <div key={d} className="text-[7px] font-black p-1 text-center opacity-20">{d[0]}</div>)}
                  {Array.from({ length: firstDayOfWeek }).map((_, i) => <div key={`empty-${i}`} />)}
                  {calendarDays.map((day) => {
                    const dateStr = `${calYear}-${String(calMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                    const dayData = calendar.find((d) => d.date === dateStr);
                    return (
                      <div key={day} className={cn(
                        "aspect-square rounded-[2px] flex items-center justify-center text-[7px] font-black",
                        dayData ? (dayData.pnl >= 0 ? "bg-[#22C55E]/10 text-[#22C55E]" : "bg-[#EF4444]/10 text-[#EF4444]") : "text-white/10"
                      )}>
                        {day}
                      </div>
                    );
                  })}
                </div>
                <div className="space-y-1.5 pt-2 border-t border-white/5">
                  <div className="flex justify-between text-[9px] font-black uppercase">
                    <span className="text-muted-foreground/40">Monthly P&L</span>
                    <span className={cn("font-data", monthPnL >= 0 ? "text-[#22C55E]" : "text-[#EF4444]")}>{formatUSD(monthPnL)}</span>
                  </div>
                  <div className="flex justify-between text-[9px] font-black uppercase">
                    <span className="text-muted-foreground/40">Win Rate</span>
                    <span>{monthWinRate.toFixed(1)}%</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar Highlights */}
          <div className="lg:col-span-4 space-y-8">
            {/* Quick Actions Card */}
            <div className="fifa-card brand-gradient p-8 text-center relative overflow-hidden group cursor-pointer shadow-2xl transition-transform hover:-translate-y-1">
              <div className="absolute inset-0 bg-black/20 group-hover:bg-transparent transition-colors" />
              <div className="relative z-10 space-y-6">
                <div className="h-20 w-20 mx-auto rounded-3xl bg-white/20 backdrop-blur-md flex items-center justify-center glow-primary">
                  <Scan className="h-10 w-10 text-white" />
                </div>
                <div>
                  <h3 className="text-2xl font-black heading-sports">Instant <span className="text-[#06B6D4]">Import</span></h3>
                  <p className="text-[10px] font-bold text-white/60 uppercase tracking-widest mt-2">CSV Feed &bull; AI Vision &bull; API Sync</p>
                </div>
                <Link href="/import" className="block">
                  <Button variant="secondary" className="w-full bg-white text-indigo-600 font-black uppercase hover:bg-white/90">
                    Enter Dashboard {'>'}
                  </Button>
                </Link>
              </div>
            </div>

            {/* Performance Highlights */}
            <div className="fifa-card p-6 space-y-6">
              <h3 className="heading-sports text-sm">Season Highlights</h3>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                    <span className="label-sports block mb-1">Best Trade</span>
                    <p className="text-lg font-black heading-sports text-[#22C55E]">{kpi?.bestTrade ? formatUSD(kpi.bestTrade) : "—"}</p>
                  </div>
                  <div className="bg-white/5 rounded-xl p-4 border border-white/5">
                    <span className="label-sports block mb-1">Worst Trade</span>
                    <p className="text-lg font-black heading-sports text-[#EF4444]">{kpi?.worstTrade ? formatUSD(kpi.worstTrade) : "—"}</p>
                  </div>
                </div>
                
                <div className="bg-white/5 rounded-xl p-4 border border-white/5 space-y-4">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                        <ArrowUpRight className="h-5 w-5" />
                      </div>
                      <span className="text-[11px] font-black uppercase">Longest Win Streak</span>
                    </div>
                    <span className="text-xl font-black heading-sports text-emerald-400 font-data">{kpi?.consecutiveWins}</span>
                  </div>
                  <div className="h-px bg-white/5" />
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg bg-red-500/10 flex items-center justify-center text-red-400">
                        <ArrowDownRight className="h-5 w-5" />
                      </div>
                      <span className="text-[11px] font-black uppercase">Longest Loss Streak</span>
                    </div>
                    <span className="text-xl font-black heading-sports text-red-400 font-data">{kpi?.consecutiveLosses}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* AI Insight Teaser */}
            <div className="fifa-card p-6 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-3">
                <BarChart3 className="h-4 w-4 text-[#06B6D4] animate-pulse" />
              </div>
              <h3 className="heading-sports text-sm flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-[#06B6D4] shadow-[0_0_8px_#06B6D4]" />
                AI Strategy Review
              </h3>
              <p className="text-[10px] font-medium text-muted-foreground/60 mt-3 leading-relaxed">
                Based on your last {kpi?.closedTrades} trades, you perform 24% better during the London Open. Strategy "Trend-Follow" has the highest R:R efficiency.
              </p>
              <Button variant="link" className="text-[10px] font-black uppercase text-[#06B6D4] p-0 h-auto mt-4 hover:no-underline hover:text-[#06B6D4]/80">
                Generate Full Weekly Report {'>'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
