/**
 * ClawHospital - Patient Schema
 *
 * Core patient demographics and identification.
 * PII fields (name, national_id, phone) should be encrypted at the application layer.
 */

import {
  pgTable,
  uuid,
  varchar,
  smallint,
  date,
  text,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

export const patients = pgTable(
  "patients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    medicalRecordNo: varchar("medical_record_no", { length: 20 }).unique().notNull(),
    name: varchar("name", { length: 100 }).notNull(),
    gender: smallint("gender").notNull(), // 1=male, 2=female, 3=other, 9=unknown
    birthDate: date("birth_date").notNull(),
    nationalId: varchar("national_id", { length: 50 }),
    nationalIdType: varchar("national_id_type", { length: 20 }), // passport, ssn, national_id, etc.
    phone: varchar("phone", { length: 20 }),
    email: varchar("email", { length: 100 }),
    insuranceType: varchar("insurance_type", { length: 30 }), // private, medicare, medicaid, nhs, etc.
    insuranceNo: varchar("insurance_no", { length: 50 }),
    locale: varchar("locale", { length: 10 }).default("en"),
    address: text("address"),
    emergencyContact: varchar("emergency_contact", { length: 100 }),
    emergencyPhone: varchar("emergency_phone", { length: 20 }),
    channelBindings: jsonb("channel_bindings").default({}), // { whatsapp: "+1...", telegram: "123", ... }
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_patients_name").on(table.name),
    index("idx_patients_phone").on(table.phone),
    index("idx_patients_national_id").on(table.nationalId),
    index("idx_patients_insurance_no").on(table.insuranceNo),
  ],
);

export type Patient = typeof patients.$inferSelect;
export type NewPatient = typeof patients.$inferInsert;
