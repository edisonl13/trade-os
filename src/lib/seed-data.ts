/**
 * TRADE//OS Demo / Seed Data
 *
 * Realistic demo trades spanning 3 months.
 * Used for the "Demo Mode" onboarding flow.
 */

export interface DemoSeedTrade {
  symbol: string;
  direction: "LONG" | "SHORT";
  entryPrice: number;
  exitPrice: number | null;
  stopLoss: number | null;
  targetPrice: number | null;
  positionSize: number;
  pnl: number | null;
  tradedAt: string;
  closedAt: string | null;
  strategy: string;
  session: string;
}

/**
 * Generate 30 realistic demo trades across 3 months.
 * Returns trades sorted by date (ascending).
 */
export function getDemoTrades(): DemoSeedTrade[] {
  const now = new Date();
  const trades: DemoSeedTrade[] = [
    // ── Month -3 ──
    { symbol: "EURUSD", direction: "LONG", entryPrice: 1.08250, exitPrice: 1.09120, stopLoss: 1.07900, targetPrice: 1.09300, positionSize: 0.10, pnl: 87.00, tradedAt: subMonth(now, 75), closedAt: subMonth(now, 75), strategy: "Trend Follow", session: "london" },
    { symbol: "GBPUSD", direction: "SHORT", entryPrice: 1.26800, exitPrice: 1.25950, stopLoss: 1.27200, targetPrice: 1.25700, positionSize: 0.15, pnl: 127.50, tradedAt: subMonth(now, 73), closedAt: subMonth(now, 73), strategy: "Breakout", session: "ny" },
    { symbol: "XAUUSD", direction: "LONG", entryPrice: 2310.50, exitPrice: 2335.20, stopLoss: 2302.00, targetPrice: 2340.00, positionSize: 0.05, pnl: 123.50, tradedAt: subMonth(now, 70), closedAt: subMonth(now, 70), strategy: "Trend Follow", session: "asia" },
    { symbol: "USDJPY", direction: "LONG", entryPrice: 149.200, exitPrice: 150.100, stopLoss: 148.800, targetPrice: 150.500, positionSize: 0.12, pnl: 108.00, tradedAt: subMonth(now, 68), closedAt: subMonth(now, 68), strategy: "Momentum", session: "london" },
    { symbol: "EURUSD", direction: "SHORT", entryPrice: 1.08800, exitPrice: 1.08350, stopLoss: 1.09100, targetPrice: 1.08100, positionSize: 0.10, pnl: 45.00, tradedAt: subMonth(now, 66), closedAt: subMonth(now, 66), strategy: "Reversal", session: "ny" },
    { symbol: "BTCUSD", direction: "LONG", entryPrice: 62500, exitPrice: 64800, stopLoss: 61800, targetPrice: 65500, positionSize: 0.01, pnl: 23.00, tradedAt: subMonth(now, 64), closedAt: subMonth(now, 64), strategy: "Momentum", session: "asia" },
    { symbol: "GBPJPY", direction: "SHORT", entryPrice: 186.800, exitPrice: 185.200, stopLoss: 187.500, targetPrice: 184.500, positionSize: 0.08, pnl: 128.00, tradedAt: subMonth(now, 62), closedAt: subMonth(now, 62), strategy: "Breakout", session: "london" },
    { symbol: "AUDUSD", direction: "LONG", entryPrice: 0.65100, exitPrice: 0.65850, stopLoss: 0.64800, targetPrice: 0.66100, positionSize: 0.20, pnl: 150.00, tradedAt: subMonth(now, 60), closedAt: subMonth(now, 60), strategy: "Trend Follow", session: "asia" },
    { symbol: "EURUSD", direction: "LONG", entryPrice: 1.08500, exitPrice: null, stopLoss: 1.08000, targetPrice: 1.09600, positionSize: 0.10, pnl: null, tradedAt: subMonth(now, 58), closedAt: null, strategy: "Trend Follow", session: "london" },
    { symbol: "USDCAD", direction: "SHORT", entryPrice: 1.36200, exitPrice: 1.35500, stopLoss: 1.36500, targetPrice: 1.35200, positionSize: 0.15, pnl: 105.00, tradedAt: subMonth(now, 56), closedAt: subMonth(now, 56), strategy: "Reversal", session: "ny" },

    // ── Month -2 ──
    { symbol: "XAUUSD", direction: "SHORT", entryPrice: 2340.00, exitPrice: 2322.50, stopLoss: 2348.00, targetPrice: 2315.00, positionSize: 0.05, pnl: -87.50, tradedAt: subMonth(now, 50), closedAt: subMonth(now, 50), strategy: "Reversal", session: "ny" },
    { symbol: "GBPUSD", direction: "LONG", entryPrice: 1.26400, exitPrice: 1.27150, stopLoss: 1.26000, targetPrice: 1.27500, positionSize: 0.12, pnl: 90.00, tradedAt: subMonth(now, 48), closedAt: subMonth(now, 48), strategy: "Trend Follow", session: "london" },
    { symbol: "USDJPY", direction: "SHORT", entryPrice: 150.800, exitPrice: 149.900, stopLoss: 151.200, targetPrice: 149.500, positionSize: 0.10, pnl: 90.00, tradedAt: subMonth(now, 46), closedAt: subMonth(now, 46), strategy: "Breakout", session: "asia" },
    { symbol: "EURJPY", direction: "LONG", entryPrice: 163.200, exitPrice: 164.500, stopLoss: 162.500, targetPrice: 165.000, positionSize: 0.08, pnl: 104.00, tradedAt: subMonth(now, 44), closedAt: subMonth(now, 44), strategy: "Momentum", session: "london" },
    { symbol: "BTCUSD", direction: "SHORT", entryPrice: 64200, exitPrice: 63800, stopLoss: 64800, targetPrice: 63500, positionSize: 0.01, pnl: 4.00, tradedAt: subMonth(now, 42), closedAt: subMonth(now, 42), strategy: "Reversal", session: "ny" },
    { symbol: "GBPUSD", direction: "SHORT", entryPrice: 1.27000, exitPrice: 1.26500, stopLoss: 1.27300, targetPrice: 1.26200, positionSize: 0.10, pnl: -50.00, tradedAt: subMonth(now, 40), closedAt: subMonth(now, 40), strategy: "Breakout", session: "london" },
    { symbol: "XAGUSD", direction: "LONG", entryPrice: 27.80, exitPrice: 28.45, stopLoss: 27.40, targetPrice: 28.80, positionSize: 0.50, pnl: 32.50, tradedAt: subMonth(now, 38), closedAt: subMonth(now, 38), strategy: "Trend Follow", session: "asia" },
    { symbol: "EURUSD", direction: "LONG", entryPrice: 1.08600, exitPrice: 1.08950, stopLoss: 1.08300, targetPrice: 1.09200, positionSize: 0.15, pnl: 52.50, tradedAt: subMonth(now, 36), closedAt: subMonth(now, 36), strategy: "Momentum", session: "london" },
    { symbol: "AUDUSD", direction: "SHORT", entryPrice: 0.65500, exitPrice: 0.65150, stopLoss: 0.65800, targetPrice: 0.64900, positionSize: 0.18, pnl: -63.00, tradedAt: subMonth(now, 34), closedAt: subMonth(now, 34), strategy: "Reversal", session: "ny" },
    { symbol: "USDJPY", direction: "LONG", entryPrice: 149.600, exitPrice: null, stopLoss: 149.000, targetPrice: 151.000, positionSize: 0.10, pnl: null, tradedAt: subMonth(now, 32), closedAt: null, strategy: "Trend Follow", session: "asia" },

    // ── Month -1 (Recent) ──
    { symbol: "EURUSD", direction: "SHORT", entryPrice: 1.09000, exitPrice: 1.08400, stopLoss: 1.09300, targetPrice: 1.08100, positionSize: 0.12, pnl: 72.00, tradedAt: subMonth(now, 28), closedAt: subMonth(now, 28), strategy: "Breakout", session: "london" },
    { symbol: "XAUUSD", direction: "LONG", entryPrice: 2330.00, exitPrice: 2348.50, stopLoss: 2322.00, targetPrice: 2355.00, positionSize: 0.05, pnl: 92.50, tradedAt: subMonth(now, 26), closedAt: subMonth(now, 26), strategy: "Trend Follow", session: "ny" },
    { symbol: "GBPUSD", direction: "LONG", entryPrice: 1.26600, exitPrice: 1.27350, stopLoss: 1.26200, targetPrice: 1.27600, positionSize: 0.10, pnl: -75.00, tradedAt: subMonth(now, 24), closedAt: subMonth(now, 24), strategy: "Momentum", session: "london" },
    { symbol: "USDJPY", direction: "SHORT", entryPrice: 150.200, exitPrice: 149.400, stopLoss: 150.600, targetPrice: 149.000, positionSize: 0.12, pnl: 96.00, tradedAt: subMonth(now, 22), closedAt: subMonth(now, 22), strategy: "Reversal", session: "asia" },
    { symbol: "BTCUSD", direction: "LONG", entryPrice: 63500, exitPrice: 65200, stopLoss: 62800, targetPrice: 66000, positionSize: 0.01, pnl: 17.00, tradedAt: subMonth(now, 20), closedAt: subMonth(now, 20), strategy: "Momentum", session: "ny" },
    { symbol: "EURJPY", direction: "SHORT", entryPrice: 164.800, exitPrice: 163.600, stopLoss: 165.200, targetPrice: 163.000, positionSize: 0.08, pnl: -96.00, tradedAt: subMonth(now, 18), closedAt: subMonth(now, 18), strategy: "Breakout", session: "london" },
    { symbol: "GBPJPY", direction: "LONG", entryPrice: 187.200, exitPrice: 188.600, stopLoss: 186.500, targetPrice: 189.200, positionSize: 0.06, pnl: 84.00, tradedAt: subMonth(now, 16), closedAt: subMonth(now, 16), strategy: "Trend Follow", session: "asia" },
    { symbol: "XAUUSD", direction: "SHORT", entryPrice: 2355.00, exitPrice: 2340.00, stopLoss: 2362.00, targetPrice: 2335.00, positionSize: 0.05, pnl: -75.00, tradedAt: subMonth(now, 14), closedAt: subMonth(now, 14), strategy: "Reversal", session: "ny" },
    { symbol: "EURUSD", direction: "LONG", entryPrice: 1.08400, exitPrice: 1.08800, stopLoss: 1.08100, targetPrice: 1.09100, positionSize: 0.15, pnl: -60.00, tradedAt: subMonth(now, 10), closedAt: subMonth(now, 10), strategy: "Trend Follow", session: "london" },
    { symbol: "AUDUSD", direction: "LONG", entryPrice: 0.65300, exitPrice: null, stopLoss: 0.64900, targetPrice: 0.66200, positionSize: 0.20, pnl: null, tradedAt: subMonth(now, 5), closedAt: null, strategy: "Momentum", session: "asia" },
  ];

  return trades;
}

function subMonth(from: Date, daysAgo: number): string {
  const d = new Date(from);
  d.setDate(d.getDate() - daysAgo);
  // Set to trading hours (between 8:00 and 16:00 UTC)
  d.setUTCHours(8 + Math.floor(Math.random() * 8), Math.floor(Math.random() * 60), 0, 0);
  // Skip weekends - move to Friday if weekend
  const day = d.getUTCDay();
  if (day === 0) d.setUTCDate(d.getUTCDate() - 2); // Sunday -> Friday
  if (day === 6) d.setUTCDate(d.getUTCDate() - 1); // Saturday -> Friday
  return d.toISOString();
}
