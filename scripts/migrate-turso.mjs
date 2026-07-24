/**
 * Apply Drizzle migration to Turso database.
 * Run: node scripts/migrate-turso.mjs
 */
import { createClient } from "@libsql/client";
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const url = process.env.DATABASE_URL;
const authToken = process.env.DATABASE_AUTH_TOKEN;

if (!url || !authToken) {
  console.error("Missing DATABASE_URL or DATABASE_AUTH_TOKEN env vars");
  process.exit(1);
}

const client = createClient({ url, authToken });

const sql = readFileSync(resolve(__dirname, "../drizzle/0000_lazy_peter_quill.sql"), "utf-8");

// Split by statement-breakpoint
const statements = sql
  .split("--> statement-breakpoint")
  .map((s) => s.trim())
  .filter(Boolean);

console.log(`Applying ${statements.length} migration statements to Turso...`);

for (let i = 0; i < statements.length; i++) {
  try {
    await client.execute(statements[i]);
    console.log(`  ✓ Statement ${i + 1}/${statements.length}`);
  } catch (err) {
    console.error(`  ✗ Statement ${i + 1} failed:`, err.message);
  }
}

console.log("\nMigration complete!");
client.close();
