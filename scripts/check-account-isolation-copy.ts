import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@libsql/client";

const databaseUrl = process.argv[2];
if (
  process.env.ALLOW_DISPOSABLE_DB_TEST !== "YES" ||
  !databaseUrl?.startsWith("file:") ||
  !databaseUrl.includes("trade-os-migration-check")
) {
  throw new Error(
    "Isolation test requires ALLOW_DISPOSABLE_DB_TEST=YES and an explicit trade-os-migration-check file URL."
  );
}

async function main() {
  const client = createClient({ url: databaseUrl });
  const suffix = randomUUID();
  const userA = `isolation-user-a-${suffix}`;
  const userB = `isolation-user-b-${suffix}`;
  const accountA = `isolation-account-a-${suffix}`;
  const accountB = `isolation-account-b-${suffix}`;
  const tradeA = `isolation-trade-a-${suffix}`;
  const tradeB = `isolation-trade-b-${suffix}`;
  const now = Date.now();

  try {
    await client.batch(
      [
        {
          sql: "insert into user (id, email) values (?, ?)",
          args: [userA, `${userA}@example.invalid`],
        },
        {
          sql: "insert into user (id, email) values (?, ?)",
          args: [userB, `${userB}@example.invalid`],
        },
        {
          sql: `insert into trading_account
            (id, userId, label, currency, initialBalance, timezone, createdAt, updatedAt)
            values (?, ?, 'A', 'USD', 0, 'UTC', ?, ?)`,
          args: [accountA, userA, now, now],
        },
        {
          sql: `insert into trading_account
            (id, userId, label, currency, initialBalance, timezone, createdAt, updatedAt)
            values (?, ?, 'B', 'USD', 0, 'UTC', ?, ?)`,
          args: [accountB, userB, now, now],
        },
        {
          sql: `insert into trade
            (id, userId, tradingAccountId, symbol, direction, tradedAt, status, source, createdAt, updatedAt)
            values (?, ?, ?, 'EURUSD', 'LONG', ?, 'OPEN', 'MANUAL', ?, ?)`,
          args: [tradeA, userA, accountA, now, now, now],
        },
        {
          sql: `insert into trade
            (id, userId, tradingAccountId, symbol, direction, tradedAt, status, source, createdAt, updatedAt)
            values (?, ?, ?, 'GBPUSD', 'SHORT', ?, 'OPEN', 'MANUAL', ?, ?)`,
          args: [tradeB, userB, accountB, now, now, now],
        },
      ],
      "write"
    );

    const visibleToA = await client.execute({
      sql: "select id from trade where userId = ? order by id",
      args: [userA],
    });
    assert.deepEqual(
      visibleToA.rows.map((row) => String(row.id)),
      [tradeA]
    );

    const foreignAccount = await client.execute({
      sql: "select id from trading_account where id = ? and userId = ?",
      args: [accountB, userA],
    });
    assert.equal(foreignAccount.rows.length, 0);

    const crossUserUpdate = await client.execute({
      sql: "update trade set notes = 'forbidden' where id = ? and userId = ?",
      args: [tradeB, userA],
    });
    assert.equal(crossUserUpdate.rowsAffected, 0);

    const crossUserDelete = await client.execute({
      sql: "delete from trade where id = ? and userId = ?",
      args: [tradeB, userA],
    });
    assert.equal(crossUserDelete.rowsAffected, 0);

    const tradeBStillExists = await client.execute({
      sql: "select notes from trade where id = ? and userId = ?",
      args: [tradeB, userB],
    });
    assert.equal(tradeBStillExists.rows.length, 1);
    assert.notEqual(tradeBStillExists.rows[0].notes, "forbidden");

    console.log(
      "Account isolation copy check passed: list, account ownership, update and delete."
    );
  } finally {
    client.close();
  }
}

void main();
