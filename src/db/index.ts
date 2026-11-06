import "server-only";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import * as schema from "./schema";

const url = process.env.DATABASE_URL ?? "file:./data/reading.db";

function createDb() {
  if (url.startsWith("file:")) {
    fs.mkdirSync(path.dirname(path.resolve(url.slice("file:".length))), { recursive: true });
  }
  const client = createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN });
  return drizzle(client, { schema });
}

type Db = ReturnType<typeof createDb>;

const globalForDb = globalThis as unknown as { db?: Db; dbReady?: Promise<void> };

/** Returns the database, applying pending migrations on first use. */
export async function getDb(): Promise<Db> {
  globalForDb.db ??= createDb();
  globalForDb.dbReady ??= (async () => {
    await globalForDb.db!.run("PRAGMA foreign_keys = ON");
    await migrate(globalForDb.db!, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  })();
  await globalForDb.dbReady;
  return globalForDb.db;
}
