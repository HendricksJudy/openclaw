/**
 * ClawHospital - Staff Schema
 *
 * Hospital staff: doctors, nurses, pharmacists, admin, etc.
 */

import {
  pgTable,
  uuid,
  varchar,
  boolean,
  jsonb,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

import { departments } from "./departments.ts";

export const staff = pgTable(
  "staff",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    staffNo: varchar("staff_no", { length: 20 }).unique().notNull(),
    name: varchar("name", { length: 100 }).notNull(),
    departmentId: uuid("department_id").references(() => departments.id),
    roleType: varchar("role_type", { length: 20 }).notNull(),
    // doctor, nurse, pharmacist, lab_tech, radiologist, billing, admin, superadmin
    title: varchar("title", { length: 50 }), // attending, resident, charge_nurse, etc.
    licenseNo: varchar("license_no", { length: 50 }),
    speciality: varchar("speciality", { length: 100 }),
    phone: varchar("phone", { length: 20 }),
    email: varchar("email", { length: 100 }),
    locale: varchar("locale", { length: 10 }).default("en"),
    isActive: boolean("is_active").default(true).notNull(),
    channelBindings: jsonb("channel_bindings").default({}),
    // { slack: "U123", whatsapp: "+1...", telegram: "456" }
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_staff_department_id").on(table.departmentId),
    index("idx_staff_role_type").on(table.roleType),
    index("idx_staff_email").on(table.email),
  ],
);

export type Staff = typeof staff.$inferSelect;
export type NewStaff = typeof staff.$inferInsert;
