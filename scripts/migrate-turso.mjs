/**
 * Apply ALL Drizzle migrations to Turso database.
 * Usage: node scripts/migrate-turso.mjs
 */
import { createClient } from "@libsql/client";
import { readFileSync, readdirSync } from "fs";
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

const migrationsDir = resolve(__dirname, "../drizzle");
const files = readdirSync(migrationsDir)
  .filter(f => f.endsWith(".sql"))
  .sort();

console.log(`Found ${files.length} migration files. Applying to Turso...`);

for (const file of files) {
  console.log(`\nProcessing ${file}...`);
  const sql = readFileSync(resolve(migrationsDir, file), "utf-8");
  
  const statements = sql
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);

  for (let i = 0; i < statements.length; i++) {
    try {
      await client.execute(statements[i]);
      console.log(`  ✓ Statement ${i + 1}/${statements.length}`);
    } catch (err) {
      // Ignore "already exists" errors if re-running
      if (err.message.includes("already exists") || err.message.includes("duplicate column")) {
        console.warn(`  - Skipping (already applied): ${err.message.split(":")[0]}`);
      } else {
        console.error(`  ✗ Statement ${i + 1} failed:`, err.message);
      }
    }
  }
}

console.log("\nAll migrations processed!");
client.close();
