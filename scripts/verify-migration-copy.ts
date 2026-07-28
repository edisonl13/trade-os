import { createClient } from "@libsql/client";
import assert from "node:assert/strict";

const databaseUrl = process.argv[2];
if (!databaseUrl?.startsWith("file:")) {
  throw new Error("Pass an explicit file: URL for a disposable database copy.");
}

async function main() {
  const client = createClient({ url: databaseUrl });
  try {
    const tradeColumns = await client.execute("pragma table_info('trade')");
    const columnNames = tradeColumns.rows.map((row) => String(row.name));
    const requiredColumns = [
      "sourceSymbol",
      "sourceTradeId",
      "initialRiskAmount",
      "commission",
      "swap",
      "otherFees",
      "grossPnl",
      "netPnl",
      "pnlMode",
      "sourceTimezone",
      "confirmedByUser",
      "resultCurrency",
      "resultCurrencySource",
    ];
    const missingColumns = requiredColumns.filter(
      (column) => !columnNames.includes(column)
    );
    if (missingColumns.length > 0) {
      const tables = await client.execute(
        "select name from sqlite_master where type = 'table' order by name"
      );
      let migrationRows: unknown[] = [];
      try {
        const migrations = await client.execute(
          "select * from __drizzle_migrations order by created_at"
        );
        migrationRows = [...migrations.rows];
      } catch {
        // The missing migration table is itself useful diagnostic evidence.
      }
      console.error("Tables:", tables.rows);
      console.error("Migration rows:", migrationRows);
      throw new Error(`Missing migrated columns: ${missingColumns.join(", ")}`);
    }

    const loginCodeTable = await client.execute(
      "select name from sqlite_master where type = 'table' and name = 'login_code'"
    );
    if (loginCodeTable.rows.length !== 1) {
      throw new Error("login_code table is missing after migration.");
    }

    const importBatchColumns = await client.execute(
      "pragma table_info('import_batch')"
    );
    const importBatchColumnNames = importBatchColumns.rows.map((row) =>
      String(row.name)
    );
    const requiredImportBatchColumns = [
      "id",
      "userId",
      "tradingAccountId",
      "originalFileName",
      "fileFormat",
      "fileHash",
      "fileSize",
      "sourcePlatform",
      "platformDetection",
      "sourceKind",
      "adapterVersion",
      "sourceTimezone",
      "sourceTimezoneConfirmed",
      "pnlMode",
      "feeSignConvention",
      "feesConfirmed",
      "accountCurrency",
      "resultCurrencies",
      "resultCurrencySource",
      "totalRows",
      "validRows",
      "invalidRows",
      "duplicateRows",
      "insertedRows",
      "status",
      "failureCode",
      "createdAt",
      "completedAt",
    ];
    const missingImportBatchColumns = requiredImportBatchColumns.filter(
      (column) => !importBatchColumnNames.includes(column)
    );
    if (missingImportBatchColumns.length > 0) {
      throw new Error(
        `Missing import_batch columns: ${missingImportBatchColumns.join(", ")}`
      );
    }

    const testSuffix = Date.now().toString(36);
    const testUserId = `migration-check-user-${testSuffix}`;
    const testAccountId = `migration-check-account-${testSuffix}`;
    const testBatchId = `migration-check-batch-${testSuffix}`;
    try {
      await client.execute({
        sql: "insert into user (id, email) values (?, ?)",
        args: [testUserId, `${testUserId}@example.invalid`],
      });
      await client.execute({
        sql: `
          insert into trading_account
            (id, userId, label, currency, initialBalance, timezone, createdAt, updatedAt)
          values (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        args: [
          testAccountId,
          testUserId,
          "Migration check",
          "USD",
          0,
          "UTC",
          Date.now(),
          Date.now(),
        ],
      });
      await client.execute({
        sql: `
          insert into import_batch
            (
              id, userId, tradingAccountId, originalFileName, fileFormat,
              fileHash, fileSize, sourcePlatform, platformDetection,
              sourceKind, adapterVersion, sourceTimezone,
              sourceTimezoneConfirmed, pnlMode, feeSignConvention,
              feesConfirmed, accountCurrency, resultCurrencies,
              resultCurrencySource, totalRows, validRows,
              invalidRows, duplicateRows, insertedRows, status, createdAt
            )
          values
            (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        args: [
          testBatchId,
          testUserId,
          testAccountId,
          "duplicate.csv",
          "CSV",
          "migration-check-sha256",
          128,
          "oanda",
          "DETECTED",
          "TRADE_HISTORY",
          "migration-check",
          "UTC",
          1,
          "NET",
          "UNKNOWN",
          0,
          "USD",
          '["USD"]',
          "ACCOUNT",
          10,
          10,
          0,
          0,
          0,
          "PROCESSING",
          Date.now(),
        ],
      });
      await client.execute({
        sql: `
          update import_batch
          set duplicateRows = ?, insertedRows = ?, status = ?, completedAt = ?
          where id = ? and userId = ?
        `,
        args: [10, 0, "COMPLETED", Date.now(), testBatchId, testUserId],
      });
      const batchResult = await client.execute({
        sql: `
          select sourcePlatform, sourceKind, resultCurrencies,
                 resultCurrencySource, duplicateRows, insertedRows, status
          from import_batch
          where id = ? and userId = ?
        `,
        args: [testBatchId, testUserId],
      });
      assert.equal(batchResult.rows.length, 1);
      assert.equal(batchResult.rows[0].sourcePlatform, "oanda");
      assert.equal(batchResult.rows[0].sourceKind, "TRADE_HISTORY");
      assert.equal(batchResult.rows[0].resultCurrencies, '["USD"]');
      assert.equal(batchResult.rows[0].resultCurrencySource, "ACCOUNT");
      assert.equal(Number(batchResult.rows[0].duplicateRows), 10);
      assert.equal(Number(batchResult.rows[0].insertedRows), 0);
      assert.equal(batchResult.rows[0].status, "COMPLETED");
    } finally {
      await client.execute({
        sql: "delete from import_batch where id = ?",
        args: [testBatchId],
      });
      await client.execute({
        sql: "delete from trading_account where id = ?",
        args: [testAccountId],
      });
      await client.execute({
        sql: "delete from user where id = ?",
        args: [testUserId],
      });
    }

    console.log(
      `Migration copy verified: ${requiredColumns.length} new trade columns; ` +
        `login_code present; import_batch has ${requiredImportBatchColumns.length} columns; ` +
        "batch write/update/read passed."
    );
  } finally {
    client.close();
  }
}

void main();
