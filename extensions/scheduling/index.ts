/**
 * ClawHospital - Scheduling Management Extension [M10]
 *
 * Provides:
 *   - Schedule template management
 *   - Staff schedule assignment (outpatient, inpatient, on-call, nursing)
 *   - Appointment slot generation from templates
 *   - Roster views and management
 *   - AI Tool for schedule queries
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { Type } from "@sinclair/typebox";
import { getDb } from "../../src/db/connection.ts";
import {
  scheduleTemplates,
  staffSchedules,
  appointments,
  type NewScheduleTemplate,
  type NewStaffSchedule,
} from "../../src/db/schema/scheduling.ts";
import { staff } from "../../src/db/schema/staff.ts";
import { departments } from "../../src/db/schema/departments.ts";
import { eq, and, gte, lte, sql, desc } from "drizzle-orm";

const schedulingPlugin = {
  id: "clawhospital-scheduling",
  name: "Scheduling Management",
  description: "Staff scheduling, appointment slot management, and roster planning",
  version: "1.0.0",

  register(api: OpenClawPluginApi) {
    api.logger.info("Scheduling Management plugin registering...");

    // ── AI Tool: query_doctor_schedule ──────────────────────────
    api.registerTool(
      {
        name: "query_doctor_schedule",
        description:
          "Query a doctor's schedule for a specific date range. " +
          "Use this when someone asks about doctor availability, shifts, or working hours.",
        parameters: Type.Object({
          doctorId: Type.Optional(Type.String({ description: "Doctor UUID" })),
          departmentId: Type.Optional(Type.String({ description: "Department UUID" })),
          startDate: Type.String({ description: "Start date in YYYY-MM-DD" }),
          endDate: Type.String({ description: "End date in YYYY-MM-DD" }),
        }),
        async execute(_id, params) {
          const db = getDb();
          const filters = [
            gte(staffSchedules.scheduleDate, params.startDate),
            lte(staffSchedules.scheduleDate, params.endDate),
            eq(staffSchedules.status, "active"),
          ];
          if (params.doctorId) filters.push(eq(staffSchedules.staffId, params.doctorId));
          if (params.departmentId) filters.push(eq(staffSchedules.departmentId, params.departmentId));

          const schedules = await db
            .select({
              date: staffSchedules.scheduleDate,
              startTime: staffSchedules.startTime,
              endTime: staffSchedules.endTime,
              scheduleType: staffSchedules.scheduleType,
              maxSlots: staffSchedules.maxSlots,
              bookedSlots: staffSchedules.bookedSlots,
              doctorName: staff.name,
              deptName: departments.name,
            })
            .from(staffSchedules)
            .leftJoin(staff, eq(staffSchedules.staffId, staff.id))
            .leftJoin(departments, eq(staffSchedules.departmentId, departments.id))
            .where(and(...filters))
            .orderBy(staffSchedules.scheduleDate, staffSchedules.startTime)
            .limit(50);

          if (schedules.length === 0) {
            return { content: [{ type: "text" as const, text: "No schedules found for the specified criteria." }] };
          }

          const formatted = schedules
            .map(
              (s) =>
                `- ${s.date} | Dr. ${s.doctorName} (${s.deptName}) | ${s.startTime}-${s.endTime} | ${s.scheduleType} | ${s.maxSlots - s.bookedSlots}/${s.maxSlots} slots available`,
            )
            .join("\n");

          return { content: [{ type: "text" as const, text: `Schedule:\n\n${formatted}` }] };
        },
      },
      { name: "query_doctor_schedule" },
    );

    // ── Gateway RPC: scheduling.template.create ────────────────
    api.registerGatewayMethod("scheduling.template.create", async (params) => {
      const db = getDb();
      const data = params as NewScheduleTemplate;
      const [template] = await db.insert(scheduleTemplates).values(data).returning();
      return { template };
    });

    // ── Gateway RPC: scheduling.template.list ──────────────────
    api.registerGatewayMethod("scheduling.template.list", async (params) => {
      const db = getDb();
      const { departmentId } = params as { departmentId?: string };

      const filters = [eq(scheduleTemplates.isActive, true)];
      if (departmentId) filters.push(eq(scheduleTemplates.departmentId, departmentId));

      const templates = await db
        .select({
          id: scheduleTemplates.id,
          name: scheduleTemplates.name,
          departmentId: scheduleTemplates.departmentId,
          deptName: departments.name,
          scheduleType: scheduleTemplates.scheduleType,
          dayOfWeek: scheduleTemplates.dayOfWeek,
          startTime: scheduleTemplates.startTime,
          endTime: scheduleTemplates.endTime,
          maxSlots: scheduleTemplates.maxSlots,
          slotDurationMinutes: scheduleTemplates.slotDurationMinutes,
        })
        .from(scheduleTemplates)
        .leftJoin(departments, eq(scheduleTemplates.departmentId, departments.id))
        .where(and(...filters));

      return { templates };
    });

    // ── Gateway RPC: scheduling.generate ───────────────────────
    api.registerGatewayMethod("scheduling.generate", async (params) => {
      const db = getDb();
      const { staffId, departmentId, startDate, endDate, templateId } = params as {
        staffId: string;
        departmentId: string;
        startDate: string;
        endDate: string;
        templateId?: string;
      };

      // Get applicable templates
      const templateFilters = [
        eq(scheduleTemplates.departmentId, departmentId),
        eq(scheduleTemplates.isActive, true),
      ];
      if (templateId) templateFilters.push(eq(scheduleTemplates.id, templateId));

      const templates = await db
        .select()
        .from(scheduleTemplates)
        .where(and(...templateFilters));

      // Generate schedules for each date in range
      const created: typeof staffSchedules.$inferSelect[] = [];
      const start = new Date(startDate);
      const end = new Date(endDate);

      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dayOfWeek = d.getDay();
        const dateStr = d.toISOString().split("T")[0]!;

        const matching = templates.filter((t) => t.dayOfWeek === dayOfWeek);
        for (const tmpl of matching) {
          const [sched] = await db
            .insert(staffSchedules)
            .values({
              staffId,
              departmentId,
              templateId: tmpl.id,
              scheduleDate: dateStr,
              scheduleType: tmpl.scheduleType,
              startTime: tmpl.startTime,
              endTime: tmpl.endTime,
              maxSlots: tmpl.maxSlots,
              status: "active",
            } satisfies NewStaffSchedule)
            .onConflictDoNothing()
            .returning();

          if (sched) created.push(sched);
        }
      }

      return { schedulesCreated: created.length, schedules: created };
    });

    // ── Gateway RPC: scheduling.roster ─────────────────────────
    api.registerGatewayMethod("scheduling.roster", async (params) => {
      const db = getDb();
      const { departmentId, startDate, endDate, scheduleType } = params as {
        departmentId?: string;
        startDate: string;
        endDate: string;
        scheduleType?: string;
      };

      const filters = [
        gte(staffSchedules.scheduleDate, startDate),
        lte(staffSchedules.scheduleDate, endDate),
      ];
      if (departmentId) filters.push(eq(staffSchedules.departmentId, departmentId));
      if (scheduleType) filters.push(eq(staffSchedules.scheduleType, scheduleType));

      const roster = await db
        .select({
          id: staffSchedules.id,
          staffId: staffSchedules.staffId,
          staffName: staff.name,
          staffTitle: staff.title,
          departmentId: staffSchedules.departmentId,
          deptName: departments.name,
          scheduleDate: staffSchedules.scheduleDate,
          scheduleType: staffSchedules.scheduleType,
          startTime: staffSchedules.startTime,
          endTime: staffSchedules.endTime,
          maxSlots: staffSchedules.maxSlots,
          bookedSlots: staffSchedules.bookedSlots,
          status: staffSchedules.status,
        })
        .from(staffSchedules)
        .leftJoin(staff, eq(staffSchedules.staffId, staff.id))
        .leftJoin(departments, eq(staffSchedules.departmentId, departments.id))
        .where(and(...filters))
        .orderBy(staffSchedules.scheduleDate, staffSchedules.startTime);

      return { roster };
    });

    // ── Gateway RPC: scheduling.cancel ─────────────────────────
    api.registerGatewayMethod("scheduling.cancel", async (params) => {
      const db = getDb();
      const { scheduleId, reason } = params as { scheduleId: string; reason?: string };

      const [updated] = await db
        .update(staffSchedules)
        .set({
          status: "cancelled",
          notes: reason,
          updatedAt: new Date(),
        })
        .where(eq(staffSchedules.id, scheduleId))
        .returning();

      // Cancel all booked appointments for this schedule
      if (updated) {
        await db
          .update(appointments)
          .set({
            status: "cancelled",
            cancelReason: `Schedule cancelled${reason ? `: ${reason}` : ""}`,
            cancelledAt: new Date(),
            updatedAt: new Date(),
          })
          .where(and(eq(appointments.scheduleId, scheduleId), eq(appointments.status, "booked")));
      }

      return { schedule: updated };
    });

    // ── Gateway RPC: scheduling.stats ──────────────────────────
    api.registerGatewayMethod("scheduling.stats", async (params) => {
      const db = getDb();
      const { departmentId, date } = params as { departmentId?: string; date: string };

      const filters = [eq(staffSchedules.scheduleDate, date)];
      if (departmentId) filters.push(eq(staffSchedules.departmentId, departmentId));

      const [stats] = await db
        .select({
          totalSchedules: sql<number>`COUNT(*)`,
          totalSlots: sql<number>`COALESCE(SUM(${staffSchedules.maxSlots}), 0)`,
          totalBooked: sql<number>`COALESCE(SUM(${staffSchedules.bookedSlots}), 0)`,
          activeSchedules: sql<number>`COUNT(*) FILTER (WHERE ${staffSchedules.status} = 'active')`,
        })
        .from(staffSchedules)
        .where(and(...filters));

      return {
        date,
        totalSchedules: stats?.totalSchedules ?? 0,
        totalSlots: stats?.totalSlots ?? 0,
        totalBooked: stats?.totalBooked ?? 0,
        availableSlots: (stats?.totalSlots ?? 0) - (stats?.totalBooked ?? 0),
        utilizationRate:
          stats?.totalSlots ? ((stats.totalBooked / stats.totalSlots) * 100).toFixed(1) + "%" : "0%",
      };
    });

    api.logger.info(
      "Scheduling Management plugin registered " +
      "(tools: query_doctor_schedule; " +
      "RPC: scheduling.template.create/list, scheduling.generate, scheduling.roster, scheduling.cancel, scheduling.stats)",
    );
  },
};

export default schedulingPlugin;
