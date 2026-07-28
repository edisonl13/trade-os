import { createClient } from "@libsql/client";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const outputPath = join(root, "data", "preview-template.db");
const migrations = [
  "0000_lazy_peter_quill.sql",
  "0001_known_hex.sql",
  "0002_fat_loki.sql",
  "0003_daily_rawhide_kid.sql",
  "0004_slippery_obadiah_stane.sql",
];

if (existsSync(outputPath)) {
  unlinkSync(outputPath);
}

const client = createClient({ url: `file:${outputPath}` });

try {
  for (const migration of migrations) {
    const sql = readFileSync(join(root, "drizzle", migration), "utf8");
    await client.executeMultiple(sql);
  }
} finally {
  client.close();
}

console.log(`Created clean preview database: ${outputPath}`);
