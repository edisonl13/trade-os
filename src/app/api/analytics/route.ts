import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { trades } from "@/db/schema";
import { eq, and, gte, lte } from "drizzle-orm";
import {
  computeKPI,
  computeEquityCurve,
  computeSessionBreakdown,
  computeWeekdayBreakdown,
  computeDirectionBreakdown,
  computeHeatmap,
  computeCalendarData,
  computeAIInsights,
  computeUserLevel,
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
  const year = parseInt(searchParams.get("year") ?? String(new Date().getFullYear()));
  const month = parseInt(searchParams.get("month") ?? String(new Date().getMonth() + 1));

  // Build conditions
  const conditions = [eq(trades.userId, session.user.id)];
  if (from) conditions.push(gte(trades.tradedAt, parseInt(from)));
  if (to) conditions.push(lte(trades.tradedAt, parseInt(to)));

  const allTrades = (await db.query.trades.findMany({
    where: and(...conditions),
    orderBy: (trades, { asc }) => [asc(trades.tradedAt)],
  })) as unknown as TradeRecord[];

  switch (type) {
    case "kpi": {
      const kpi = computeKPI(allTrades);
      return NextResponse.json(kpi);
    }

    case "equity": {
      const curve = computeEquityCurve(allTrades, granularity);
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
      const heatmap = computeHeatmap(allTrades);
      return NextResponse.json(heatmap);
    }

    case "calendar": {
      const calendar = computeCalendarData(allTrades, year, month);
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
