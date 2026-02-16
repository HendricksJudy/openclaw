/**
 * ClawHospital - Scheduling Schema
 *
 * Staff scheduling, appointment slots, and patient appointments.
 */

import {
  pgTable,
  uuid,
  varchar,
  text,
  jsonb,
  timestamp,
  date,
  integer,
  boolean,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { departments } from "./departments.ts";
import { staff } from "./staff.ts";
import { patients } from "./patients.ts";

/** Schedule templates — reusable weekly patterns for doctor/nurse shifts. */
export const scheduleTemplates = pgTable("schedule_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 100 }).notNull(),
  departmentId: uuid("department_id").notNull().references(() => departments.id),
  scheduleType: varchar("schedule_type", { length: 20 }).notNull(), // outpatient, inpatient, on_call, nursing
  dayOfWeek: integer("day_of_week").notNull(), // 0=Sunday ... 6=Saturday
  startTime: varchar("start_time", { length: 5 }).notNull(), // "08:00"
  endTime: varchar("end_time", { length: 5 }).notNull(), // "12:00"
  maxSlots: integer("max_slots").default(30).notNull(),
  slotDurationMinutes: integer("slot_duration_minutes").default(15).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Staff schedules — assigned shifts for specific dates. */
export const staffSchedules = pgTable(
  "staff_schedules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    staffId: uuid("staff_id").notNull().references(() => staff.id),
    departmentId: uuid("department_id").notNull().references(() => departments.id),
    templateId: uuid("template_id").references(() => scheduleTemplates.id),
    scheduleDate: date("schedule_date").notNull(),
    scheduleType: varchar("schedule_type", { length: 20 }).notNull(),
    // outpatient, inpatient, on_call, nursing, emergency
    startTime: varchar("start_time", { length: 5 }).notNull(),
    endTime: varchar("end_time", { length: 5 }).notNull(),
    maxSlots: integer("max_slots").default(30).notNull(),
    bookedSlots: integer("booked_slots").default(0).notNull(),
    status: varchar("status", { length: 15 }).default("active").notNull(),
    // active, cancelled, completed
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_staff_sched_staff_id").on(table.staffId),
    index("idx_staff_sched_date").on(table.scheduleDate),
    index("idx_staff_sched_dept").on(table.departmentId),
    uniqueIndex("idx_staff_sched_unique").on(table.staffId, table.scheduleDate, table.startTime),
  ],
);

/** Appointments — patient bookings linked to staff schedules. */
export const appointments = pgTable(
  "appointments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    appointmentNo: varchar("appointment_no", { length: 20 }).unique().notNull(),
    patientId: uuid("patient_id").notNull().references(() => patients.id),
    staffId: uuid("staff_id").notNull().references(() => staff.id),
    departmentId: uuid("department_id").notNull().references(() => departments.id),
    scheduleId: uuid("schedule_id").references(() => staffSchedules.id),
    appointmentDate: date("appointment_date").notNull(),
    startTime: varchar("start_time", { length: 5 }).notNull(),
    endTime: varchar("end_time", { length: 5 }),
    appointmentType: varchar("appointment_type", { length: 20 }).notNull(),
    // first_visit, follow_up, consultation, procedure
    status: varchar("status", { length: 20 }).default("booked").notNull(),
    // booked, confirmed, checked_in, in_progress, completed, cancelled, no_show
    chiefComplaint: text("chief_complaint"),
    bookingChannel: varchar("booking_channel", { length: 20 }), // web, whatsapp, telegram, sms, phone, walk_in
    queueNumber: integer("queue_number"),
    checkedInAt: timestamp("checked_in_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelReason: text("cancel_reason"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_appt_patient_id").on(table.patientId),
    index("idx_appt_staff_id").on(table.staffId),
    index("idx_appt_date").on(table.appointmentDate),
    index("idx_appt_status").on(table.status),
    index("idx_appt_dept").on(table.departmentId),
  ],
);

export type ScheduleTemplate = typeof scheduleTemplates.$inferSelect;
export type NewScheduleTemplate = typeof scheduleTemplates.$inferInsert;
export type StaffSchedule = typeof staffSchedules.$inferSelect;
export type NewStaffSchedule = typeof staffSchedules.$inferInsert;
export type Appointment = typeof appointments.$inferSelect;
export type NewAppointment = typeof appointments.$inferInsert;
