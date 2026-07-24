import { sqliteTable, text, integer, real, primaryKey } from "drizzle-orm/sqlite-core";
import type { AdapterAccount } from "next-auth/adapters";

/* ──────────────────────────────────────────────
 * NextAuth tables (must use timestamp_ms for adapter compatibility)
 * ────────────────────────────────────────────── */

export const users = sqliteTable("user", {
  id: text("id").primaryKey().notNull(),
  name: text("name"),
  email: text("email").notNull(),
  emailVerified: integer("emailVerified", { mode: "timestamp_ms" }),
  image: text("image"),
});

/**
 * Per-user settings stored separately from the auth user record.
 */
export const userSettings = sqliteTable("user_settings", {
  userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  locale: text("locale").default("en-US"),
  billingEmail: text("billingEmail"),
  subscriptionPlan: text("subscriptionPlan").default("Free"),
  twoFactorEnabled: integer("twoFactorEnabled").default(0),
  createdAt: integer("createdAt", { mode: "number" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "number" }).notNull(),
});

export const accounts = sqliteTable(
  "account",
  {
    userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccount["type"]>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => ({
    compoundKey: primaryKey({ columns: [account.provider, account.providerAccountId] }),
  })
);

export const sessions = sqliteTable("session", {
  sessionToken: text("sessionToken").primaryKey().notNull(),
  userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  expires: integer("expires", { mode: "timestamp_ms" }).notNull(),
});

export const verificationTokens = sqliteTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: integer("expires", { mode: "timestamp_ms" }).notNull(),
  },
  (vt) => ({
    compoundKey: primaryKey({ columns: [vt.identifier, vt.token] }),
  })
);

/* ──────────────────────────────────────────────
 * TRADE//OS domain tables (number mode for ms timestamps)
 * ────────────────────────────────────────────── */

/**
 * Trading accounts – each user can have multiple brokerage accounts.
 */
export const tradingAccounts = sqliteTable("trading_account", {
  id: text("id").primaryKey().notNull(),
  userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  label: text("label").notNull().default("Default"),
  broker: text("broker").default(""),
  currency: text("currency").notNull().default("USD"),
  initialBalance: real("initialBalance").notNull().default(0),
  timezone: text("timezone").notNull().default("UTC"),
  createdAt: integer("createdAt", { mode: "number" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "number" }).notNull(),
});

/**
 * Trade direction.
 */
export const TradeDirection = {
  LONG: "LONG",
  SHORT: "SHORT",
} as const;

/**
 * Trade status.
 */
export const TradeStatus = {
  OPEN: "OPEN",
  CLOSED: "CLOSED",
} as const;

/**
 * Core trade record.
 */
export const trades = sqliteTable("trade", {
  id: text("id").primaryKey().notNull(),
  userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  tradingAccountId: text("tradingAccountId").notNull().references(() => tradingAccounts.id, { onDelete: "cascade" }),

  /* Identity */
  symbol: text("symbol").notNull(),
  direction: text("direction", { enum: ["LONG", "SHORT"] }).notNull(),

  /* Plan */
  entryPrice: real("entryPrice"),
  stopLoss: real("stopLoss"),
  targetPrice: real("targetPrice"),
  plannedRR: real("plannedRR"),

  /* Execution */
  actualEntry: real("actualEntry"),
  actualExit: real("actualExit"),
  positionSize: real("positionSize"),
  fees: real("fees").default(0),

  /* Results */
  pnl: real("pnl"),
  actualR: real("actualR"),
  returnPercent: real("returnPercent"),

  /* Time */
  tradedAt: integer("tradedAt", { mode: "number" }).notNull(),
  closedAt: integer("closedAt", { mode: "number" }),
  timezone: text("timezone").notNull().default("UTC"),

  /* Derived time dimensions */
  weekDay: integer("weekDay"),
  session: text("session"),

  /* Classification */
  strategy: text("strategy"),
  setup: text("setup"),
  notes: text("notes"),

  /* Status */
  status: text("status", { enum: ["OPEN", "CLOSED"] }).notNull().default("OPEN"),

  /* Audit */
  source: text("source", { enum: ["CSV", "SCREENSHOT", "MANUAL"] }).notNull().default("MANUAL"),
  importBatch: text("importBatch"),
  idempotencyKey: text("idempotencyKey"),
  createdAt: integer("createdAt", { mode: "number" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "number" }).notNull(),
});

/**
 * Screenshot evidence for a trade.
 */
export const tradeScreenshots = sqliteTable("trade_screenshot", {
  id: text("id").primaryKey().notNull(),
  tradeId: text("tradeId").notNull().references(() => trades.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  extractedFields: text("extractedFields"),
  createdAt: integer("createdAt", { mode: "number" }).notNull(),
});

/**
 * Tags for trades (many-to-many via tag assignment).
 */
export const tags = sqliteTable("tag", {
  id: text("id").primaryKey().notNull(),
  userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  color: text("color").default("#6366F1"),
});

export const tradeTags = sqliteTable("trade_tag", {
  tradeId: text("tradeId").notNull().references(() => trades.id, { onDelete: "cascade" }),
  tagId: text("tagId").notNull().references(() => tags.id, { onDelete: "cascade" }),
});

/**
 * CSV import mapping templates – saved per user per broker.
 */
export const csvMappings = sqliteTable("csv_mapping", {
  id: text("id").primaryKey().notNull(),
  userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  broker: text("broker").notNull().default(""),
  mapping: text("mapping").notNull(),
  createdAt: integer("createdAt", { mode: "number" }).notNull(),
});
