import { defineConfig } from "drizzle-kit";

// `db:generate` only needs the schema. `db:migrate` needs DATABASE_URL (Neon); locally the app
// migrates its embedded PGlite database itself.
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
