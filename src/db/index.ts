import "server-only";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePg, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { Pool } from "pg";
import * as schema from "./schema";

// Postgres: Neon (or any Postgres) when DATABASE_URL is set, as on Vercel. Without it, an embedded
// PGlite database in ./data/pglite, so local development needs no setup. POSTGRES_URL is the same
// pooled string under the name the Vercel–Neon integration also sets.
const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;

// Connections survive dev hot reloads (PGlite must not open its directory twice); the Drizzle
// wrapper is per module instance, so a reload after a schema change picks up the new tables.
const globalForDb = globalThis as unknown as { pgPool?: Pool; pglite?: PGlite };

export type Db = NodePgDatabase<typeof schema>;

function connect(): Db {
  if (url) {
    globalForDb.pgPool ??= new Pool({ connectionString: url, max: 5 });
    return drizzlePg(globalForDb.pgPool, { schema });
  }
  globalForDb.pglite ??= new PGlite(path.join(process.cwd(), "data", "pglite"));
  // Same query API as node-postgres for everything the app uses.
  return drizzlePglite(globalForDb.pglite, { schema }) as unknown as Db;
}

// Created on first use, never at import: `next build` imports modules in parallel workers, which
// must not all open the database.
let db: Db | undefined;
let ready: Promise<void> | undefined;

/** Returns the database. Locally, pending migrations are applied on first use; on Vercel they run
 * at build time (`npm run vercel-build`), so concurrent cold starts never race on them. */
export async function getDb(): Promise<Db> {
  db ??= connect();
  ready ??= url
    ? Promise.resolve()
    : migratePglite(db as never, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  await ready;
  return db;
}
