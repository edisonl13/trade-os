import { getDateStrInTz } from "@/lib/timezone";

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
  breakEvenTrades: number;
  winRate: number | null;
  totalPnL: number;
  avgPnL: number | null;
  totalFees: number;
  avgRR: number | null;
  profitFactor: number | null;
  expectancy: number | null;
  expectancyDetail: {
    avgWinR: number | null;
    avgLossR: number | null;
    winRate: number | null;
  } | null;
  maxDrawdown: number;
  maxDrawdownPercent: number | null;
  bestTrade: number | null;
  worstTrade: number | null;
  consecutiveWins: number;
  consecutiveLosses: number;
}

/**
 * Compute all KPIs from trade records.
 *
 * @param trades  All trades (both OPEN and CLOSED)
 * @param initialBalance  Account starting balance for drawdown calculation
 */
export function computeKPI(
  trades: TradeRecord[],
  initialBalance: number = 0
): KPISummary {
  const closed = trades.filter((t) => t.status === "CLOSED");
  const open = trades.filter((t) => t.status === "OPEN");

  // Only trades with a definitive PnL result
  const closedWithResult = closed.filter((t) => t.pnl !== null && t.pnl !== undefined);
  const winners = closedWithResult.filter((t) => (t.pnl ?? 0) > 0);
  const losers = closedWithResult.filter((t) => (t.pnl ?? 0) < 0);
  const breakEven = closedWithResult.filter((t) => (t.pnl ?? 0) === 0);

  const totalPnL = closedWithResult.reduce((sum, t) => sum + (t.pnl ?? 0), 0);
  const totalFees = trades.reduce((sum, t) => sum + (t.fees ?? 0), 0);

  // Average R (from trades with actualR values)
  const rTrades = closedWithResult.filter((t) => t.actualR !== null && t.actualR !== undefined);
  const totalRR = rTrades.reduce((sum, t) => sum + (t.actualR ?? 0), 0);
  const avgRR = rTrades.length > 0 ? totalRR / rTrades.length : null;

  // Win Rate: only CLOSED trades with definitive PnL
  const winRate =
    closedWithResult.length > 0
      ? (winners.length / closedWithResult.length) * 100
      : null;

  // Profit Factor
  const grossWin = winners.reduce((s, t) => s + (t.pnl ?? 0), 0);
  const grossLoss = Math.abs(losers.reduce((s, t) => s + (t.pnl ?? 0), 0));
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : null;

  // Expectancy (Van Tharp formula): (Win% × AvgWin) - (Loss% × AvgLoss)
  // In R-multiples: (WinRate × AvgWinR) - (LossRate × AvgLossR)
  const winRateDecimal = winRate !== null ? winRate / 100 : null;
  const lossRateDecimal = winRateDecimal !== null ? 1 - winRateDecimal : null;

  const winRTrades = rTrades.filter((t) => (t.pnl ?? 0) > 0);
  const lossRTrades = rTrades.filter((t) => (t.pnl ?? 0) < 0);
  const avgWinR =
    winRTrades.length > 0
      ? winRTrades.reduce((s, t) => s + (t.actualR ?? 0), 0) / winRTrades.length
      : null;
  const avgLossR =
    lossRTrades.length > 0
      ? Math.abs(lossRTrades.reduce((s, t) => s + (t.actualR ?? 0), 0)) / lossRTrades.length
      : null;

  let expectancy: number | null = null;
  let expectancyDetail = null as KPISummary["expectancyDetail"];

  if (winRateDecimal !== null && lossRateDecimal !== null && avgWinR !== null && avgLossR !== null) {
    expectancy = winRateDecimal * avgWinR - lossRateDecimal * avgLossR;
    expectancyDetail = {
      avgWinR: Math.round(avgWinR * 100) / 100,
      avgLossR: Math.round(avgLossR * 100) / 100,
      winRate: Math.round(winRate ?? NaN),
    };
  } else if (avgRR !== null && closedWithResult.length > 0) {
    // Fallback: use average R as simple expectancy
    expectancy = avgRR;
  }

  // Best / Worst
  const pnls = closedWithResult.map((t) => t.pnl ?? 0);
  const bestTrade = pnls.length > 0 ? Math.max(...pnls) : null;
  const worstTrade = pnls.length > 0 ? Math.min(...pnls) : null;

  // Consecutive wins/losses (chronological order)
  const sortedClosed = [...closedWithResult].sort((a, b) => a.tradedAt - b.tradedAt);
  let consW = 0, consL = 0, maxW = 0, maxL = 0;
  for (const t of sortedClosed) {
    const p = t.pnl ?? 0;
    if (p > 0) { consW++; consL = 0; maxW = Math.max(maxW, consW); }
    else if (p < 0) { consL++; consW = 0; maxL = Math.max(maxL, consL); }
    // pnl === 0 = break-even, does not break streak
  }

  // Drawdown: uses initialBalance as base
  const { maxDrawdown, maxDrawdownPercent } = computeDrawdown(
    sortedClosed,
    initialBalance
  );

  return {
    totalTrades: trades.length,
    closedTrades: closed.length,
    openTrades: open.length,
    winningTrades: winners.length,
    losingTrades: losers.length,
    breakEvenTrades: breakEven.length,
    winRate: winRate !== null ? Math.round(winRate) : null,
    totalPnL: Math.round(totalPnL * 100) / 100,
    avgPnL:
      closedWithResult.length > 0
        ? Math.round((totalPnL / closedWithResult.length) * 100) / 100
        : null,
    totalFees: Math.round(totalFees * 100) / 100,
    avgRR: avgRR !== null ? Math.round(avgRR * 100) / 100 : null,
    profitFactor:
      profitFactor !== null && isFinite(profitFactor)
        ? Math.round(profitFactor * 100) / 100
        : profitFactor === Infinity
          ? Infinity
          : null,
    expectancy: expectancy !== null ? Math.round(expectancy * 100) / 100 : null,
    expectancyDetail,
    maxDrawdown: Math.round(maxDrawdown * 100) / 100,
    maxDrawdownPercent:
      maxDrawdownPercent !== null
        ? Math.round(maxDrawdownPercent * 100) / 100
        : null,
    bestTrade: bestTrade !== null ? Math.round(bestTrade * 100) / 100 : null,
    worstTrade: worstTrade !== null ? Math.round(worstTrade * 100) / 100 : null,
    consecutiveWins: maxW,
    consecutiveLosses: maxL,
  };
}

/* ──────────────────────────────
   Drawdown Calculation
   ────────────────────────────── */

function computeDrawdown(
  closedTrades: TradeRecord[],
  initialBalance: number
): { maxDrawdown: number; maxDrawdownPercent: number | null } {
  if (closedTrades.length === 0 || initialBalance <= 0) {
    return { maxDrawdown: 0, maxDrawdownPercent: null };
  }

  let peakEquity = initialBalance;
  let currentEquity = initialBalance;
  let maxDrawdown = 0;
  let maxDrawdownPercent: number | null = null;

  for (const t of closedTrades) {
    // PnL already accounts for fees if the source includes them
    currentEquity += t.pnl ?? 0;

    if (currentEquity > peakEquity) {
      peakEquity = currentEquity;
    }

    const dd = peakEquity - currentEquity;
    if (dd > maxDrawdown) {
      maxDrawdown = dd;
      maxDrawdownPercent = peakEquity > 0 ? (dd / peakEquity) * 100 : null;
    }
  }

  return { maxDrawdown, maxDrawdownPercent };
}

/* ──────────────────────────────
   Cumulative P&L (was "Equity Curve")
   ────────────────────────────── */

export interface CumulativePnLPoint {
  date: string; // YYYY-MM-DD
  cumulativePnL: number;
  pnl: number;
}

export function computeCumulativePnL(
  trades: TradeRecord[],
  granularity: "day" | "week" | "month" | "quarter" | "year"
): CumulativePnLPoint[] {
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
    return {
      date,
      pnl: Math.round(pnl * 100) / 100,
      cumulativePnL: Math.round(running * 100) / 100,
    };
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
    // Session is already assigned based on account timezone at write time
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
  const closed = ts.filter((t) => t.status === "CLOSED" && t.pnl !== null);
  const wins = closed.filter((t) => (t.pnl ?? 0) > 0);
  const losses = closed.filter((t) => (t.pnl ?? 0) < 0);
  const pnl = closed.reduce((s, t) => s + (t.pnl ?? 0), 0);
  const rrValues = closed
    .map((t) => t.actualR ?? 0)
    .filter((r) => r !== 0);
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
  month: number,
  timezone = "UTC"
): CalendarDay[] {
  const monthPrefix = `${year}-${String(month).padStart(2, "0")}`;
  const closed = trades.filter(
    (t) =>
      t.status === "CLOSED" &&
      t.pnl !== null &&
      getDateStrInTz(t.tradedAt, timezone).startsWith(monthPrefix)
  );

  const byDate = new Map<
    string,
    { pnl: number; trades: number; wins: number; losses: number }
  >();

  for (const t of closed) {
    const date = getDateStrInTz(t.tradedAt, timezone);
    const existing = byDate.get(date) ?? {
      pnl: 0,
      trades: 0,
      wins: 0,
      losses: 0,
    };
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

/* ──────────────────────────────
   AI Insights (Broadcast Intel)
   ────────────────────────────── */

export interface AIInsight {
  type: "session" | "direction" | "strategy" | "streak" | "drawdown";
  title: string;
  detail: string;
  metric: number; // 0-100 score for progress bar or highlighting
  trend: "up" | "down" | "neutral";
}

/**
 * Minimum sample size thresholds for drawing conclusions.
 */
const MIN_SAMPLES_FOR_SESSION = 5;
const MIN_SAMPLES_FOR_DIRECTION = 10;
const MIN_SAMPLES_FOR_EDGE = 15;
const MIN_SAMPLES_PER_DIRECTION = 5;

export function computeAIInsights(trades: TradeRecord[]): AIInsight[] {
  const closed = trades.filter((t) => t.status === "CLOSED" && t.pnl !== null);
  if (closed.length === 0) return [];

  const insights: AIInsight[] = [];
  const kpi = computeKPI(trades);

  // 1. Session Insight
  const sessionBreakdown = computeSessionBreakdown(trades);
  const sessionsWithTrades = sessionBreakdown.filter(
    (s) => s.trades >= MIN_SAMPLES_FOR_SESSION
  );

  if (sessionsWithTrades.length > 0) {
    const mostProfitableSession = [...sessionsWithTrades].sort(
      (a, b) => b.totalPnL - a.totalPnL
    )[0];

    if (mostProfitableSession && mostProfitableSession.totalPnL > 0) {
      const totalPnL = closed.reduce((sum, t) => sum + (t.pnl ?? 0), 0);
      const sessionPnL = mostProfitableSession.totalPnL;
      const pct = totalPnL > 0 ? (sessionPnL / totalPnL) * 100 : 0;

      insights.push({
        type: "session",
        title: "Session Performance",
        detail: `Current sample: strongest net results observed during the ${mostProfitableSession.label.toUpperCase()} session (${Math.abs(pct).toFixed(0)}% of total P&L).`,
        metric: Math.min(100, Math.max(0, mostProfitableSession.winRate ?? 0)),
        trend:
          mostProfitableSession.totalPnL > 0 &&
          (mostProfitableSession.winRate ?? 0) > 50
            ? "up"
            : "neutral",
      });
    } else if (sessionsWithTrades.length > 0) {
      // Best of a bad lot — still losing
      const sorted = [...sessionsWithTrades].sort(
        (a, b) => b.totalPnL - a.totalPnL
      );
      insights.push({
        type: "session",
        title: "Session Performance",
        detail: `Current sample: ${sorted[0].label.toUpperCase()} session shows relatively better performance compared to other sessions, though net results remain negative.`,
        metric: Math.min(100, Math.max(0, sorted[0].winRate ?? 0)),
        trend: "neutral",
      });
    }
  } else {
    insights.push({
      type: "session",
      title: "Session Performance",
      detail: `Current sample (${closed.length} closed trades) is insufficient to identify session-based patterns. Continue logging trades to unlock session intelligence.`,
      metric: 0,
      trend: "neutral",
    });
  }

  // 2. Directional Bias
  if (closed.length >= MIN_SAMPLES_FOR_DIRECTION) {
    const directions = computeDirectionBreakdown(trades);
    const long = directions.find((d) => d.label === "LONG");
    const short = directions.find((d) => d.label === "SHORT");

    if (long && short) {
      const longValid = (long.trades ?? 0) >= MIN_SAMPLES_PER_DIRECTION;
      const shortValid = (short.trades ?? 0) >= MIN_SAMPLES_PER_DIRECTION;

      if (longValid && shortValid && closed.length >= MIN_SAMPLES_FOR_EDGE) {
        const longWR = long.winRate ?? 0;
        const shortWR = short.winRate ?? 0;
        const bestDir = longWR > shortWR ? long : short;
        const diff = Math.abs(longWR - shortWR);
        const bestProfitFactor =
          bestDir.totalPnL > 0
            ? Math.abs(bestDir.totalPnL) /
              Math.max(
                1,
                Math.abs(
                  (bestDir.label === "LONG" ? short : long)?.totalPnL ?? 1
                )
              )
            : 0;

        if (diff > 10 && bestProfitFactor > 1.2 && bestDir.totalPnL > 0) {
          insights.push({
            type: "direction",
            title: "Directional Edge",
            detail: `Current sample suggests stronger performance on ${bestDir.label}S (${bestDir.winRate?.toFixed(0)}% win rate, ${diff.toFixed(0)}pp difference). Continue monitoring — this is an observation, not a guarantee.`,
            metric: Math.min(100, bestDir.winRate ?? 0),
            trend: bestDir.totalPnL > 0 ? "up" : "neutral",
          });
        } else {
          insights.push({
            type: "direction",
            title: "Directional Edge",
            detail: `Current sample does not confirm a significant directional edge. LONG: ${long.winRate?.toFixed(0) ?? "N/A"}% WR, SHORT: ${short.winRate?.toFixed(0) ?? "N/A"}% WR. More data needed for a reliable conclusion.`,
            metric: 50,
            trend: "neutral",
          });
        }
      } else {
        insights.push({
          type: "direction",
          title: "Directional Edge",
          detail: `Current sample (${closed.length} closed trades) is insufficient per direction to confirm an edge. LONG: ${long.trades ?? 0} trades, SHORT: ${short.trades ?? 0} trades.`,
          metric: 50,
          trend: "neutral",
        });
      }
    }
  } else {
    insights.push({
      type: "direction",
      title: "Directional Edge",
      detail: `Current sample (${closed.length} closed trades) is below the minimum threshold for directional analysis. Continue building your trade history.`,
      metric: 50,
      trend: "neutral",
    });
  }

  // 3. Risk / Streak Insight
  if (kpi.consecutiveLosses > 2) {
    insights.push({
      type: "streak",
      title: "Consecutive Losses",
      detail: `You've recorded a ${kpi.consecutiveLosses}-trade losing streak. Consider reviewing recent setups for pattern changes. This is not investment advice — maintain your risk management plan.`,
      metric: Math.max(0, 100 - kpi.consecutiveLosses * 10),
      trend: "down",
    });
  } else if (kpi.winRate && kpi.winRate > 60 && closed.length >= 10) {
    insights.push({
      type: "streak",
      title: "High Efficiency",
      detail: `Current strike rate of ${kpi.winRate}% is above average based on this sample. Strategy "${closed[0]?.strategy ?? "Default"}" appears to be performing well — continue monitoring for consistency.`,
      metric: kpi.winRate,
      trend: "up",
    });
  }

  // 4. Drawdown / Capital Preservation (fallback)
  if (insights.length < 2) {
    const ddText =
      kpi.maxDrawdownPercent !== null
        ? `Current max drawdown is ${kpi.maxDrawdownPercent.toFixed(1)}% ($${kpi.maxDrawdown.toFixed(0)}). Maintain stop-loss discipline.`
        : kpi.maxDrawdown > 0
          ? `Current absolute drawdown is $${kpi.maxDrawdown.toFixed(0)}. Set a profit target to enable percentage tracking.`
          : `No significant drawdown observed. Keep following your strategy.`;

    insights.push({
      type: "drawdown",
      title: "Capital Preservation",
      detail: ddText,
      metric:
        kpi.maxDrawdownPercent !== null
          ? Math.max(0, 100 - kpi.maxDrawdownPercent)
          : 100,
      trend:
        kpi.maxDrawdownPercent !== null && kpi.maxDrawdownPercent > 10
          ? "down"
          : "up",
    });
  }

  return insights.slice(0, 3);
}

/**
 * Deterministic user level calculation based on volume.
 */
export function computeUserLevel(tradesCount: number) {
  if (tradesCount === 0) return { level: 1, title: "Rookie" };
  if (tradesCount <= 10) return { level: 5, title: "Apprentice" };
  if (tradesCount <= 50) return { level: 15, title: "Trader" };
  if (tradesCount <= 200) return { level: 42, title: "Pro Analyst" };
  return { level: 99, title: "Elite Strategist" };
}

/* ──────────────────────────────
   Trend Calculation (for KPI arrows)
   ────────────────────────────── */

export interface KpiTrend {
  direction: "up" | "down" | "neutral";
  change: string | null; // formatted change text, e.g. "+6.0 pp"
  insufficientData: boolean;
}

const TREND_WINDOW = 10; // recent N trades for trend comparison

/**
 * Compare recent performance vs prior baseline for a given metric extractor.
 *
 * @param trades      All trades sorted chronologically
 * @param extractFn   Function that extracts a numeric value from a set of trades
 * @param formatter   Function to format the change value as display string
 * @param higherIsBetter  Whether a higher value is positive (green) or negative (red)
 */
export function computeKpiTrend(
  trades: TradeRecord[],
  extractFn: (subset: TradeRecord[]) => number | null,
  formatter: (diff: number) => string,
  _higherIsBetter: boolean = true
): KpiTrend {
  const closed = trades
    .filter((t) => t.status === "CLOSED" && t.pnl !== null)
    .sort((a, b) => a.tradedAt - b.tradedAt);

  if (closed.length < TREND_WINDOW * 2) {
    return {
      direction: "neutral",
      change: null,
      insufficientData: true,
    };
  }

  const recent = closed.slice(-TREND_WINDOW);
  const prior = closed.slice(-TREND_WINDOW * 2, -TREND_WINDOW);

  if (prior.length === 0) {
    return {
      direction: "neutral",
      change: null,
      insufficientData: true,
    };
  }

  const recentVal = extractFn(recent);
  const priorVal = extractFn(prior);

  if (recentVal === null || priorVal === null) {
    return { direction: "neutral", change: null, insufficientData: false };
  }

  const diff = recentVal - priorVal;
  const change = formatter(diff);

  let direction: "up" | "down" | "neutral";
  if (Math.abs(diff) < 0.01) {
    direction = "neutral";
  } else {
    direction = diff > 0 ? "up" : "down";
  }

  return { direction, change, insufficientData: false };
}
