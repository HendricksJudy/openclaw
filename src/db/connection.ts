/**
 * ClawHospital - Database Connection Layer
 *
 * PostgreSQL connection pool management using Drizzle ORM.
 * Falls back to environment variables for configuration.
 */

import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

import * as patients from "./schema/patients.ts";
import * as visits from "./schema/visits.ts";
import * as orders from "./schema/orders.ts";
import * as emr from "./schema/emr.ts";
import * as staff from "./schema/staff.ts";
import * as auth from "./schema/auth.ts";
import * as audit from "./schema/audit.ts";
import * as departments from "./schema/departments.ts";
import * as pharmacy from "./schema/pharmacy.ts";
import * as laboratory from "./schema/laboratory.ts";
import * as scheduling from "./schema/scheduling.ts";
import * as finance from "./schema/finance.ts";

const schema = {
  ...patients,
  ...visits,
  ...orders,
  ...emr,
  ...staff,
  ...auth,
  ...audit,
  ...departments,
  ...pharmacy,
  ...laboratory,
  ...scheduling,
  ...finance,
};

export type HospitalSchema = typeof schema;

let pool: pg.Pool | undefined;
let db: ReturnType<typeof drizzle<HospitalSchema>> | undefined;

export function getConnectionConfig(): pg.PoolConfig {
  return {
    host: process.env.CLAWHOSPITAL_DB_HOST ?? "localhost",
    port: Number(process.env.CLAWHOSPITAL_DB_PORT ?? 5432),
    database: process.env.CLAWHOSPITAL_DB_NAME ?? "clawhospital",
    user: process.env.CLAWHOSPITAL_DB_USER ?? "clawhospital",
    password: process.env.CLAWHOSPITAL_DB_PASSWORD ?? "clawhospital",
    max: Number(process.env.CLAWHOSPITAL_DB_POOL_MAX ?? 20),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  };
}

export function getPool(): pg.Pool {
  if (!pool) {
    pool = new pg.Pool(getConnectionConfig());
    pool.on("error", (err) => {
      console.error("[clawhospital:db] Unexpected pool error:", err.message);
    });
  }
  return pool;
}

export function getDb() {
  if (!db) {
    db = drizzle(getPool(), { schema });
  }
  return db;
}

export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
    db = undefined;
  }
}

export { schema };
