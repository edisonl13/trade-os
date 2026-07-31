import assert from "node:assert/strict";
import {
  preflightScreenshotTrades,
  validateScreenshotExtraction,
} from "../src/lib/screenshot-import";

const extracted = validateScreenshotExtraction([
  {
    symbol: " eur_usd ",
    direction: "SHORT",
    entryPrice: 1.101,
    exitPrice: 1.099,
    stopLoss: null,
    targetPrice: null,
    positionSize: 1.25,
    pnl: 250,
    tradedAt: "2026-07-28 14:30:00",
    confidence: 0.82,
    evidence: "EURUSD Sell 1.25 lots · +250",
  },
]);
assert.equal(extracted.length, 1);
assert.equal(extracted[0].symbol, "EUR_USD");
assert.equal(extracted[0].direction, "SHORT");
assert.equal(extracted[0].tradedAt, "2026-07-28 14:30:00");
assert.equal(extracted[0].pnl, 250);
assert.equal(extracted[0].confidence, 0.82);

const missingRequired = preflightScreenshotTrades(
  [{ symbol: "EURUSD", direction: null, tradedAt: null }],
  ""
);
assert.equal(missingRequired.trades.length, 0);
assert.deepEqual(
  missingRequired.errors.map((error) => error.error).sort(),
  ["Missing direction", "Missing trade time"]
);

const missingTimezone = preflightScreenshotTrades(
  [{
    symbol: "EURUSD",
    direction: "LONG",
    tradedAt: "2026-07-28 14:30:00",
    pnl: 100,
  }],
  ""
);
assert.equal(missingTimezone.trades.length, 0);
assert.ok(
  missingTimezone.errors.some(
    (error) => error.error === "Source timezone required"
  )
);

const malaysiaTime = preflightScreenshotTrades(
  [{
    symbol: "EURUSD",
    direction: "LONG",
    tradedAt: "2026-07-28 14:30:00",
    pnl: 100,
  }],
  "Asia/Kuala_Lumpur"
);
assert.equal(malaysiaTime.errors.length, 0);
assert.equal(malaysiaTime.trades.length, 1);
assert.equal(
  new Date(malaysiaTime.trades[0].tradedAtMs).toISOString(),
  "2026-07-28T06:30:00.000Z"
);
assert.equal(malaysiaTime.trades[0].sourceTimezone, "Asia/Kuala_Lumpur");

const explicitUtc = preflightScreenshotTrades(
  [{
    symbol: "BTCUSD",
    direction: "SHORT",
    tradedAt: "2026-07-28T14:30:00Z",
    pnl: -25,
  }],
  ""
);
assert.equal(explicitUtc.errors.length, 0);
assert.equal(explicitUtc.trades[0].sourceTimezone, "UTC");
assert.equal(explicitUtc.trades[0].pnl, -25);

console.log(
  "Screenshot import checks passed (sanitization, required fields, timezone, visible P&L)."
);
