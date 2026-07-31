import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import * as schema from "./schema";

function resolveDatabaseUrl() {
  const configuredUrl =
    process.env.DATABASE_URL ?? process.env.TURSO_DATABASE_URL;
  const isPreviewWithLocalSqlite =
    process.env.VERCEL_ENV === "preview" &&
    (!configuredUrl || configuredUrl.startsWith("file:"));

  if (!isPreviewWithLocalSqlite) {
    return configuredUrl ?? "file:./data/trade-os.db";
  }

  // Vercel functions cannot write to the deployment bundle. Preview builds use
  // a clean schema copied to /tmp so reviewers can sign in and seed demo data.
  // This database is intentionally ephemeral and must never be used for
  // production persistence.
  const runtimePath = join("/tmp", "trade-os-preview.db");
  if (!existsSync(runtimePath)) {
    copyFileSync(
      join(process.cwd(), "data", "preview-template.db"),
      runtimePath
    );
  }

  return `file:${runtimePath}`;
}

const url = resolveDatabaseUrl();
const authToken =
  process.env.DATABASE_AUTH_TOKEN ??
  process.env.TURSO_AUTH_TOKEN ??
  undefined;

const client = createClient({
  url,
  authToken,
});

export const db = drizzle(client, { schema });
