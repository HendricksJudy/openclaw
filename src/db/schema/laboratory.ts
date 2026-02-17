/**
 * ClawHospital - Laboratory Schema
 *
 * Lab test catalog, specimen tracking, test results, and critical value alerts.
 */

import {
  pgTable,
  uuid,
  varchar,
  text,
  jsonb,
  timestamp,
  decimal,
  boolean,
  index,
} from "drizzle-orm/pg-core";

import { orders } from "./orders.ts";
import { staff } from "./staff.ts";
import { patients } from "./patients.ts";
import { visits } from "./visits.ts";

/** Lab test catalog — master list of available lab tests. */
export const labTests = pgTable(
  "lab_tests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: varchar("code", { length: 30 }).unique().notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    category: varchar("category", { length: 50 }).notNull(), // hematology, chemistry, microbiology, urinalysis, etc.
    specimenType: varchar("specimen_type", { length: 50 }).notNull(), // blood, urine, csf, swab, etc.
    containerType: varchar("container_type", { length: 50 }), // EDTA, SST, lithium_heparin, etc.
    unit: varchar("unit", { length: 30 }),
    referenceRange: jsonb("reference_range").default({}),
    // { male: { min, max }, female: { min, max }, pediatric: { min, max } }
    criticalLow: decimal("critical_low", { precision: 10, scale: 4 }),
    criticalHigh: decimal("critical_high", { precision: 10, scale: 4 }),
    turnaroundMinutes: varchar("turnaround_minutes", { length: 10 }), // expected TAT
    price: decimal("price", { precision: 10, scale: 2 }),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_lab_tests_category").on(table.category),
    index("idx_lab_tests_specimen").on(table.specimenType),
  ],
);

/** Specimens — tracks physical samples through the lab pipeline. */
export const specimens = pgTable(
  "specimens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    barcode: varchar("barcode", { length: 30 }).unique().notNull(),
    orderId: uuid("order_id").notNull().references(() => orders.id),
    visitId: uuid("visit_id").notNull().references(() => visits.id),
    patientId: uuid("patient_id").notNull().references(() => patients.id),
    labTestId: uuid("lab_test_id").notNull().references(() => labTests.id),
    specimenType: varchar("specimen_type", { length: 50 }).notNull(),
    collectedBy: uuid("collected_by").references(() => staff.id),
    collectedAt: timestamp("collected_at", { withTimezone: true }),
    receivedBy: uuid("received_by").references(() => staff.id),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    status: varchar("status", { length: 20 }).default("ordered").notNull(),
    // ordered, collected, received, processing, completed, rejected
    rejectionReason: text("rejection_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_specimens_order_id").on(table.orderId),
    index("idx_specimens_patient_id").on(table.patientId),
    index("idx_specimens_status").on(table.status),
    index("idx_specimens_collected_at").on(table.collectedAt),
  ],
);

/** Lab results — individual test result values. */
export const labResults = pgTable(
  "lab_results",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    specimenId: uuid("specimen_id").notNull().references(() => specimens.id),
    orderId: uuid("order_id").notNull().references(() => orders.id),
    labTestId: uuid("lab_test_id").notNull().references(() => labTests.id),
    patientId: uuid("patient_id").notNull().references(() => patients.id),
    value: varchar("value", { length: 100 }),
    numericValue: decimal("numeric_value", { precision: 15, scale: 6 }),
    unit: varchar("unit", { length: 30 }),
    referenceRange: varchar("reference_range", { length: 100 }),
    abnormalFlag: varchar("abnormal_flag", { length: 5 }), // N=normal, L=low, H=high, LL=critical low, HH=critical high
    isCritical: boolean("is_critical").default(false).notNull(),
    criticalNotifiedAt: timestamp("critical_notified_at", { withTimezone: true }),
    criticalNotifiedTo: uuid("critical_notified_to").references(() => staff.id),
    resultedBy: uuid("resulted_by").references(() => staff.id),
    resultedAt: timestamp("resulted_at", { withTimezone: true }),
    verifiedBy: uuid("verified_by").references(() => staff.id),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    status: varchar("status", { length: 20 }).default("pending").notNull(),
    // pending, resulted, verified, amended
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_lab_results_specimen_id").on(table.specimenId),
    index("idx_lab_results_order_id").on(table.orderId),
    index("idx_lab_results_patient_id").on(table.patientId),
    index("idx_lab_results_is_critical").on(table.isCritical),
    index("idx_lab_results_status").on(table.status),
  ],
);

export type LabTest = typeof labTests.$inferSelect;
export type NewLabTest = typeof labTests.$inferInsert;
export type Specimen = typeof specimens.$inferSelect;
export type NewSpecimen = typeof specimens.$inferInsert;
export type LabResult = typeof labResults.$inferSelect;
export type NewLabResult = typeof labResults.$inferInsert;
