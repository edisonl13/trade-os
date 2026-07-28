/**
 * Apply repository SQL migrations to an existing libSQL database.
 *
 * Local disposable copy:
 *   DATABASE_URL=file:C:/path/copy.db node scripts/migrate-turso.mjs
 *
 * Remote database:
 *   ALLOW_REMOTE_DATABASE_MIGRATION=YES DATABASE_URL=libsql://... \
 *   DATABASE_AUTH_TOKEN=... node scripts/migrate-turso.mjs
 */
import { createClient } from "@libsql/client";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const url = process.env.DATABASE_URL;
const authToken = process.env.DATABASE_AUTH_TOKEN;

if (!url) {
  throw new Error("Missing DATABASE_URL.");
}

const isLocalFile = url.startsWith("file:");
if (!isLocalFile && process.env.ALLOW_REMOTE_DATABASE_MIGRATION !== "YES") {
  throw new Error(
    "Remote migration refused. Set ALLOW_REMOTE_DATABASE_MIGRATION=YES explicitly."
  );
}
if (!isLocalFile && !authToken) {
  throw new Error("Remote migration requires DATABASE_AUTH_TOKEN.");
}

const client = createClient({
  url,
  authToken: authToken || undefined,
});
const migrationsDirectory = resolve(scriptDirectory, "../drizzle");
const files = readdirSync(migrationsDirectory)
  .filter((file) => file.endsWith(".sql"))
  .sort();

let applied = 0;
let alreadyPresent = 0;

function isAlreadyAppliedError(error) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return (
    message.includes("already exists") ||
    message.includes("duplicate column name")
  );
}

try {
  console.log(`Checking ${files.length} migration files against ${isLocalFile ? "local copy" : "remote database"}...`);

  for (const file of files) {
    const sql = readFileSync(resolve(migrationsDirectory, file), "utf8");
    const statements = sql
      .split("--> statement-breakpoint")
      .map((statement) => statement.trim())
      .filter(Boolean);

    for (let index = 0; index < statements.length; index++) {
      try {
        await client.execute(statements[index]);
        applied++;
      } catch (error) {
        if (isAlreadyAppliedError(error)) {
          alreadyPresent++;
          continue;
        }
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(
          `${file} statement ${index + 1}/${statements.length} failed: ${message}`,
          { cause: error }
        );
      }
    }
  }

  console.log(
    `Migration completed: ${applied} statements applied, ${alreadyPresent} already present.`
  );
} finally {
  client.close();
}
