/**
 * ClawHospital - Medical Order Schema
 *
 * Covers drug orders, lab orders, exam orders, and procedures.
 */

import {
  pgTable,
  uuid,
  varchar,
  text,
  jsonb,
  timestamp,
  decimal,
  index,
} from "drizzle-orm/pg-core";

import { visits } from "./visits.ts";
import { staff } from "./staff.ts";

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    visitId: uuid("visit_id").notNull().references(() => visits.id),
    orderNo: varchar("order_no", { length: 20 }).unique().notNull(),
    orderType: varchar("order_type", { length: 20 }).notNull(), // drug, lab, exam, procedure
    orderCategory: varchar("order_category", { length: 15 }), // long_term, temp, stat
    itemCode: varchar("item_code", { length: 50 }).notNull(),
    itemName: varchar("item_name", { length: 200 }).notNull(),
    specification: varchar("specification", { length: 200 }),
    dosage: varchar("dosage", { length: 50 }),
    frequency: varchar("frequency", { length: 50 }),
    route: varchar("route", { length: 50 }), // oral, iv, im, etc.
    quantity: decimal("quantity", { precision: 10, scale: 2 }),
    unit: varchar("unit", { length: 20 }),
    doctorId: uuid("doctor_id").notNull().references(() => staff.id),
    pharmacistId: uuid("pharmacist_id").references(() => staff.id),
    status: varchar("status", { length: 20 }).default("pending").notNull(),
    // pending -> reviewing -> approved -> executing -> completed / stopped / cancelled
    aiReviewResult: jsonb("ai_review_result"), // { approved, warnings[], interactions[], score }
    notes: text("notes"),
    startTime: timestamp("start_time", { withTimezone: true }),
    stopTime: timestamp("stop_time", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_orders_visit_id").on(table.visitId),
    index("idx_orders_doctor_id").on(table.doctorId),
    index("idx_orders_status").on(table.status),
    index("idx_orders_order_type").on(table.orderType),
    index("idx_orders_item_code").on(table.itemCode),
  ],
);

/**
 * Order execution tracking — records each step of order fulfillment.
 */
export const orderExecutions = pgTable(
  "order_executions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id").notNull().references(() => orders.id),
    executorId: uuid("executor_id").notNull().references(() => staff.id),
    action: varchar("action", { length: 30 }).notNull(), // dispensed, administered, collected, reported
    notes: text("notes"),
    executedAt: timestamp("executed_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_order_exec_order_id").on(table.orderId),
  ],
);

export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;
export type OrderExecution = typeof orderExecutions.$inferSelect;
export type NewOrderExecution = typeof orderExecutions.$inferInsert;
