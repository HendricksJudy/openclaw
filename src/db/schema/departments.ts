/**
 * ClawHospital - Department & Ward Schema
 *
 * Hospital organizational structure: departments, wards, beds.
 */

import {
  pgTable,
  uuid,
  varchar,
  boolean,
  integer,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

export const departments = pgTable(
  "departments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: varchar("code", { length: 20 }).unique().notNull(),
    name: varchar("name", { length: 100 }).notNull(),
    parentId: uuid("parent_id"), // self-referencing for hierarchy
    deptType: varchar("dept_type", { length: 20 }).notNull(),
    // clinical, nursing, pharmacy, lab, radiology, admin, finance
    isActive: boolean("is_active").default(true).notNull(),
    sortOrder: integer("sort_order").default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_departments_code").on(table.code),
    index("idx_departments_parent_id").on(table.parentId),
    index("idx_departments_dept_type").on(table.deptType),
  ],
);

export const wards = pgTable(
  "wards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: varchar("code", { length: 20 }).unique().notNull(),
    name: varchar("name", { length: 100 }).notNull(),
    departmentId: uuid("department_id").notNull().references(() => departments.id),
    floor: varchar("floor", { length: 10 }),
    building: varchar("building", { length: 50 }),
    totalBeds: integer("total_beds").default(0),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_wards_department_id").on(table.departmentId),
  ],
);

export const beds = pgTable(
  "beds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    wardId: uuid("ward_id").notNull().references(() => wards.id),
    bedNo: varchar("bed_no", { length: 10 }).notNull(),
    bedType: varchar("bed_type", { length: 20 }).default("standard"), // standard, icu, isolation, etc.
    status: varchar("status", { length: 15 }).default("available").notNull(),
    // available, occupied, reserved, maintenance
    currentPatientId: uuid("current_patient_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_beds_ward_id").on(table.wardId),
    index("idx_beds_status").on(table.status),
  ],
);

export type Department = typeof departments.$inferSelect;
export type NewDepartment = typeof departments.$inferInsert;
export type Ward = typeof wards.$inferSelect;
export type NewWard = typeof wards.$inferInsert;
export type Bed = typeof beds.$inferSelect;
export type NewBed = typeof beds.$inferInsert;
