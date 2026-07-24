/**
 * TRADE//OS Analytics Engine
 *
 * Deterministic performance statistics computed from trade records.
 * All calculations are formula-driven and sample-aware.
 */

export interface TradeRecord {
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
  closedAt: number | null;
  weekDay: number | null;
  session: string | null;
  status: "OPEN" | "CLOSED";
  strategy: string | null;
}

/* ──────────────────────────────
   Summary KPIs
   ────────────────────────────── */

export interface KPISummary {
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

export function computeKPI(trades: TradeRecord[]): KPISummary {
  const closed = trades.filter((t) => t.status === "CLOSED");
  const open = trades.filter((t) => t.status === "OPEN");
  const winners = closed.filter((t) => t.pnl !== null && t.pnl > 0);
  const losers = closed.filter((t) => t.pnl !== null && t.pnl < 0);

  const totalPnL = closed.reduce((sum, t) => sum + (t.pnl ?? 0), 0);
  const totalFees = trades.reduce((sum, t) => sum + (t.fees ?? 0), 0);
  const totalRR = closed.reduce((sum, t) => sum + (t.actualR ?? 0), 0);
  const rCount = closed.filter((t) => t.actualR !== null).length;
  const pnlCount = closed.filter((t) => t.pnl !== null).length;

  // Win rate
  const winRate =
    closed.length > 0 ? (winners.length / closed.length) * 100 : null;

  // Profit Factor
  const grossWin = winners.reduce((s, t) => s + (t.pnl ?? 0), 0);
  const grossLoss = Math.abs(losers.reduce((s, t) => s + (t.pnl ?? 0), 0));
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : null;

  // Expectancy
  const expectancy = rCount > 0 ? totalRR / rCount : null;

  // Average R
  const avgRR = rCount > 0 ? totalRR / rCount : null;

  // Best/Worst
  const pnls = closed.map((t) => t.pnl ?? 0).filter((p) => p !== 0);
  const bestTrade = pnls.length > 0 ? Math.max(...pnls) : null;
  const worstTrade = pnls.length > 0 ? Math.min(...pnls) : null;

  // Consecutive wins/losses
  let consW = 0,
    consL = 0,
    maxW = 0,
    maxL = 0;
  for (const t of closed.sort((a, b) => a.tradedAt - b.tradedAt)) {
    if (t.pnl !== null && t.pnl > 0) {
      consW++;
      consL = 0;
      maxW = Math.max(maxW, consW);
    } else if (t.pnl !== null && t.pnl < 0) {
      consL++;
      consW = 0;
      maxL = Math.max(maxL, consL);
    }
  }

  // Drawdown (simplified)
  let maxDD = 0,
    maxDDPct = 0,
    peak = 0;
  let runningPnl = 0;
  for (const t of closed.sort((a, b) => a.tradedAt - b.tradedAt)) {
    runningPnl += t.pnl ?? 0;
    if (runningPnl > peak) peak = runningPnl;
    const dd = peak - runningPnl;
    if (dd > maxDD) maxDD = dd;
    if (peak > 0) {
      const ddPct = (dd / peak) * 100;
      if (ddPct > maxDDPct) maxDDPct = ddPct;
    }
  }

  return {
    totalTrades: trades.length,
    closedTrades: closed.length,
    openTrades: open.length,
    winningTrades: winners.length,
    losingTrades: losers.length,
    winRate: Math.round(winRate ?? NaN),
    totalPnL: Math.round(totalPnL * 100) / 100,
    avgPnL: pnlCount > 0 ? Math.round((totalPnL / pnlCount) * 100) / 100 : null,
    totalFees: Math.round(totalFees * 100) / 100,
    avgRR: avgRR !== null ? Math.round(avgRR * 100) / 100 : null,
    profitFactor:
      profitFactor !== null ? Math.round(profitFactor * 100) / 100 : null,
    expectancy: expectancy !== null ? Math.round(expectancy * 100) / 100 : null,
    maxDrawdown: Math.round(maxDD * 100) / 100,
    maxDrawdownPercent: Math.round(maxDDPct * 100) / 100,
    bestTrade: bestTrade !== null ? Math.round(bestTrade * 100) / 100 : null,
    worstTrade: worstTrade !== null ? Math.round(worstTrade * 100) / 100 : null,
    consecutiveWins: maxW,
    consecutiveLosses: maxL,
  };
}

/* ──────────────────────────────
   Equity Curve (time series)
   ────────────────────────────── */

export interface EquityPoint {
  date: string; // YYYY-MM-DD
  equity: number;
  pnl: number;
}

export function computeEquityCurve(
  trades: TradeRecord[],
  granularity: "day" | "week" | "month" | "quarter" | "year"
): EquityPoint[] {
  const closed = trades
    .filter((t) => t.status === "CLOSED" && t.pnl !== null)
    .sort((a, b) => a.tradedAt - b.tradedAt);

  const groups = new Map<string, number>();

  for (const t of closed) {
    const d = new Date(t.tradedAt);
    let key: string;

    switch (granularity) {
      case "day":
        key = d.toISOString().slice(0, 10);
        break;
      case "week": {
        const start = new Date(d);
        start.setDate(d.getDate() - d.getDay());
        key = start.toISOString().slice(0, 10);
        break;
      }
      case "month":
        key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        break;
      case "quarter": {
        const q = Math.floor(d.getMonth() / 3) + 1;
        key = `${d.getFullYear()}-Q${q}`;
        break;
      }
      case "year":
        key = String(d.getFullYear());
        break;
      default:
        key = d.toISOString().slice(0, 10);
    }

    groups.set(key, (groups.get(key) ?? 0) + (t.pnl ?? 0));
  }

  const sorted = Array.from(groups.entries()).sort(([a], [b]) =>
    a.localeCompare(b)
  );

  let running = 0;
  return sorted.map(([date, pnl]) => {
    running += pnl;
    return { date, pnl: Math.round(pnl * 100) / 100, equity: Math.round(running * 100) / 100 };
  });
}

/* ──────────────────────────────
   Session / Weekday breakdown
   ────────────────────────────── */

export interface BreakdownItem {
  label: string;
  trades: number;
  wins: number;
  losses: number;
  winRate: number | null;
  totalPnL: number;
  avgRR: number | null;
}

export function computeSessionBreakdown(trades: TradeRecord[]): BreakdownItem[] {
  const sessions = new Map<string, TradeRecord[]>();
  for (const t of trades) {
    const s = t.session ?? "other";
    if (!sessions.has(s)) sessions.set(s, []);
    sessions.get(s)!.push(t);
  }

  return Array.from(sessions.entries())
    .map(([label, ts]) => breakdownForGroup(label, ts))
    .sort((a, b) => b.trades - a.trades);
}

export function computeWeekdayBreakdown(trades: TradeRecord[]): BreakdownItem[] {
  const days = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  const byDay = new Map<number, TradeRecord[]>();
  for (const t of trades) {
    const d = t.weekDay ?? new Date(t.tradedAt).getUTCDay();
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d)!.push(t);
  }

  return Array.from(byDay.entries())
    .map(([dayNum, ts]) => breakdownForGroup(days[dayNum], ts))
    .sort((a, b) => b.trades - a.trades);
}

export function computeDirectionBreakdown(
  trades: TradeRecord[]
): BreakdownItem[] {
  const longs = trades.filter((t) => t.direction === "LONG");
  const shorts = trades.filter((t) => t.direction === "SHORT");
  return [
    breakdownForGroup("LONG", longs),
    breakdownForGroup("SHORT", shorts),
  ];
}

function breakdownForGroup(
  label: string,
  ts: TradeRecord[]
): BreakdownItem {
  const closed = ts.filter((t) => t.status === "CLOSED");
  const wins = closed.filter((t) => t.pnl !== null && t.pnl > 0);
  const losses = closed.filter((t) => t.pnl !== null && t.pnl < 0);
  const pnl = closed.reduce((s, t) => s + (t.pnl ?? 0), 0);
  const rrValues = closed.map((t) => t.actualR ?? 0).filter((r) => r !== 0);
  const avgRR =
    rrValues.length > 0
      ? rrValues.reduce((s, r) => s + r, 0) / rrValues.length
      : null;

  return {
    label,
    trades: ts.length,
    wins: wins.length,
    losses: losses.length,
    winRate:
      closed.length > 0
        ? Math.round((wins.length / closed.length) * 10000) / 100
        : null,
    totalPnL: Math.round(pnl * 100) / 100,
    avgRR: avgRR !== null ? Math.round(avgRR * 100) / 100 : null,
  };
}

/* ──────────────────────────────
   Heatmap data
   ────────────────────────────── */

export interface HeatmapCell {
  hour: number;
  day: number;
  value: number;
  trades: number;
}

export function computeHeatmap(trades: TradeRecord[]): HeatmapCell[] {
  const cells = new Map<string, { pnl: number; count: number }>();

  for (const t of trades) {
    const d = new Date(t.tradedAt);
    const hour = d.getUTCHours();
    const day = t.weekDay ?? d.getUTCDay();
    const key = `${hour}-${day}`;
    const existing = cells.get(key) ?? { pnl: 0, count: 0 };
    existing.pnl += t.pnl ?? 0;
    existing.count++;
    cells.set(key, existing);
  }

  return Array.from(cells.entries()).map(([key, v]) => {
    const [hour, day] = key.split("-").map(Number);
    return {
      hour,
      day,
      value: Math.round(v.pnl * 100) / 100,
      trades: v.count,
    };
  });
}

/* ──────────────────────────────
   Calendar data
   ────────────────────────────── */

export interface CalendarDay {
  date: string;
  pnl: number;
  trades: number;
  wins: number;
  losses: number;
}

export function computeCalendarData(
  trades: TradeRecord[],
  year: number,
  month: number
): CalendarDay[] {
  const closed = trades.filter(
    (t) =>
      t.status === "CLOSED" &&
      t.pnl !== null &&
      new Date(t.tradedAt).getFullYear() === year &&
      new Date(t.tradedAt).getMonth() + 1 === month
  );

  const byDate = new Map<string, { pnl: number; trades: number; wins: number; losses: number }>();

  for (const t of closed) {
    const date = new Date(t.tradedAt).toISOString().slice(0, 10);
    const existing = byDate.get(date) ?? { pnl: 0, trades: 0, wins: 0, losses: 0 };
    existing.pnl += t.pnl ?? 0;
    existing.trades++;
    if ((t.pnl ?? 0) > 0) existing.wins++;
    else if ((t.pnl ?? 0) < 0) existing.losses++;
    byDate.set(date, existing);
  }

  return Array.from(byDate.entries()).map(([date, v]) => ({
    date,
    pnl: Math.round(v.pnl * 100) / 100,
    trades: v.trades,
    wins: v.wins,
    losses: v.losses,
  }));
}
