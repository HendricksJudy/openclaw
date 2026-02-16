/**
 * ClawHospital - Audit Log Schema
 *
 * Immutable audit trail for all clinical and administrative operations.
 * Designed for append-only writes; rows should never be updated or deleted.
 */

import {
  pgTable,
  bigserial,
  uuid,
  varchar,
  text,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    operatorId: uuid("operator_id").notNull(),
    operatorName: varchar("operator_name", { length: 100 }),
    action: varchar("action", { length: 50 }).notNull(),
    // create, read, update, delete, sign, approve, reject, login, logout, export, print
    resourceType: varchar("resource_type", { length: 50 }).notNull(),
    // patient, visit, order, emr, user, role, schedule, etc.
    resourceId: varchar("resource_id", { length: 100 }),
    detail: jsonb("detail"), // { before: {...}, after: {...}, reason: "..." }
    channel: varchar("channel", { length: 30 }), // web, whatsapp, telegram, api, etc.
    ipAddress: varchar("ip_address", { length: 45 }),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_audit_operator_id").on(table.operatorId),
    index("idx_audit_resource_type").on(table.resourceType),
    index("idx_audit_resource_id").on(table.resourceId),
    index("idx_audit_action").on(table.action),
    index("idx_audit_created_at").on(table.createdAt),
  ],
);

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
