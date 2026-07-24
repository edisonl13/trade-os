"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Loader2,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Target,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

interface CalendarDay {
  date: string;
  pnl: number;
  trades: number;
  wins: number;
  losses: number;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

function formatUSD(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1000) return `${n >= 0 ? "+" : "-"}$${(abs / 1000).toFixed(1)}K`;
  return `${n >= 0 ? "+" : "-"}$${abs.toFixed(0)}`;
}

export default function CalendarPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(true);
  const [calendarData, setCalendarData] = useState<CalendarDay[]>([]);
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);

  const fetchCalendar = useCallback(async (y: number, m: number) => {
    setDataLoading(true);
    try {
      const res = await fetch(`/api/analytics?type=calendar&year=${y}&month=${m}`);
      if (res.ok) {
        setCalendarData(await res.json());
      }
    } catch {
    } finally {
      setDataLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth/signin");
    if (status === "authenticated") {
      fetchCalendar(year, month);
      setLoading(false);
    }
  }, [status, router, year, month, fetchCalendar]);

  if (status === "loading" || loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0F0F1A]">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#6366F1] border-t-transparent glow-primary" />
      </div>
    );
  }

  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDayOfWeek = new Date(year, month - 1, 1).getDay();
  const calendarDays = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const monthPnL = calendarData.reduce((sum, d) => sum + d.pnl, 0);
  const monthTrades = calendarData.reduce((sum, d) => sum + d.trades, 0);
  const monthWins = calendarData.reduce((sum, d) => sum + d.wins, 0);
  const monthLosses = calendarData.reduce((sum, d) => sum + d.losses, 0);
  const monthWinRate = monthTrades > 0 ? (monthWins / monthTrades) * 100 : 0;

  const navMonth = (delta: number) => {
    let nm = month + delta;
    let ny = year;
    if (nm < 1) { nm = 12; ny--; }
    if (nm > 12) { nm = 1; ny++; }
    setMonth(nm);
    setYear(ny);
  };

  return (
    <div className="page-container">
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-wrap items-end justify-between gap-6"
      >
        <div>
          <p className="label-sports mb-1">Time Dimension</p>
          <h1 className="text-3xl font-black heading-sports">Performance <span className="brand-gradient-text">Calendar</span></h1>
        </div>

        <div className="flex items-center gap-4 bg-white/5 p-1.5 rounded-2xl border border-white/5">
           <button onClick={() => navMonth(-1)} className="p-2 hover:bg-white/10 rounded-xl transition-colors"><ChevronLeft className="h-5 w-5" /></button>
           <h2 className="text-sm font-black heading-sports px-4 min-w-[140px] text-center">{MONTHS[month - 1]} {year}</h2>
           <button onClick={() => navMonth(1)} className="p-2 hover:bg-white/10 rounded-xl transition-colors"><ChevronRight className="h-5 w-5" /></button>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Main Calendar View */}
        <div className="lg:col-span-8 space-y-8">
          <div className="fifa-card p-6">
            <div className="grid grid-cols-7 gap-3 mb-6">
              {WEEKDAYS.map(d => (
                <div key={d} className="text-center text-[10px] font-black text-muted-foreground/40 tracking-[0.2em]">{d}</div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-3">
              {Array.from({ length: firstDayOfWeek }).map((_, i) => (
                <div key={`empty-${i}`} className="aspect-[4/3] rounded-xl bg-white/2" />
              ))}
              {calendarDays.map(day => {
                const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                const data = calendarData.find(d => d.date === dateStr);
                const isToday = new Date().toISOString().startsWith(dateStr);

                return (
                  <motion.div 
                    key={day}
                    whileHover={{ scale: 1.05, zIndex: 10 }}
                    className={cn(
                      "aspect-[4/3] rounded-xl border border-white/5 p-2 flex flex-col justify-between transition-all group",
                      data ? (data.pnl >= 0 ? "bg-[#22C55E]/10 border-[#22C55E]/20" : "bg-[#EF4444]/10 border-[#EF4444]/20") : "bg-white/5",
                      isToday && "ring-2 ring-[#3B82F6] glow-primary"
                    )}
                  >
                    <span className={cn(
                      "text-[10px] font-black",
                      data ? (data.pnl >= 0 ? "text-[#22C55E]" : "text-[#EF4444]") : "text-muted-foreground/30"
                    )}>{day}</span>
                    
                    {data && (
                      <div className="text-center">
                        <p className={cn(
                          "text-[11px] font-black heading-sports leading-none",
                          data.pnl >= 0 ? "text-[#22C55E]" : "text-[#EF4444]"
                        )}>{formatUSD(data.pnl)}</p>
                        <div className="flex justify-center gap-1 mt-1">
                           <div className="h-1 w-1 rounded-full bg-white/20" />
                           <div className="h-1 w-1 rounded-full bg-white/20" />
                        </div>
                      </div>
                    )}

                    <div className="flex justify-between items-center opacity-0 group-hover:opacity-100 transition-opacity">
                       <span className="text-[7px] font-black uppercase text-white/40">{data?.trades ?? 0} TRADES</span>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Calendar Sidebar Stats */}
        <div className="lg:col-span-4 space-y-8">
           <div className="fifa-card p-8 space-y-6">
              <h3 className="heading-sports text-sm">Monthly <span className="text-[#3B82F6]">Summary</span></h3>
              
              <div className="space-y-4">
                 <div className="flex justify-between items-end p-4 rounded-2xl bg-white/5 border border-white/5">
                    <div>
                       <p className="label-sports">Net Results</p>
                       <p className={cn("text-3xl font-black heading-sports mt-1", monthPnL >= 0 ? "text-[#22C55E]" : "text-[#EF4444]")}>{formatUSD(monthPnL)}</p>
                    </div>
                    {monthPnL >= 0 ? <ArrowUpRight className="h-8 w-8 text-[#22C55E] opacity-20" /> : <ArrowDownRight className="h-8 w-8 text-[#EF4444] opacity-20" />}
                 </div>

                 <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 rounded-2xl bg-white/5 border border-white/5">
                       <p className="label-sports">Total Matches</p>
                       <p className="text-xl font-black heading-sports mt-1">{monthTrades}</p>
                    </div>
                    <div className="p-4 rounded-2xl bg-white/5 border border-white/5">
                       <p className="label-sports">Win Ratio</p>
                       <p className="text-xl font-black heading-sports mt-1 text-[#06B6D4]">{monthWinRate.toFixed(1)}%</p>
                    </div>
                 </div>
              </div>

              <div className="space-y-3 pt-4 border-t border-white/5">
                 <div className="flex justify-between text-[10px] font-black uppercase">
                    <span className="text-muted-foreground/40">Successful Days</span>
                    <span className="text-[#22C55E]">{calendarData.filter(d => d.pnl > 0).length}</span>
                 </div>
                 <div className="flex justify-between text-[10px] font-black uppercase">
                    <span className="text-muted-foreground/40">Difficult Days</span>
                    <span className="text-[#EF4444]">{calendarData.filter(d => d.pnl < 0).length}</span>
                 </div>
                 <div className="flex justify-between text-[10px] font-black uppercase">
                    <span className="text-muted-foreground/40">Total Wins</span>
                    <span>{monthWins}</span>
                 </div>
              </div>
           </div>

           <div className="fifa-card p-6 bg-gradient-to-br from-[#3B82F6]/10 to-transparent">
              <h3 className="heading-sports text-xs flex items-center gap-2">
                 <Target className="h-4 w-4 text-[#3B82F6]" />
                 Target Accuracy
              </h3>
              <div className="mt-6 space-y-4">
                 <div className="flex justify-between text-[9px] font-black uppercase tracking-widest text-muted-foreground/60">
                    <span>Performance vs Goal</span>
                    <span>72%</span>
                 </div>
                 <div className="h-2 w-full bg-white/5 rounded-lg overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: '72%' }}
                      className="h-full bg-[#3B82F6] glow-primary"
                    />
                 </div>
                 <p className="text-[10px] font-medium text-muted-foreground/50 leading-relaxed">
                    You are currently 28% away from your monthly profit target of $5,000. Maintain the current win rate to hit it by week 4.
                 </p>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
}
