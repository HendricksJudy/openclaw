/**
 * ClawHospital - Outpatient Management Extension [M02]
 *
 * Provides:
 *   - Appointment booking (multi-channel: Web, WhatsApp, Telegram, SMS, walk-in)
 *   - Triage & queue management
 *   - Doctor workstation RPC (visit creation, diagnosis, completion)
 *   - AI Tools for conversational appointment booking
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { Type } from "@sinclair/typebox";
import { getDb } from "../../src/db/connection.ts";
import { appointments, staffSchedules, type NewAppointment } from "../../src/db/schema/scheduling.ts";
import { visits, type NewVisit } from "../../src/db/schema/visits.ts";
import { patients } from "../../src/db/schema/patients.ts";
import { staff } from "../../src/db/schema/staff.ts";
import { departments } from "../../src/db/schema/departments.ts";
import { eq, and, gte, lte, sql, ilike, or, desc } from "drizzle-orm";

const outpatientPlugin = {
  id: "clawhospital-outpatient",
  name: "Outpatient Management",
  description: "Appointment booking, triage queue, and outpatient doctor workstation",
  version: "1.0.0",

  register(api: OpenClawPluginApi) {
    api.logger.info("Outpatient Management plugin registering...");

    // ── AI Tool: book_appointment ──────────────────────────────
    api.registerTool(
      {
        name: "book_appointment",
        description:
          "Book an outpatient appointment for a patient. " +
          "Use this when a patient requests to see a doctor, schedule a visit, or make an appointment.",
        parameters: Type.Object({
          patientId: Type.String({ description: "Patient UUID" }),
          departmentId: Type.String({ description: "Target department UUID" }),
          doctorId: Type.Optional(Type.String({ description: "Preferred doctor UUID (optional)" })),
          appointmentDate: Type.String({ description: "Desired date in YYYY-MM-DD format" }),
          preferredTime: Type.Optional(Type.String({ description: "Preferred time slot, e.g. '09:00'" })),
          appointmentType: Type.Optional(
            Type.String({ description: "first_visit, follow_up, consultation, procedure" }),
          ),
          chiefComplaint: Type.Optional(Type.String({ description: "Reason for visit" })),
          bookingChannel: Type.Optional(Type.String({ description: "Channel: web, whatsapp, telegram, sms, phone, walk_in" })),
        }),
        async execute(_id, params) {
          const db = getDb();

          // Find available schedule
          const scheduleFilters = [
            eq(staffSchedules.scheduleDate, params.appointmentDate),
            eq(staffSchedules.departmentId, params.departmentId),
            eq(staffSchedules.status, "active"),
            sql`${staffSchedules.bookedSlots} < ${staffSchedules.maxSlots}`,
          ];
          if (params.doctorId) {
            scheduleFilters.push(eq(staffSchedules.staffId, params.doctorId));
          }

          const availableSchedules = await db
            .select()
            .from(staffSchedules)
            .where(and(...scheduleFilters))
            .limit(5);

          if (availableSchedules.length === 0) {
            return {
              content: [{
                type: "text" as const,
                text: `No available slots found for ${params.appointmentDate} in the requested department. Please try a different date or department.`,
              }],
            };
          }

          const schedule = availableSchedules[0]!;
          const apptNo = `AP${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 4).toUpperCase()}`;

          const [appt] = await db.insert(appointments).values({
            appointmentNo: apptNo,
            patientId: params.patientId,
            staffId: schedule.staffId,
            departmentId: params.departmentId,
            scheduleId: schedule.id,
            appointmentDate: params.appointmentDate,
            startTime: params.preferredTime ?? schedule.startTime,
            appointmentType: params.appointmentType ?? "first_visit",
            chiefComplaint: params.chiefComplaint,
            bookingChannel: params.bookingChannel ?? "web",
            status: "booked",
          } satisfies NewAppointment).returning();

          // Increment booked slots
          await db
            .update(staffSchedules)
            .set({ bookedSlots: sql`${staffSchedules.bookedSlots} + 1` })
            .where(eq(staffSchedules.id, schedule.id));

          // Fetch doctor name for confirmation
          const [doctor] = await db.select().from(staff).where(eq(staff.id, schedule.staffId)).limit(1);

          return {
            content: [{
              type: "text" as const,
              text: `Appointment booked successfully:\n- Appointment #: ${apptNo}\n- Date: ${params.appointmentDate}\n- Time: ${params.preferredTime ?? schedule.startTime}\n- Doctor: ${doctor?.name ?? "Assigned"}\n- Status: Booked\n\nPlease arrive 15 minutes before your appointment.`,
            }],
          };
        },
      },
      { name: "book_appointment" },
    );

    // ── AI Tool: check_available_slots ─────────────────────────
    api.registerTool(
      {
        name: "check_available_slots",
        description:
          "Check available appointment slots for a department/doctor on a specific date. " +
          "Use this when a patient asks about availability or wants to know when they can see a doctor.",
        parameters: Type.Object({
          departmentId: Type.Optional(Type.String({ description: "Department UUID" })),
          doctorId: Type.Optional(Type.String({ description: "Doctor UUID" })),
          date: Type.String({ description: "Date to check in YYYY-MM-DD format" }),
        }),
        async execute(_id, params) {
          const db = getDb();
          const filters = [
            eq(staffSchedules.scheduleDate, params.date),
            eq(staffSchedules.status, "active"),
            sql`${staffSchedules.bookedSlots} < ${staffSchedules.maxSlots}`,
          ];
          if (params.departmentId) filters.push(eq(staffSchedules.departmentId, params.departmentId));
          if (params.doctorId) filters.push(eq(staffSchedules.staffId, params.doctorId));

          const slots = await db
            .select({
              scheduleId: staffSchedules.id,
              staffId: staffSchedules.staffId,
              departmentId: staffSchedules.departmentId,
              startTime: staffSchedules.startTime,
              endTime: staffSchedules.endTime,
              maxSlots: staffSchedules.maxSlots,
              bookedSlots: staffSchedules.bookedSlots,
              doctorName: staff.name,
              deptName: departments.name,
            })
            .from(staffSchedules)
            .leftJoin(staff, eq(staffSchedules.staffId, staff.id))
            .leftJoin(departments, eq(staffSchedules.departmentId, departments.id))
            .where(and(...filters))
            .limit(20);

          if (slots.length === 0) {
            return { content: [{ type: "text" as const, text: `No available slots on ${params.date}.` }] };
          }

          const formatted = slots
            .map((s) => `- Dr. ${s.doctorName} (${s.deptName}) | ${s.startTime}-${s.endTime} | ${s.maxSlots - s.bookedSlots} slots available`)
            .join("\n");

          return {
            content: [{ type: "text" as const, text: `Available slots on ${params.date}:\n\n${formatted}` }],
          };
        },
      },
      { name: "check_available_slots" },
    );

    // ── Gateway RPC: outpatient.appointment.book ───────────────
    api.registerGatewayMethod("outpatient.appointment.book", async (params) => {
      const db = getDb();
      const data = params as NewAppointment;
      if (!data.appointmentNo) {
        data.appointmentNo = `AP${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 4).toUpperCase()}`;
      }
      const [appt] = await db.insert(appointments).values(data).returning();
      return { appointment: appt };
    });

    // ── Gateway RPC: outpatient.appointment.list ───────────────
    api.registerGatewayMethod("outpatient.appointment.list", async (params) => {
      const db = getDb();
      const { date, departmentId, doctorId, status, limit = 50 } = params as {
        date?: string;
        departmentId?: string;
        doctorId?: string;
        status?: string;
        limit?: number;
      };

      const filters = [];
      if (date) filters.push(eq(appointments.appointmentDate, date));
      if (departmentId) filters.push(eq(appointments.departmentId, departmentId));
      if (doctorId) filters.push(eq(appointments.staffId, doctorId));
      if (status) filters.push(eq(appointments.status, status));

      const results = await db
        .select({
          id: appointments.id,
          appointmentNo: appointments.appointmentNo,
          patientId: appointments.patientId,
          patientName: patients.name,
          patientMrn: patients.medicalRecordNo,
          staffId: appointments.staffId,
          doctorName: staff.name,
          appointmentDate: appointments.appointmentDate,
          startTime: appointments.startTime,
          appointmentType: appointments.appointmentType,
          status: appointments.status,
          chiefComplaint: appointments.chiefComplaint,
          queueNumber: appointments.queueNumber,
          bookingChannel: appointments.bookingChannel,
        })
        .from(appointments)
        .leftJoin(patients, eq(appointments.patientId, patients.id))
        .leftJoin(staff, eq(appointments.staffId, staff.id))
        .where(filters.length > 0 ? and(...filters) : undefined)
        .orderBy(appointments.startTime)
        .limit(limit);

      return { appointments: results };
    });

    // ── Gateway RPC: outpatient.checkin ─────────────────────────
    api.registerGatewayMethod("outpatient.checkin", async (params) => {
      const db = getDb();
      const { appointmentId } = params as { appointmentId: string };

      // Get current max queue number for today
      const today = new Date().toISOString().split("T")[0]!;
      const [maxQueue] = await db
        .select({ maxQ: sql<number>`COALESCE(MAX(${appointments.queueNumber}), 0)` })
        .from(appointments)
        .where(and(eq(appointments.appointmentDate, today), eq(appointments.status, "checked_in")));

      const queueNumber = (maxQueue?.maxQ ?? 0) + 1;

      const [updated] = await db
        .update(appointments)
        .set({
          status: "checked_in",
          queueNumber,
          checkedInAt: new Date(),
        })
        .where(eq(appointments.id, appointmentId))
        .returning();

      return { appointment: updated, queueNumber };
    });

    // ── Gateway RPC: outpatient.visit.create ───────────────────
    api.registerGatewayMethod("outpatient.visit.create", async (params) => {
      const db = getDb();
      const { appointmentId, doctorId } = params as { appointmentId: string; doctorId: string };

      // Get appointment details
      const [appt] = await db
        .select()
        .from(appointments)
        .where(eq(appointments.id, appointmentId))
        .limit(1);

      if (!appt) throw new Error(`Appointment not found: ${appointmentId}`);

      const visitNo = `V${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 4).toUpperCase()}`;

      const [visit] = await db.insert(visits).values({
        patientId: appt.patientId,
        visitNo,
        visitType: "outpatient",
        departmentId: appt.departmentId,
        doctorId,
        visitDate: new Date(),
        chiefComplaint: appt.chiefComplaint,
        status: "active",
      } satisfies NewVisit).returning();

      // Update appointment status
      await db
        .update(appointments)
        .set({ status: "in_progress" })
        .where(eq(appointments.id, appointmentId));

      return { visit };
    });

    // ── Gateway RPC: outpatient.visit.complete ─────────────────
    api.registerGatewayMethod("outpatient.visit.complete", async (params) => {
      const db = getDb();
      const { visitId, diagnosisCodes } = params as {
        visitId: string;
        diagnosisCodes?: Array<{ code: string; system: string; display: string }>;
      };

      const [updated] = await db
        .update(visits)
        .set({
          status: "completed",
          diagnosisCodes: diagnosisCodes ?? [],
          updatedAt: new Date(),
        })
        .where(eq(visits.id, visitId))
        .returning();

      return { visit: updated };
    });

    // ── Gateway RPC: outpatient.queue ──────────────────────────
    api.registerGatewayMethod("outpatient.queue", async (params) => {
      const db = getDb();
      const { departmentId, doctorId } = params as { departmentId?: string; doctorId?: string };
      const today = new Date().toISOString().split("T")[0]!;

      const filters = [
        eq(appointments.appointmentDate, today),
        eq(appointments.status, "checked_in"),
      ];
      if (departmentId) filters.push(eq(appointments.departmentId, departmentId));
      if (doctorId) filters.push(eq(appointments.staffId, doctorId));

      const queue = await db
        .select({
          id: appointments.id,
          appointmentNo: appointments.appointmentNo,
          queueNumber: appointments.queueNumber,
          patientName: patients.name,
          patientMrn: patients.medicalRecordNo,
          chiefComplaint: appointments.chiefComplaint,
          checkedInAt: appointments.checkedInAt,
        })
        .from(appointments)
        .leftJoin(patients, eq(appointments.patientId, patients.id))
        .where(and(...filters))
        .orderBy(appointments.queueNumber)
        .limit(100);

      return { queue };
    });

    api.logger.info(
      "Outpatient Management plugin registered " +
      "(tools: book_appointment, check_available_slots; " +
      "RPC: outpatient.appointment.book/list, outpatient.checkin, outpatient.visit.create/complete, outpatient.queue)",
    );
  },
};

export default outpatientPlugin;
