/**
 * ClawHospital - Visit Schema
 *
 * Tracks patient encounters (outpatient, inpatient, emergency).
 */

import {
  pgTable,
  uuid,
  varchar,
  text,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

import { patients } from "./patients.ts";
import { departments } from "./departments.ts";
import { staff } from "./staff.ts";

export const visits = pgTable(
  "visits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    patientId: uuid("patient_id").notNull().references(() => patients.id),
    visitNo: varchar("visit_no", { length: 20 }).unique().notNull(),
    visitType: varchar("visit_type", { length: 15 }).notNull(), // outpatient, inpatient, emergency
    departmentId: uuid("department_id").notNull().references(() => departments.id),
    doctorId: uuid("doctor_id").notNull().references(() => staff.id),
    visitDate: timestamp("visit_date", { withTimezone: true }).notNull(),
    chiefComplaint: text("chief_complaint"),
    diagnosisCodes: jsonb("diagnosis_codes").default([]), // [{code: "J06.9", system: "ICD-10", display: "..."}]
    status: varchar("status", { length: 20 }).default("active").notNull(),
    aiSessionId: varchar("ai_session_id", { length: 100 }), // links to OpenClaw agent session
    bedId: uuid("bed_id"), // for inpatient visits
    admissionDate: timestamp("admission_date", { withTimezone: true }),
    dischargeDate: timestamp("discharge_date", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_visits_patient_id").on(table.patientId),
    index("idx_visits_doctor_id").on(table.doctorId),
    index("idx_visits_department_id").on(table.departmentId),
    index("idx_visits_visit_date").on(table.visitDate),
    index("idx_visits_status").on(table.status),
  ],
);

export type Visit = typeof visits.$inferSelect;
export type NewVisit = typeof visits.$inferInsert;
