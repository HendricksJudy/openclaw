/**
 * ClawHospital - Pharmacy Schema
 *
 * Drug catalog, inventory management, dispensing records, and interaction tracking.
 */

import {
  pgTable,
  uuid,
  varchar,
  text,
  jsonb,
  timestamp,
  decimal,
  integer,
  boolean,
  date,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { orders } from "./orders.ts";
import { staff } from "./staff.ts";
import { patients } from "./patients.ts";
import { visits } from "./visits.ts";

/** Drug catalog — master list of all available medications. */
export const drugs = pgTable(
  "drugs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: varchar("code", { length: 30 }).unique().notNull(),
    genericName: varchar("generic_name", { length: 200 }).notNull(),
    brandName: varchar("brand_name", { length: 200 }),
    dosageForm: varchar("dosage_form", { length: 50 }).notNull(), // tablet, capsule, injection, syrup, etc.
    strength: varchar("strength", { length: 50 }).notNull(), // 500mg, 10mg/ml, etc.
    unit: varchar("unit", { length: 20 }).notNull(), // tablet, vial, ml, etc.
    manufacturer: varchar("manufacturer", { length: 200 }),
    category: varchar("category", { length: 50 }), // antibiotic, analgesic, antihypertensive, etc.
    controlLevel: varchar("control_level", { length: 10 }).default("normal"), // normal, controlled, narcotic
    requiresReview: boolean("requires_review").default(false).notNull(),
    contraindications: jsonb("contraindications").default([]), // [{ condition, severity }]
    interactions: jsonb("interactions").default([]), // [{ drugCode, severity, description }]
    unitPrice: decimal("unit_price", { precision: 10, scale: 2 }),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_drugs_generic_name").on(table.genericName),
    index("idx_drugs_category").on(table.category),
    index("idx_drugs_control_level").on(table.controlLevel),
  ],
);

/** Drug inventory — current stock levels by location. */
export const drugInventory = pgTable(
  "drug_inventory",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    drugId: uuid("drug_id").notNull().references(() => drugs.id),
    locationId: uuid("location_id").notNull(), // pharmacy/ward department ID
    locationType: varchar("location_type", { length: 20 }).notNull(), // central_pharmacy, ward_pharmacy, satellite
    batchNo: varchar("batch_no", { length: 50 }).notNull(),
    quantity: integer("quantity").notNull().default(0),
    expiryDate: date("expiry_date").notNull(),
    minStock: integer("min_stock").default(10),
    maxStock: integer("max_stock").default(1000),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_drug_inv_drug_id").on(table.drugId),
    index("idx_drug_inv_location").on(table.locationId),
    index("idx_drug_inv_expiry").on(table.expiryDate),
    uniqueIndex("idx_drug_inv_unique_batch").on(table.drugId, table.locationId, table.batchNo),
  ],
);

/** Dispensing record — tracks each drug dispensation event. */
export const dispensingRecords = pgTable(
  "dispensing_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id").notNull().references(() => orders.id),
    visitId: uuid("visit_id").notNull().references(() => visits.id),
    patientId: uuid("patient_id").notNull().references(() => patients.id),
    drugId: uuid("drug_id").notNull().references(() => drugs.id),
    quantity: decimal("quantity", { precision: 10, scale: 2 }).notNull(),
    dispensedBy: uuid("dispensed_by").notNull().references(() => staff.id),
    verifiedBy: uuid("verified_by").references(() => staff.id),
    status: varchar("status", { length: 20 }).default("dispensed").notNull(),
    // dispensed, returned, cancelled
    returnReason: text("return_reason"),
    dispensedAt: timestamp("dispensed_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_disp_order_id").on(table.orderId),
    index("idx_disp_patient_id").on(table.patientId),
    index("idx_disp_drug_id").on(table.drugId),
    index("idx_disp_dispensed_at").on(table.dispensedAt),
  ],
);

export type Drug = typeof drugs.$inferSelect;
export type NewDrug = typeof drugs.$inferInsert;
export type DrugInventory = typeof drugInventory.$inferSelect;
export type NewDrugInventory = typeof drugInventory.$inferInsert;
export type DispensingRecord = typeof dispensingRecords.$inferSelect;
export type NewDispensingRecord = typeof dispensingRecords.$inferInsert;
