"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import {
  ScrollText,
  Search,
  Loader2,
  Trash2,
  X,
  ChevronLeft,
  ChevronRight,
  CheckSquare,
  Square,
  Download,
  RefreshCw,
  Upload,
  ArrowUpRight,
  ArrowDownRight,
  Filter,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { useI18n } from "@/lib/i18n/provider";
import { getTimezoneAbbr } from "@/lib/timezone";

interface Trade {
  id: string;
  symbol: string;
  direction: "LONG" | "SHORT";
  entryPrice: number | null;
  actualEntry: number | null;
  actualExit: number | null;
  pnl: number | null;
  actualR: number | null;
  fees: number | null;
  tradedAt: number;
  status: "OPEN" | "CLOSED";
  strategy: string | null;
  source: string;
}

export default function TradesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { t, locale } = useI18n();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [timezone, setTimezone] = useState("UTC");
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const pageSize = 20;

  const fetchTrades = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: String(pageSize),
        offset: String(page * pageSize),
      });
      if (search) params.set("search", search);

      const [res, accountRes] = await Promise.all([
        fetch(`/api/trades?${params}`, { cache: "no-store" }),
        fetch("/api/trading-account", { cache: "no-store" }),
      ]);
      const data = await res.json();
      if (res.ok) {
        setTrades(data.trades ?? []);
        setTotal(data.total ?? 0);
      }
      if (accountRes.ok) {
        const account = await accountRes.json();
        setTimezone(account?.timezone ?? "UTC");
      }
    } catch {
      toast.error(t("error.network"));
    } finally {
      setLoading(false);
    }
  }, [page, search, t]);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth/signin");
    if (session) fetchTrades();
  }, [status, router, session, fetchTrades]);

  if (status === "loading" || !session) return null;

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/trades/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success(t("trades.deleted"));
        setDeleteConfirm(null);
        fetchTrades();
      }
    } catch {}
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const totalPages = Math.ceil(total / pageSize);
  const formatTradeTimestamp = (timestamp: number) => ({
    date: new Intl.DateTimeFormat(locale, {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(timestamp)),
    time: new Intl.DateTimeFormat(locale, {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(timestamp)),
    zone: getTimezoneAbbr(timezone, timestamp),
  });

  return (
    <div className="page-container">
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-wrap items-end justify-between gap-6"
      >
        <div>
          <p className="label-sports mb-1">{t("common.productCategory")}</p>
          <h1 className="text-3xl font-black heading-sports">{t("trades.title")}</h1>
          <p className="mt-2 text-[10px] font-bold text-muted-foreground/40 uppercase tracking-widest">
            {t("trades.subtitle", String(total))}
          </p>
        </div>

        <div className="flex items-center gap-3">
           <div className="relative group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/40 group-focus-within:text-[#3B82F6] transition-colors" />
              <Input 
                placeholder={t("trades.search")}
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                className="h-11 bg-white/5 border-white/5 rounded-xl pl-10 w-64 font-bold transition-all focus:ring-[#6366F1] focus:bg-white/10"
              />
           </div>
           <Link href="/import">
             <Button className="h-11 px-6 brand-gradient text-white font-black uppercase glow-primary gap-2">
                <Upload className="h-4 w-4" /> {t("trades.newEntry")}
             </Button>
           </Link>
        </div>
      </motion.div>

      <div className="fifa-card overflow-hidden">
         <div className="p-4 border-b border-white/5 bg-white/2 flex items-center justify-between">
            <h3 className="heading-sports text-[10px] text-muted-foreground">{t("trades.feed")}</h3>
            <div className="flex items-center gap-4">
               {selectedIds.size > 0 && (
                 <Button variant="ghost" className="h-8 text-[9px] font-black uppercase text-red-400 hover:bg-red-500/10" onClick={async () => {
                   const ids = Array.from(selectedIds);
                   let deleted = 0;
                   for (const id of ids) {
                     const res = await fetch(`/api/trades/${id}`, { method: "DELETE" });
                     if (res.ok) deleted++;
                   }
                   if (deleted > 0) toast.success(`Purged ${deleted} signatures`);
                   setSelectedIds(new Set());
                   fetchTrades();
                 }}>{t("trades.deleteSelected", String(selectedIds.size))}</Button>
               )}
               <button aria-label={t("trades.refresh")} title={t("trades.refresh")} onClick={fetchTrades} className="p-2 hover:bg-white/5 rounded-lg transition-colors"><RefreshCw className={cn("h-4 w-4 text-muted-foreground", loading && "animate-spin")} /></button>
            </div>
         </div>

         <div className="overflow-x-auto">
            <Table>
               <TableHeader className="bg-white/2">
                  <TableRow className="border-white/5 hover:bg-transparent">
                     <TableHead className="w-12 text-center">
                        <button aria-label={t("trades.selectAll")} onClick={() => setSelectedIds(selectedIds.size === trades.length ? new Set() : new Set(trades.map(t => t.id)))}>
                           <div className={cn("h-4 w-4 rounded-md border border-white/10 flex items-center justify-center", selectedIds.size === trades.length && "bg-[#3B82F6] border-transparent")}>
                              {selectedIds.size === trades.length && <CheckSquare className="h-3 w-3 text-white" />}
                           </div>
                        </button>
                     </TableHead>
                     <TableHead className="label-sports py-5">{t("trades.dateTime")}</TableHead>
                     <TableHead className="label-sports">{t("trades.symbol")}</TableHead>
                     <TableHead className="label-sports">{t("trades.action")}</TableHead>
                     <TableHead className="label-sports text-right">{t("trades.entry")}</TableHead>
                     <TableHead className="label-sports text-right">{t("trades.exit")}</TableHead>
                     <TableHead className="label-sports text-right">{t("trades.result")}</TableHead>
                     <TableHead className="label-sports">{t("trades.status")}</TableHead>
                     <TableHead className="w-12"></TableHead>
                  </TableRow>
               </TableHeader>
               <TableBody>
                  {loading && trades.length === 0 ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i} className="border-white/5"><TableCell colSpan={9} className="h-16 animate-pulse bg-white/2"></TableCell></TableRow>
                    ))
                  ) : trades.length === 0 ? (
                    <TableRow className="border-none hover:bg-transparent">
                       <TableCell colSpan={9} className="h-64 text-center">
                          <div className="flex flex-col items-center gap-4 opacity-20">
                             <ScrollText className="h-12 w-12" />
                             <p className="font-black heading-sports">{t("trades.noRecords")}</p>
                          </div>
                       </TableCell>
                    </TableRow>
                  ) : (
                    trades.map((trade) => (
                      <TableRow key={trade.id} className={cn("border-white/5 group hover:bg-white/5 transition-all", selectedIds.has(trade.id) && "bg-[#3B82F6]/5")}>
                         <TableCell className="text-center">
                            <button aria-label={t("trades.selectTrade")} onClick={() => toggleSelect(trade.id)}>
                               <div className={cn("mx-auto h-4 w-4 rounded-md border border-white/10 flex items-center justify-center transition-colors", selectedIds.has(trade.id) && "bg-[#3B82F6] border-transparent")}>
                                  {selectedIds.has(trade.id) && <CheckSquare className="h-3 w-3 text-white" />}
                               </div>
                            </button>
                         </TableCell>
                         <TableCell className="py-4">
                            {(() => {
                              const stamp = formatTradeTimestamp(trade.tradedAt);
                              return (
                                <>
                                  <p className="text-[10px] font-black heading-sports text-white/80">{stamp.date}</p>
                                  <p className="text-[8px] font-bold text-muted-foreground/40 mt-0.5">{stamp.time} {stamp.zone}</p>
                                </>
                              );
                            })()}
                         </TableCell>
                         <TableCell>
                            <span className="font-black heading-sports text-sm tracking-tight">{trade.symbol}</span>
                         </TableCell>
                         <TableCell>
                            <Badge className={cn(
                              "text-[8px] font-black uppercase px-2 py-0.5",
                              trade.direction === "LONG" ? "bg-[#3B82F6]/10 text-[#3B82F6] border-[#3B82F6]/20" : "bg-[#F43F5E]/10 text-[#F43F5E] border-[#F43F5E]/20"
                            )}>{trade.direction}</Badge>
                         </TableCell>
                         <TableCell className="text-right font-mono text-[10px] font-bold text-white/60">{trade.actualEntry?.toFixed(5) ?? "—"}</TableCell>
                         <TableCell className="text-right font-mono text-[10px] font-bold text-white/60">{trade.actualExit?.toFixed(5) ?? "—"}</TableCell>
                         <TableCell className="text-right">
                            <span className={cn(
                              "font-black heading-sports text-xs",
                              trade.pnl !== null && trade.pnl >= 0 ? "text-[#22C55E]" : trade.pnl !== null ? "text-[#EF4444]" : "text-white/20"
                            )}>
                               {trade.pnl !== null ? (trade.pnl >= 0 ? "+" : "-") + "$" + Math.abs(trade.pnl).toFixed(2) : t("trades.pending")}
                            </span>
                         </TableCell>
                         <TableCell>
                            <div className="flex items-center gap-2">
                               <div className={cn("h-1.5 w-1.5 rounded-full", trade.status === "CLOSED" ? "bg-white/20" : "bg-[#06B6D4] animate-pulse shadow-[0_0_8px_#06B6D4]")} />
                               <span className={cn("text-[9px] font-black uppercase", trade.status === "CLOSED" ? "text-white/20" : "text-[#06B6D4]")}>{trade.status === "CLOSED" ? t("trades.closed") : t("trades.open")}</span>
                            </div>
                         </TableCell>
                         <TableCell>
                            <button aria-label={t("trades.deleteTrade")} onClick={() => setDeleteConfirm(trade.id)} className="opacity-0 group-hover:opacity-100 p-2 hover:bg-red-500/10 hover:text-red-400 rounded-lg transition-all">
                               <Trash2 className="h-3.5 w-3.5" />
                            </button>
                         </TableCell>
                      </TableRow>
                    ))
                  )}
               </TableBody>
            </Table>
         </div>

         {totalPages > 1 && (
           <div className="p-4 border-t border-white/5 bg-white/2 flex items-center justify-between">
              <p className="text-[9px] font-bold text-muted-foreground/40 uppercase tracking-widest">{t("trades.page")} {page + 1} {t("trades.of")} {totalPages}</p>
              <div className="flex gap-2">
                 <Button 
                   variant="outline" 
                   size="sm" 
                   disabled={page === 0} 
                   onClick={() => setPage(page - 1)}
                   className="h-8 border-white/5 text-[10px] font-black uppercase"
                 >{t("trades.prev")}</Button>
                 <Button 
                   variant="outline" 
                   size="sm" 
                   disabled={page >= totalPages - 1} 
                   onClick={() => setPage(page + 1)}
                   className="h-8 border-white/5 text-[10px] font-black uppercase"
                 >{t("trades.next")}</Button>
              </div>
           </div>
         )}
      </div>

      {/* Delete Modal */}
      <Dialog open={!!deleteConfirm} onOpenChange={o => !o && setDeleteConfirm(null)}>
         <DialogContent className="fifa-card bg-[#0F0F1A] border-white/10 shadow-2xl">
            <DialogHeader>
               <DialogTitle className="heading-sports text-white">{t("trades.deleteConfirm")}</DialogTitle>
               <DialogDescription className="text-muted-foreground text-xs font-medium">
                  {t("trades.deleteDesc")}
               </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-3 mt-4">
               <Button variant="ghost" className="font-black uppercase text-muted-foreground" onClick={() => setDeleteConfirm(null)}>{t("trades.abort")}</Button>
               <Button className="bg-red-500 hover:bg-red-600 text-white font-black uppercase" onClick={() => deleteConfirm && handleDelete(deleteConfirm)}>{t("trades.purge")}</Button>
            </DialogFooter>
         </DialogContent>
      </Dialog>
    </div>
  );
}
