import { defineConfig } from "drizzle-kit";

// `db:generate` only needs the schema. `db:migrate` needs DATABASE_URL (Neon); locally the app
// migrates its embedded PGlite database itself. Migrations prefer Neon's direct connection: the
// pooled DATABASE_URL suits the app's short serverless queries, not schema changes.
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url:
      process.env.DATABASE_URL_UNPOOLED ||
      process.env.POSTGRES_URL_NON_POOLING ||
      process.env.DATABASE_URL ||
      process.env.POSTGRES_URL ||
      "",
  },
});
