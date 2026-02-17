/**
 * ClawHospital - Finance Schema
 *
 * Charge items, billing, payments, and insurance claims.
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

import { patients } from "./patients.ts";
import { visits } from "./visits.ts";
import { staff } from "./staff.ts";

/** Charge item catalog — master list of billable items/services. */
export const chargeItems = pgTable(
  "charge_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: varchar("code", { length: 30 }).unique().notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    category: varchar("category", { length: 50 }).notNull(),
    // consultation, procedure, lab, radiology, pharmacy, bed, nursing, supplies
    unitPrice: decimal("unit_price", { precision: 12, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 3 }).default("USD").notNull(),
    cptCode: varchar("cpt_code", { length: 10 }), // CPT/HCPCS code for insurance
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_charge_items_category").on(table.category),
    index("idx_charge_items_cpt").on(table.cptCode),
  ],
);

/** Bills — aggregated charges for a patient visit. */
export const bills = pgTable(
  "bills",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    billNo: varchar("bill_no", { length: 20 }).unique().notNull(),
    patientId: uuid("patient_id").notNull().references(() => patients.id),
    visitId: uuid("visit_id").notNull().references(() => visits.id),
    totalAmount: decimal("total_amount", { precision: 12, scale: 2 }).default("0").notNull(),
    discountAmount: decimal("discount_amount", { precision: 12, scale: 2 }).default("0"),
    insuranceCovered: decimal("insurance_covered", { precision: 12, scale: 2 }).default("0"),
    patientOwes: decimal("patient_owes", { precision: 12, scale: 2 }).default("0"),
    paidAmount: decimal("paid_amount", { precision: 12, scale: 2 }).default("0"),
    currency: varchar("currency", { length: 3 }).default("USD").notNull(),
    status: varchar("status", { length: 20 }).default("draft").notNull(),
    // draft, pending, partially_paid, paid, overdue, cancelled, written_off
    insuranceClaimId: uuid("insurance_claim_id"),
    createdBy: uuid("created_by").notNull().references(() => staff.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_bills_patient_id").on(table.patientId),
    index("idx_bills_visit_id").on(table.visitId),
    index("idx_bills_status").on(table.status),
  ],
);

/** Bill line items — individual charges on a bill. */
export const billItems = pgTable(
  "bill_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    billId: uuid("bill_id").notNull().references(() => bills.id),
    chargeItemId: uuid("charge_item_id").references(() => chargeItems.id),
    description: varchar("description", { length: 300 }).notNull(),
    quantity: decimal("quantity", { precision: 10, scale: 2 }).default("1").notNull(),
    unitPrice: decimal("unit_price", { precision: 12, scale: 2 }).notNull(),
    amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
    category: varchar("category", { length: 50 }),
    orderId: uuid("order_id"), // link to the order that generated this charge
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_bill_items_bill_id").on(table.billId),
  ],
);

/** Payments — records of money received. */
export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    paymentNo: varchar("payment_no", { length: 20 }).unique().notNull(),
    billId: uuid("bill_id").notNull().references(() => bills.id),
    patientId: uuid("patient_id").notNull().references(() => patients.id),
    amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
    paymentMethod: varchar("payment_method", { length: 20 }).notNull(),
    // cash, card, insurance, bank_transfer, mobile_pay
    referenceNo: varchar("reference_no", { length: 100 }),
    receivedBy: uuid("received_by").notNull().references(() => staff.id),
    status: varchar("status", { length: 15 }).default("completed").notNull(),
    // completed, refunded, failed
    notes: text("notes"),
    paidAt: timestamp("paid_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_payments_bill_id").on(table.billId),
    index("idx_payments_patient_id").on(table.patientId),
    index("idx_payments_paid_at").on(table.paidAt),
  ],
);

/** Insurance claims — tracks submissions to insurance providers. */
export const insuranceClaims = pgTable(
  "insurance_claims",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    claimNo: varchar("claim_no", { length: 30 }).unique().notNull(),
    billId: uuid("bill_id").notNull().references(() => bills.id),
    patientId: uuid("patient_id").notNull().references(() => patients.id),
    insuranceType: varchar("insurance_type", { length: 30 }).notNull(),
    insuranceNo: varchar("insurance_no", { length: 50 }).notNull(),
    claimedAmount: decimal("claimed_amount", { precision: 12, scale: 2 }).notNull(),
    approvedAmount: decimal("approved_amount", { precision: 12, scale: 2 }),
    status: varchar("status", { length: 20 }).default("submitted").notNull(),
    // submitted, under_review, approved, partially_approved, denied, appealed
    diagnosisCodes: jsonb("diagnosis_codes").default([]),
    procedureCodes: jsonb("procedure_codes").default([]),
    denialReason: text("denial_reason"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).defaultNow().notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_claims_bill_id").on(table.billId),
    index("idx_claims_patient_id").on(table.patientId),
    index("idx_claims_status").on(table.status),
  ],
);

export type ChargeItem = typeof chargeItems.$inferSelect;
export type NewChargeItem = typeof chargeItems.$inferInsert;
export type Bill = typeof bills.$inferSelect;
export type NewBill = typeof bills.$inferInsert;
export type BillItem = typeof billItems.$inferSelect;
export type NewBillItem = typeof billItems.$inferInsert;
export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;
export type InsuranceClaim = typeof insuranceClaims.$inferSelect;
export type NewInsuranceClaim = typeof insuranceClaims.$inferInsert;
