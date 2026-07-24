"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import {
  BarChart3,
  TrendingUp,
  Loader2,
  ArrowUp,
  ArrowDown,
  Activity,
  Target,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  PieChart as PieChartIcon,
  Zap,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
} from "recharts";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

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

/* ──────────────────────────────
   Helpers
   ────────────────────────────── */

function formatUSD(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1000) return `${n >= 0 ? "+" : "-"}$${(abs / 1000).toFixed(1)}K`;
  return `${n >= 0 ? "+" : "-"}$${abs.toFixed(2)}`;
}

const CHART_COLORS = ["#6366F1", "#06B6D4", "#EC4899", "#F59E0B", "#8B5CF6", "#10B981"];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0F0F1A]/90 p-4 text-[10px] backdrop-blur-xl shadow-2xl">
      <p className="font-black text-white uppercase mb-2 border-b border-white/5 pb-1">{label}</p>
      {payload.map((entry: any, idx: number) => (
        <div key={idx} className="flex items-center justify-between gap-4 mt-1">
          <span className="text-muted-foreground uppercase font-bold">{entry.name}:</span>
          <span style={{ color: entry.color }} className="font-black">
            {entry.name?.includes("P&L") || entry.name?.includes("PnL") || entry.name === "Equity"
              ? formatUSD(entry.value)
              : typeof entry.value === "number"
                ? entry.value.toFixed(2)
                : entry.value}
          </span>
        </div>
      ))}
    </div>
  );
};

/* ──────────────────────────────
   Analytics Page
   ────────────────────────────── */

export default function AnalyticsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [kpi, setKpi] = useState<KPIData | null>(null);
  const [equityCurve, setEquityCurve] = useState<EquityPoint[]>([]);
  const [sessions, setSessions] = useState<BreakdownItem[]>([]);
  const [weekdays, setWeekdays] = useState<BreakdownItem[]>([]);
  const [directions, setDirections] = useState<BreakdownItem[]>([]);
  const [equityGranularity, setEquityGranularity] = useState<"day" | "week" | "month">("month");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [kpiRes, equityRes, sessionsRes, weekdaysRes, dirsRes] = await Promise.all([
        fetch("/api/analytics?type=kpi"),
        fetch(`/api/analytics?type=equity&granularity=${equityGranularity}`),
        fetch("/api/analytics?type=sessions"),
        fetch("/api/analytics?type=weekdays"),
        fetch("/api/analytics?type=directions"),
      ]);

      if (kpiRes.ok) setKpi(await kpiRes.json());
      if (equityRes.ok) setEquityCurve(await equityRes.json());
      if (sessionsRes.ok) setSessions(await sessionsRes.json());
      if (weekdaysRes.ok) setWeekdays(await weekdaysRes.json());
      if (dirsRes.ok) setDirections(await dirsRes.json());
    } catch (err) {
      console.error("Analytics fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [equityGranularity]);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth/signin");
  }, [status, router]);

  useEffect(() => {
    if (session) fetchData();
  }, [session, fetchData]);

  if (status === "loading" || !session) return null;

  const hasSufficientData = kpi && kpi.totalTrades >= 1;

  // Chart Mappings
  const sessionChartData = sessions.map((s) => ({
    name: s.label.toUpperCase(),
    Trades: s.trades,
    PnL: s.totalPnL,
    "Win Rate": s.winRate ?? 0,
  }));

  const weekdayOrder = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const weekdayChartData = weekdayOrder
    .map((day) => weekdays.find((w) => w.label === day))
    .filter(Boolean)
    .map((w) => ({
      name: w!.label.slice(0, 3).toUpperCase(),
      Trades: w!.trades,
      PnL: w!.totalPnL,
      "Win Rate": w!.winRate ?? 0,
    }));

  const dirPieData = directions.map((d) => ({
    name: d.label === "LONG" ? "LONGS" : "SHORTS",
    value: Math.abs(d.totalPnL) || 1,
    pnl: d.totalPnL,
    trades: d.trades,
    fill: d.label === "LONG" ? "#3B82F6" : "#F43F5E",
  }));

  return (
    <div className="page-container">
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <p className="label-sports mb-1">Squad Intelligence</p>
          <h1 className="text-3xl font-black heading-sports">Deep <span className="brand-gradient-text">Analytics</span></h1>
        </div>
        <div className="flex gap-2 bg-white/5 p-1 rounded-xl border border-white/5">
           <Zap className="h-4 w-4 text-[#06B6D4] ml-2 mt-2" />
           <p className="text-[10px] font-bold text-white/60 p-2 uppercase">AI Powered Insights Engine Active</p>
        </div>
      </motion.div>

      {!hasSufficientData ? (
        <div className="fifa-card p-20 flex flex-col items-center justify-center text-center gap-6">
          <BarChart3 className="h-16 w-16 text-muted-foreground/20" />
          <div className="space-y-2">
            <h2 className="text-2xl font-black heading-sports">Analytics <span className="text-[#2563EB]">Locked</span></h2>
            <p className="text-muted-foreground text-sm max-w-xs mx-auto">Sync at least one trade to unlock the performance engine and start the broadcast.</p>
          </div>
          <Link href="/import">
            <Button className="brand-gradient text-white font-black uppercase glow-primary">Import First Feed</Button>
          </Link>
        </div>
      ) : (
        <Tabs defaultValue="performance" className="w-full">
          <TabsList className="mb-8 bg-white/5 p-1.5 h-auto rounded-2xl border border-white/5 gap-2">
            {(["performance", "risk", "behavior"] as const).map((tab) => (
              <TabsTrigger 
                key={tab}
                value={tab} 
                className="rounded-xl px-8 py-3 text-[11px] font-black uppercase tracking-widest data-[state=active]:bg-[#2563EB] data-[state=active]:text-white data-[state=active]:glow-primary transition-all"
              >
                {tab}
              </TabsTrigger>
            ))}
          </TabsList>

          <AnimatePresence mode="wait">
            {/* ════════════ PERFORMANCE ════════════ */}
            <TabsContent value="performance">
              <motion.div 
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-8"
              >
                {/* KPI Ribbon */}
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
                  {[
                    { label: "Net P&L", value: formatUSD(kpi?.totalPnL ?? 0), color: (kpi?.totalPnL ?? 0) >= 0 ? "text-[#22C55E]" : "text-[#EF4444]" },
                    { label: "Win Rate", value: `${kpi?.winRate ?? 0}%`, icon: Target },
                    { label: "Profit Factor", value: kpi?.profitFactor?.toFixed(2) ?? "—", color: "text-[#06B6D4]" },
                    { label: "Avg R:R", value: kpi?.avgRR?.toFixed(2) ?? "—" },
                    { label: "Expectancy", value: `${kpi?.expectancy?.toFixed(2) ?? 0}R` },
                  ].map((stat, i) => (
                    <div key={i} className="fifa-card p-5 relative overflow-hidden">
                      <p className="label-sports mb-1">{stat.label}</p>
                      <p className={cn("text-2xl font-black heading-sports", stat.color ?? "text-white")}>{stat.value}</p>
                    </div>
                  ))}
                </div>

                {/* Main Curve */}
                <div className="fifa-card p-8">
                  <div className="flex items-center justify-between mb-8">
                    <div>
                      <h3 className="heading-sports text-lg">Equity <span className="text-[#2563EB]">Growth</span></h3>
                      <p className="text-[10px] font-bold text-muted-foreground/40 uppercase tracking-widest mt-1">Cumulative Season Performance</p>
                    </div>
                    <div className="flex gap-2 bg-black/20 p-1 rounded-xl border border-white/5">
                      {(["day", "week", "month"] as const).map((g) => (
                        <button
                          key={g}
                          onClick={() => setEquityGranularity(g)}
                          className={cn(
                            "px-4 py-1.5 text-[9px] font-black uppercase rounded-lg transition-all",
                            equityGranularity === g ? "bg-[#2563EB] text-white" : "text-muted-foreground/60 hover:text-white"
                          )}
                        >
                          {g}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="h-[350px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={equityCurve}>
                        <defs>
                          <linearGradient id="eqGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#2563EB" stopOpacity={0.4} />
                            <stop offset="95%" stopColor="#2563EB" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <XAxis 
                          dataKey="date" 
                          tick={{ fontSize: 9, fontWeight: 900, fill: "#444" }} 
                          tickLine={false} 
                          axisLine={false}
                          tickFormatter={(v) => v.split('-').slice(1).join('/')}
                        />
                        <YAxis 
                          tick={{ fontSize: 9, fontWeight: 900, fill: "#444" }} 
                          tickLine={false} 
                          axisLine={false}
                          tickFormatter={(v) => formatUSD(v)}
                        />
                        <Tooltip content={<CustomTooltip />} />
                        <Area
                          type="monotone"
                          dataKey="equity"
                          name="Equity"
                          stroke="#2563EB"
                          strokeWidth={4}
                          fillOpacity={1}
                          fill="url(#eqGradient)"
                          animationDuration={1500}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Sub Breakdowns */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div className="fifa-card p-8">
                    <h3 className="heading-sports text-sm mb-8">Directional <span className="text-[#F43F5E]">Bias</span></h3>
                    <div className="flex items-center gap-12">
                      <div className="h-[200px] w-[200px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={dirPieData}
                              innerRadius={60}
                              outerRadius={85}
                              paddingAngle={8}
                              dataKey="value"
                              stroke="none"
                            >
                              {dirPieData.map((entry, idx) => <Cell key={idx} fill={entry.fill} />)}
                            </Pie>
                            <Tooltip content={<CustomTooltip />} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="space-y-6 flex-1">
                        {directions.map((d, i) => (
                          <div key={i} className="relative">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{d.label}S</span>
                              <span className={cn("text-sm font-black heading-sports", d.totalPnL >= 0 ? "text-[#22C55E]" : "text-[#EF4444]")}>{formatUSD(d.totalPnL)}</span>
                            </div>
                            <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                               <motion.div 
                                  initial={{ width: 0 }}
                                  animate={{ width: `${d.winRate}%` }}
                                  className={cn("h-full rounded-full", d.label === "LONG" ? "bg-[#2563EB]" : "bg-[#F43F5E]")}
                               />
                            </div>
                            <div className="flex justify-between mt-2 text-[9px] font-bold text-muted-foreground/40 uppercase">
                              <span>Win Rate</span>
                              <span>{d.winRate}%</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="fifa-card p-8">
                    <h3 className="heading-sports text-sm mb-8">Session <span className="text-[#06B6D4]">Impact</span></h3>
                    <div className="h-[200px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={sessionChartData}>
                          <XAxis dataKey="name" tick={{ fontSize: 9, fontWeight: 900, fill: "#444" }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 9, fontWeight: 900, fill: "#444" }} axisLine={false} tickLine={false} tickFormatter={(v) => formatUSD(v)} />
                          <Tooltip content={<CustomTooltip />} />
                          <Bar 
                            dataKey="PnL" 
                            name="P&L" 
                            fill="#06B6D4" 
                            radius={[4, 4, 0, 0]}
                            animationDuration={1000}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              </motion.div>
            </TabsContent>

            {/* ════════════ RISK ════════════ */}
            <TabsContent value="risk">
              <motion.div 
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="space-y-8"
              >
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
                  <div className="fifa-card p-6 border-l-4 border-red-500">
                    <p className="label-sports mb-1">Max Drawdown</p>
                    <p className="text-3xl font-black heading-sports text-[#EF4444]">{formatUSD(-kpi!.maxDrawdown)}</p>
                    <p className="text-[10px] font-bold text-muted-foreground/40 uppercase mt-2">{kpi!.maxDrawdownPercent.toFixed(1)}% Decline</p>
                  </div>
                  <div className="fifa-card p-6 border-l-4 border-emerald-500">
                    <p className="label-sports mb-1">Best Trade</p>
                    <p className="text-3xl font-black heading-sports text-[#22C55E]">{formatUSD(kpi!.bestTrade ?? 0)}</p>
                    <p className="text-[10px] font-bold text-muted-foreground/40 uppercase mt-2">Single Match High</p>
                  </div>
                  <div className="fifa-card p-6">
                    <p className="label-sports mb-1">Total Fees</p>
                    <p className="text-3xl font-black heading-sports text-white/40">{formatUSD(-kpi!.totalFees)}</p>
                    <p className="text-[10px] font-bold text-muted-foreground/40 uppercase mt-2">Broker Commission</p>
                  </div>
                  <div className="fifa-card p-6">
                    <p className="label-sports mb-1">Worst Trade</p>
                    <p className="text-3xl font-black heading-sports text-[#EF4444]">{formatUSD(kpi!.worstTrade ?? 0)}</p>
                    <p className="text-[10px] font-bold text-muted-foreground/40 uppercase mt-2">Single Match Low</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                   <div className="fifa-card p-8 space-y-8">
                      <h3 className="heading-sports text-sm">Consecutive <span className="text-[#2563EB]">Streaks</span></h3>
                      <div className="flex gap-12">
                        <div className="space-y-2">
                           <div className="flex items-center gap-2 text-[#22C55E]">
                              <ArrowUpRight className="h-5 w-5" />
                              <span className="text-[10px] font-black uppercase">Longest Win</span>
                           </div>
                           <p className="text-6xl font-black heading-sports">{kpi?.consecutiveWins}</p>
                        </div>
                        <div className="w-px bg-white/5" />
                        <div className="space-y-2">
                           <div className="flex items-center gap-2 text-[#EF4444]">
                              <ArrowDownRight className="h-5 w-5" />
                              <span className="text-[10px] font-black uppercase">Longest Loss</span>
                           </div>
                           <p className="text-6xl font-black heading-sports">{kpi?.consecutiveLosses}</p>
                        </div>
                      </div>
                   </div>
                   <div className="fifa-card p-8">
                      <h3 className="heading-sports text-sm mb-8">P&L <span className="text-[#06B6D4]">Distribution</span></h3>
                      <div className="h-[180px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={equityCurve.slice(-20)}>
                            <Tooltip content={<CustomTooltip />} />
                            <Bar 
                              dataKey="pnl" 
                              name="Daily P&L"
                              radius={[2, 2, 0, 0]}
                              shape={(props: any) => {
                                const { x, y, width, height, payload } = props;
                                const color = payload.pnl >= 0 ? "#22C55E" : "#EF4444";
                                return <rect x={x} y={y} width={width} height={height} fill={color} rx={2} />;
                              }}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                   </div>
                </div>
              </motion.div>
            </TabsContent>

            {/* ════════════ BEHAVIOR ════════════ */}
            <TabsContent value="behavior">
               <motion.div 
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="space-y-8"
              >
                <div className="fifa-card p-8">
                   <h3 className="heading-sports text-sm mb-8">Weekday <span className="text-[#2563EB]">Performance Matrix</span></h3>
                   <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={weekdayChartData}>
                           <XAxis dataKey="name" tick={{ fontSize: 9, fontWeight: 900, fill: "#444" }} axisLine={false} tickLine={false} />
                           <YAxis yAxisId="left" tick={{ fontSize: 9, fontWeight: 900, fill: "#444" }} axisLine={false} tickLine={false} tickFormatter={(v) => formatUSD(v)} />
                           <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 9, fontWeight: 900, fill: "#444" }} axisLine={false} tickLine={false} domain={[0, 100]} />
                           <Tooltip content={<CustomTooltip />} />
                           <Bar yAxisId="left" dataKey="PnL" name="P&L" fill="#2563EB" radius={[4, 4, 0, 0]} />
                           <Line yAxisId="right" type="monotone" dataKey="Win Rate" stroke="#22C55E" strokeWidth={3} dot={{ r: 4, fill: "#22C55E", strokeWidth: 2, stroke: "#0F0F1A" }} />
                           <Legend wrapperStyle={{ fontSize: 8, fontWeight: 900, textTransform: 'uppercase', marginTop: 20 }} />
                        </BarChart>
                      </ResponsiveContainer>
                   </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                   <div className="fifa-card p-6">
                      <h3 className="heading-sports text-[10px] mb-4 text-muted-foreground">Detailed Breakdown</h3>
                      <div className="space-y-3">
                        {weekdayChartData.map((d, idx) => (
                          <div key={idx} className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5">
                            <span className="font-black heading-sports text-xs">{d.name}</span>
                            <div className="flex gap-6 items-center">
                               <span className="text-[9px] font-bold text-muted-foreground/40">{d.Trades} T</span>
                               <span className={cn("text-xs font-black", d.PnL >= 0 ? "text-[#22C55E]" : "text-[#EF4444]")}>{formatUSD(d.PnL)}</span>
                               <span className="text-[10px] font-black text-[#22C55E]">{d["Win Rate"].toFixed(0)}% WR</span>
                            </div>
                          </div>
                        ))}
                      </div>
                   </div>

                   <div className="fifa-card p-6">
                      <h3 className="heading-sports text-[10px] mb-4 text-muted-foreground">Session Intel</h3>
                      <div className="space-y-3">
                         {sessions.map((s, i) => (
                           <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5">
                              <span className="font-black heading-sports text-xs uppercase">{s.label}</span>
                              <div className="flex gap-6 items-center">
                                 <span className={cn("text-xs font-black", s.totalPnL >= 0 ? "text-[#22C55E]" : "text-[#EF4444]")}>{formatUSD(s.totalPnL)}</span>
                                 <span className="text-[10px] font-black text-white/40">{s.winRate}% WR</span>
                              </div>
                           </div>
                         ))}
                      </div>
                   </div>
                </div>
              </motion.div>
            </TabsContent>
          </AnimatePresence>
        </Tabs>
      )}
    </div>
  );
}
