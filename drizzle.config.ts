/**
 * ClawHospital - Drizzle ORM Configuration
 *
 * Used by `drizzle-kit` for migrations and studio.
 * Run: npx drizzle-kit generate
 * Run: npx drizzle-kit migrate
 * Run: npx drizzle-kit studio
 */

import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    host: process.env.CLAWHOSPITAL_DB_HOST ?? "localhost",
    port: Number(process.env.CLAWHOSPITAL_DB_PORT ?? 5432),
    database: process.env.CLAWHOSPITAL_DB_NAME ?? "clawhospital",
    user: process.env.CLAWHOSPITAL_DB_USER ?? "clawhospital",
    password: process.env.CLAWHOSPITAL_DB_PASSWORD ?? "clawhospital",
  },
});
