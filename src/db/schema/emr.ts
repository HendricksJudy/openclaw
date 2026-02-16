/**
 * ClawHospital - Electronic Medical Record Schema
 *
 * Structured clinical documents with AI quality scoring.
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

export const emrDocuments = pgTable(
  "emr_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    visitId: uuid("visit_id").notNull().references(() => visits.id),
    docType: varchar("doc_type", { length: 50 }).notNull(),
    // admission_note, progress_note, discharge_summary, operative_note,
    // consultation_note, nursing_assessment, history_physical, etc.
    templateId: uuid("template_id"),
    content: jsonb("content").notNull(), // structured fields per template
    contentText: text("content_text"), // plain text rendering for full-text search
    authorId: uuid("author_id").notNull().references(() => staff.id),
    signStatus: varchar("sign_status", { length: 20 }).default("draft").notNull(),
    // draft, signed, countersigned, amended, addended
    signedAt: timestamp("signed_at", { withTimezone: true }),
    countersignedBy: uuid("countersigned_by").references(() => staff.id),
    countersignedAt: timestamp("countersigned_at", { withTimezone: true }),
    qualityScore: decimal("quality_score", { precision: 5, scale: 2 }),
    qualityIssues: jsonb("quality_issues").default([]), // [{code, severity, message, field}]
    version: varchar("version", { length: 10 }).default("1").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_emr_visit_id").on(table.visitId),
    index("idx_emr_doc_type").on(table.docType),
    index("idx_emr_author_id").on(table.authorId),
    index("idx_emr_sign_status").on(table.signStatus),
  ],
);

export const emrTemplates = pgTable("emr_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 100 }).notNull(),
  docType: varchar("doc_type", { length: 50 }).notNull(),
  departmentId: uuid("department_id"),
  structure: jsonb("structure").notNull(), // template field definitions
  isActive: varchar("is_active", { length: 5 }).default("true").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type EmrDocument = typeof emrDocuments.$inferSelect;
export type NewEmrDocument = typeof emrDocuments.$inferInsert;
export type EmrTemplate = typeof emrTemplates.$inferSelect;
export type NewEmrTemplate = typeof emrTemplates.$inferInsert;
