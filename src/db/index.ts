import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "./schema";

const url = process.env.DATABASE_URL ?? "file:./data/trade-os.db";
const authToken = process.env.DATABASE_AUTH_TOKEN ?? undefined;

const client = createClient({
  url,
  authToken,
});

export const db = drizzle(client, { schema });
