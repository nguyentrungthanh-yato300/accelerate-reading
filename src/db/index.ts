import "server-only";
import fs from "node:fs";
import path from "node:path";
import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import * as schema from "./schema";

const url = process.env.DATABASE_URL ?? "file:./data/reading.db";

// The connection survives dev hot reloads; the Drizzle wrapper and the migration check below are
// per module instance, so a reload after a schema change picks up the new columns and migrations.
const globalForDb = globalThis as unknown as { dbClient?: Client };

function getClient(): Client {
  if (!globalForDb.dbClient) {
    if (url.startsWith("file:")) {
      fs.mkdirSync(path.dirname(path.resolve(url.slice("file:".length))), { recursive: true });
    }
    globalForDb.dbClient = createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN });
  }
  return globalForDb.dbClient;
}

const db = drizzle(getClient(), { schema });
let ready: Promise<void> | undefined;

/** Returns the database, applying pending migrations on first use. */
export async function getDb(): Promise<typeof db> {
  ready ??= (async () => {
    await db.run("PRAGMA foreign_keys = ON");
    await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  })();
  await ready;
  return db;
}
