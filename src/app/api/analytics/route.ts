import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { trades, tradingAccounts } from "@/db/schema";
import { eq, and, gte, lte } from "drizzle-orm";
import { getWeekdayInTz, getHourInTz, classifySession } from "@/lib/timezone";
import {
  computeKPI,
  computeCumulativePnL,
  computeSessionBreakdown,
  computeWeekdayBreakdown,
  computeDirectionBreakdown,
  computeHeatmap,
  computeCalendarData,
  computeAIInsights,
  computeUserLevel,
  computeKpiTrend,
  computeInstrumentBreakdown,
  computeAnalyticsDataQuality,
  getConfirmedNetPnl,
  type TradeRecord,
} from "@/lib/analytics";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") ?? "kpi";
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const granularity = (searchParams.get("granularity") ?? "month") as
    | "day"
    | "week"
    | "month"
    | "quarter"
    | "year";
  const year = parseInt(
    searchParams.get("year") ?? String(new Date().getFullYear())
  );
  const month = parseInt(
    searchParams.get("month") ?? String(new Date().getMonth() + 1)
  );

  const account = await db.query.tradingAccounts.findFirst({
    where: eq(tradingAccounts.userId, session.user.id),
  });

  // Use the account timezone by default; an explicit query override is only
  // useful for controlled comparisons.
  const tz = searchParams.get("tz") ?? account?.timezone ?? "UTC";

  // Build conditions
  const conditions = [eq(trades.userId, session.user.id)];
  if (from) conditions.push(gte(trades.tradedAt, parseInt(from)));
  if (to) conditions.push(lte(trades.tradedAt, parseInt(to)));

  const rawTrades = (await db.query.trades.findMany({
    where: and(...conditions),
    orderBy: (trades, { asc }) => [asc(trades.tradedAt)],
  })) as unknown as TradeRecord[];

  // Re-compute derived time fields at query time so changing the account
  // timezone also updates existing trades.
  for (const trade of rawTrades) {
    try {
      const utcMs = trade.tradedAt;
      const hour = getHourInTz(utcMs, tz);
      trade.weekDay = getWeekdayInTz(utcMs, tz);
      trade.session = classifySession(hour);
    } catch {
      // Keep the stored fallback if the account has an invalid legacy timezone.
    }
  }

  const dataQuality = computeAnalyticsDataQuality(rawTrades);
  const allTrades = rawTrades.map((trade) => ({
    ...trade,
    // Do not allow a partial collection to look like a complete performance
    // history. Once every closed trade has confirmed net P&L, all result
    // analytics become eligible together.
    pnl: dataQuality.pnlComplete ? getConfirmedNetPnl(trade) : null,
  }));

  // Get account's initial balance for drawdown calculation
  const initialBalance = account?.initialBalance ?? 0;

  const buildTrends = () => {
    const metric = (
      subset: TradeRecord[],
      key: "winRate" | "profitFactor" | "avgRR" | "expectancy" | "maxDrawdownPercent"
    ) => computeKPI(subset, initialBalance)[key];
    return {
      winRate: computeKpiTrend(allTrades, (rows) => metric(rows, "winRate"), (diff) => `${diff >= 0 ? "+" : ""}${diff.toFixed(1)} pp`),
      profitFactor: computeKpiTrend(allTrades, (rows) => metric(rows, "profitFactor"), (diff) => `${diff >= 0 ? "+" : ""}${diff.toFixed(2)}`),
      avgRR: computeKpiTrend(allTrades, (rows) => metric(rows, "avgRR"), (diff) => `${diff >= 0 ? "+" : ""}${diff.toFixed(2)}R`),
      expectancy: computeKpiTrend(allTrades, (rows) => metric(rows, "expectancy"), (diff) => `${diff >= 0 ? "+" : ""}${diff.toFixed(2)}R`),
      maxDrawdown: computeKpiTrend(allTrades, (rows) => metric(rows, "maxDrawdownPercent"), (diff) => `${diff >= 0 ? "+" : ""}${diff.toFixed(1)} pp`),
    };
  };

  switch (type) {
    case "overview": {
      const recentTrades = [...allTrades]
        .sort((a, b) => b.tradedAt - a.tradedAt)
        .slice(0, 4)
        .map((trade) => ({
          id: trade.id,
          symbol: trade.symbol,
          direction: trade.direction,
          strategy: trade.strategy,
          setup: (trade as TradeRecord & { setup?: string | null }).setup ?? null,
          pnl: trade.pnl,
          tradedAt: trade.tradedAt,
          status: trade.status,
        }));

      return NextResponse.json({
        dataQuality,
        kpi: computeKPI(allTrades, initialBalance),
        equityCurve: dataQuality.pnlComplete
          ? computeCumulativePnL(allTrades, "day")
          : [],
        directions: computeDirectionBreakdown(allTrades),
        heatmap: computeHeatmap(allTrades, tz),
        instruments: computeInstrumentBreakdown(allTrades),
        trends: buildTrends(),
        recentTrades,
      });
    }

    case "analyticsBundle": {
      return NextResponse.json({
        dataQuality,
        kpi: computeKPI(allTrades, initialBalance),
        equityCurve: dataQuality.pnlComplete
          ? computeCumulativePnL(allTrades, granularity)
          : [],
        sessions: computeSessionBreakdown(allTrades),
        weekdays: computeWeekdayBreakdown(allTrades),
        directions: computeDirectionBreakdown(allTrades),
        heatmap: computeHeatmap(allTrades, tz),
        instruments: computeInstrumentBreakdown(allTrades),
      });
    }

    case "kpi": {
      const kpi = computeKPI(allTrades, initialBalance);
      return NextResponse.json({ ...kpi, dataQuality });
    }

    case "trends": {
      return NextResponse.json(buildTrends());
    }

    case "equity": {
      const curve = dataQuality.pnlComplete
        ? computeCumulativePnL(allTrades, granularity)
        : [];
      return NextResponse.json(curve);
    }

    case "sessions": {
      const breakdown = computeSessionBreakdown(allTrades);
      return NextResponse.json(breakdown);
    }

    case "weekdays": {
      const breakdown = computeWeekdayBreakdown(allTrades);
      return NextResponse.json(breakdown);
    }

    case "directions": {
      const breakdown = computeDirectionBreakdown(allTrades);
      return NextResponse.json(breakdown);
    }

    case "heatmap": {
      const heatmap = computeHeatmap(allTrades, tz);
      return NextResponse.json(heatmap);
    }

    case "instruments": {
      return NextResponse.json(computeInstrumentBreakdown(allTrades));
    }

    case "calendar": {
      const calendar = computeCalendarData(allTrades, year, month, tz);
      return NextResponse.json(calendar);
    }

    case "insights": {
      const insights = computeAIInsights(allTrades);
      return NextResponse.json(insights);
    }

    case "level": {
      const level = computeUserLevel(allTrades.length);
      return NextResponse.json(level);
    }

    default:
      return NextResponse.json({ error: "Unknown type" }, { status: 400 });
  }
}
