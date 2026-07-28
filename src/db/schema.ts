import { sqliteTable, text, integer, real, primaryKey, uniqueIndex } from "drizzle-orm/sqlite-core";
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
  monthlyProfitTarget: real("monthlyProfitTarget").default(0),
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
 * One confirmed import attempt and the evidence needed to audit it.
 *
 * Preview requests do not create rows. A row is created only after the file
 * passes preflight and the user confirms the import.
 */
export const importBatches = sqliteTable("import_batch", {
  id: text("id").primaryKey().notNull(),
  userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  tradingAccountId: text("tradingAccountId")
    .notNull()
    .references(() => tradingAccounts.id, { onDelete: "cascade" }),

  /* Source evidence */
  originalFileName: text("originalFileName").notNull(),
  fileFormat: text("fileFormat").notNull(),
  fileHash: text("fileHash").notNull(),
  fileSize: integer("fileSize", { mode: "number" }).notNull(),
  sourcePlatform: text("sourcePlatform"),
  platformDetection: text("platformDetection", {
    enum: ["DETECTED", "USER_SELECTED", "UNKNOWN"],
  })
    .notNull()
    .default("UNKNOWN"),
  sourceKind: text("sourceKind").notNull(),
  adapterVersion: text("adapterVersion").notNull(),

  /* User-confirmed interpretation */
  sourceTimezone: text("sourceTimezone"),
  sourceTimezoneConfirmed: integer("sourceTimezoneConfirmed", {
    mode: "boolean",
  })
    .notNull()
    .default(false),
  pnlMode: text("pnlMode", { enum: ["GROSS", "NET", "UNKNOWN"] })
    .notNull()
    .default("UNKNOWN"),
  feeSignConvention: text("feeSignConvention", {
    enum: ["SIGNED", "COSTS_POSITIVE", "UNKNOWN"],
  })
    .notNull()
    .default("UNKNOWN"),
  feesConfirmed: integer("feesConfirmed", { mode: "boolean" })
    .notNull()
    .default(false),
  accountCurrency: text("accountCurrency"),
  resultCurrencies: text("resultCurrencies").notNull().default("[]"),
  resultCurrencySource: text("resultCurrencySource", {
    enum: ["SOURCE", "ACCOUNT", "MIXED", "UNKNOWN"],
  })
    .notNull()
    .default("UNKNOWN"),

  /* Reconciliation */
  totalRows: integer("totalRows", { mode: "number" }).notNull().default(0),
  validRows: integer("validRows", { mode: "number" }).notNull().default(0),
  invalidRows: integer("invalidRows", { mode: "number" }).notNull().default(0),
  duplicateRows: integer("duplicateRows", { mode: "number" }).notNull().default(0),
  insertedRows: integer("insertedRows", { mode: "number" }).notNull().default(0),
  status: text("status", {
    enum: ["PROCESSING", "COMPLETED", "PARTIAL", "FAILED"],
  })
    .notNull()
    .default("PROCESSING"),
  failureCode: text("failureCode"),
  createdAt: integer("createdAt", { mode: "number" }).notNull(),
  completedAt: integer("completedAt", { mode: "number" }),
});

/**
 * Core trade record.
 */
export const trades = sqliteTable("trade", {
  id: text("id").primaryKey().notNull(),
  userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  tradingAccountId: text("tradingAccountId").notNull().references(() => tradingAccounts.id, { onDelete: "cascade" }),

  /* Identity */
  symbol: text("symbol").notNull(),
  sourceSymbol: text("sourceSymbol"),
  sourceTradeId: text("sourceTradeId"),
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
  initialRiskAmount: real("initialRiskAmount"),

  /*
   * Legacy combined fee field. Keep it until imported records have been
   * reconciled against real broker exports.
   */
  fees: real("fees").default(0),
  commission: real("commission"),
  swap: real("swap"),
  otherFees: real("otherFees"),

  /* Results */
  /*
   * Legacy P&L field. New imports must also describe its meaning through
   * pnlMode and populate netPnl only when the net result is known.
   */
  pnl: real("pnl"),
  grossPnl: real("grossPnl"),
  netPnl: real("netPnl"),
  pnlMode: text("pnlMode", { enum: ["GROSS", "NET", "UNKNOWN"] })
    .notNull()
    .default("UNKNOWN"),
  resultCurrency: text("resultCurrency"),
  resultCurrencySource: text("resultCurrencySource", {
    enum: ["SOURCE", "ACCOUNT", "USER_CONFIRMED", "UNKNOWN"],
  })
    .notNull()
    .default("UNKNOWN"),
  actualR: real("actualR"),
  returnPercent: real("returnPercent"),

  /* Time */
  tradedAt: integer("tradedAt", { mode: "number" }).notNull(),
  closedAt: integer("closedAt", { mode: "number" }),
  sourceTimezone: text("sourceTimezone"),
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
  source: text("source", {
    enum: ["CSV", "MT4_HTML", "SCREENSHOT", "MANUAL"],
  })
    .notNull()
    .default("MANUAL"),
  importBatch: text("importBatch"),
  idempotencyKey: text("idempotencyKey"),
  confirmedByUser: integer("confirmedByUser", { mode: "boolean" })
    .notNull()
    .default(true),
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

/**
 * Login verification codes for email-based authentication.
 */
export const loginCodes = sqliteTable(
  "login_code",
  {
    id: text("id").primaryKey().notNull(),
    email: text("email").notNull(),
    code: text("code").notNull(),
    expiresAt: integer("expiresAt", { mode: "number" }).notNull(),
    attempts: integer("attempts").notNull().default(0),
    usedAt: integer("usedAt", { mode: "number" }),
    createdAt: integer("createdAt", { mode: "number" }).notNull(),
  },
  (table) => ({
    emailIdx: uniqueIndex("login_code_email_idx").on(table.email, table.createdAt),
  })
);
