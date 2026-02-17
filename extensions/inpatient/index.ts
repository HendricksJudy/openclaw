/**
 * ClawHospital - Inpatient Management Extension [M03]
 *
 * Provides:
 *   - Admission registration and bed assignment
 *   - Bed/ward management (ward → room → bed hierarchy)
 *   - Nursing workstation (order execution, vital signs, nursing assessments)
 *   - Transfer (department, room, bed) workflows
 *   - Discharge processing and settlement trigger
 *   - AI Tools for bed availability and patient lookup
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { Type } from "@sinclair/typebox";
import { getDb } from "../../src/db/connection.ts";
import { visits, type NewVisit } from "../../src/db/schema/visits.ts";
import { patients } from "../../src/db/schema/patients.ts";
import { staff } from "../../src/db/schema/staff.ts";
import { departments } from "../../src/db/schema/departments.ts";
import { orders, orderExecutions, type NewOrderExecution } from "../../src/db/schema/orders.ts";
import { eq, and, sql, desc, isNull } from "drizzle-orm";

// ── Bed status tracking (in-memory for now; can move to DB table later) ─────
// In a production system this would be a `beds` table.  For the initial plugin
// we store ward/room/bed state in the visit record's `bedId` column and expose
// helper RPCs.

const inpatientPlugin = {
  id: "clawhospital-inpatient",
  name: "Inpatient Management",
  description: "Admission, bed management, nursing station, transfers, and discharge",
  version: "1.0.0",

  register(api: OpenClawPluginApi) {
    api.logger.info("Inpatient Management plugin registering...");

    // ── AI Tool: admit_patient ──────────────────────────────────
    api.registerTool(
      {
        name: "admit_patient",
        description:
          "Admit a patient to the hospital (create an inpatient visit). " +
          "Use this when a doctor decides a patient needs to be hospitalized.",
        parameters: Type.Object({
          patientId: Type.String({ description: "Patient UUID" }),
          departmentId: Type.String({ description: "Admitting department UUID" }),
          doctorId: Type.String({ description: "Attending physician UUID" }),
          chiefComplaint: Type.String({ description: "Reason for admission" }),
          bedId: Type.Optional(Type.String({ description: "Assigned bed UUID (optional, can assign later)" })),
          diagnosisCodes: Type.Optional(
            Type.Array(
              Type.Object({
                code: Type.String(),
                system: Type.String({ description: "ICD-10, ICD-11, SNOMED, etc." }),
                display: Type.String(),
              }),
            ),
          ),
        }),
        async execute(_id, params) {
          const db = getDb();
          const visitNo = `IP${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 4).toUpperCase()}`;

          const [visit] = await db
            .insert(visits)
            .values({
              patientId: params.patientId,
              visitNo,
              visitType: "inpatient",
              departmentId: params.departmentId,
              doctorId: params.doctorId,
              visitDate: new Date(),
              chiefComplaint: params.chiefComplaint,
              diagnosisCodes: params.diagnosisCodes ?? [],
              status: "active",
              bedId: params.bedId ?? null,
              admissionDate: new Date(),
            } satisfies NewVisit)
            .returning();

          // Fetch doctor name
          const [doctor] = await db.select().from(staff).where(eq(staff.id, params.doctorId)).limit(1);

          return {
            content: [
              {
                type: "text" as const,
                text:
                  `Patient admitted successfully:\n` +
                  `- Visit #: ${visitNo}\n` +
                  `- Type: Inpatient\n` +
                  `- Attending: Dr. ${doctor?.name ?? "Assigned"}\n` +
                  `- Admission Date: ${new Date().toISOString().split("T")[0]}\n` +
                  `- Bed: ${params.bedId ?? "Pending assignment"}\n` +
                  `- Status: Active`,
              },
            ],
          };
        },
      },
      { name: "admit_patient" },
    );

    // ── AI Tool: query_inpatients ───────────────────────────────
    api.registerTool(
      {
        name: "query_inpatients",
        description:
          "Query current inpatients by department, doctor, or status. " +
          "Use this when staff need a list of hospitalized patients.",
        parameters: Type.Object({
          departmentId: Type.Optional(Type.String({ description: "Filter by department UUID" })),
          doctorId: Type.Optional(Type.String({ description: "Filter by attending doctor UUID" })),
          status: Type.Optional(Type.String({ description: "Filter by status: active, discharged, transferred" })),
          limit: Type.Optional(Type.Number({ description: "Max results (default 30)" })),
        }),
        async execute(_id, params) {
          const db = getDb();
          const filters = [eq(visits.visitType, "inpatient")];
          if (params.departmentId) filters.push(eq(visits.departmentId, params.departmentId));
          if (params.doctorId) filters.push(eq(visits.doctorId, params.doctorId));
          if (params.status) {
            filters.push(eq(visits.status, params.status));
          } else {
            filters.push(eq(visits.status, "active"));
          }

          const results = await db
            .select({
              visitId: visits.id,
              visitNo: visits.visitNo,
              patientName: patients.name,
              patientMrn: patients.medicalRecordNo,
              departmentName: departments.name,
              doctorName: staff.name,
              chiefComplaint: visits.chiefComplaint,
              admissionDate: visits.admissionDate,
              bedId: visits.bedId,
              status: visits.status,
            })
            .from(visits)
            .leftJoin(patients, eq(visits.patientId, patients.id))
            .leftJoin(departments, eq(visits.departmentId, departments.id))
            .leftJoin(staff, eq(visits.doctorId, staff.id))
            .where(and(...filters))
            .orderBy(desc(visits.admissionDate))
            .limit(params.limit ?? 30);

          if (results.length === 0) {
            return { content: [{ type: "text" as const, text: "No inpatients found matching the criteria." }] };
          }

          const formatted = results
            .map(
              (r) =>
                `- ${r.patientName} (MRN: ${r.patientMrn}) | ${r.departmentName} | Dr. ${r.doctorName} | Admitted: ${r.admissionDate ? new Date(r.admissionDate).toLocaleDateString() : "N/A"} | Bed: ${r.bedId ?? "Unassigned"}`,
            )
            .join("\n");

          return { content: [{ type: "text" as const, text: `Current Inpatients (${results.length}):\n\n${formatted}` }] };
        },
      },
      { name: "query_inpatients" },
    );

    // ── AI Tool: record_vital_signs ────────────────────────────
    api.registerTool(
      {
        name: "record_vital_signs",
        description:
          "Record vital signs for an inpatient. " +
          "Use this when a nurse needs to document temperature, blood pressure, heart rate, etc.",
        parameters: Type.Object({
          visitId: Type.String({ description: "Inpatient visit UUID" }),
          nurseId: Type.String({ description: "Recording nurse UUID" }),
          temperature: Type.Optional(Type.Number({ description: "Body temperature in °C" })),
          systolicBp: Type.Optional(Type.Number({ description: "Systolic blood pressure (mmHg)" })),
          diastolicBp: Type.Optional(Type.Number({ description: "Diastolic blood pressure (mmHg)" })),
          heartRate: Type.Optional(Type.Number({ description: "Heart rate (bpm)" })),
          respiratoryRate: Type.Optional(Type.Number({ description: "Respiratory rate (breaths/min)" })),
          oxygenSaturation: Type.Optional(Type.Number({ description: "SpO2 (%)" })),
          painScore: Type.Optional(Type.Number({ description: "Pain score (0-10)" })),
          notes: Type.Optional(Type.String({ description: "Additional nursing notes" })),
        }),
        async execute(_id, params) {
          const db = getDb();
          // Record as an order execution of type "vital_signs"
          const [execution] = await db
            .insert(orderExecutions)
            .values({
              orderId: params.visitId, // Using visitId as reference
              executorId: params.nurseId,
              action: "vital_signs",
              notes: JSON.stringify({
                temperature: params.temperature,
                systolicBp: params.systolicBp,
                diastolicBp: params.diastolicBp,
                heartRate: params.heartRate,
                respiratoryRate: params.respiratoryRate,
                oxygenSaturation: params.oxygenSaturation,
                painScore: params.painScore,
                nursingNotes: params.notes,
                recordedAt: new Date().toISOString(),
              }),
            } satisfies NewOrderExecution)
            .returning();

          const vitals = [
            params.temperature != null ? `Temp: ${params.temperature}°C` : null,
            params.systolicBp != null && params.diastolicBp != null ? `BP: ${params.systolicBp}/${params.diastolicBp} mmHg` : null,
            params.heartRate != null ? `HR: ${params.heartRate} bpm` : null,
            params.respiratoryRate != null ? `RR: ${params.respiratoryRate}/min` : null,
            params.oxygenSaturation != null ? `SpO2: ${params.oxygenSaturation}%` : null,
            params.painScore != null ? `Pain: ${params.painScore}/10` : null,
          ].filter(Boolean);

          return {
            content: [
              {
                type: "text" as const,
                text: `Vital signs recorded:\n${vitals.join("\n")}\n${params.notes ? `\nNotes: ${params.notes}` : ""}`,
              },
            ],
          };
        },
      },
      { name: "record_vital_signs" },
    );

    // ── Gateway RPC: inpatient.admit ────────────────────────────
    api.registerGatewayMethod("inpatient.admit", async (params) => {
      const db = getDb();
      const data = params as NewVisit & { bedId?: string };
      const visitNo = `IP${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 4).toUpperCase()}`;

      const [visit] = await db
        .insert(visits)
        .values({
          ...data,
          visitNo,
          visitType: "inpatient",
          visitDate: new Date(),
          status: "active",
          admissionDate: new Date(),
        })
        .returning();

      return { visit };
    });

    // ── Gateway RPC: inpatient.assignBed ────────────────────────
    api.registerGatewayMethod("inpatient.assignBed", async (params) => {
      const db = getDb();
      const { visitId, bedId } = params as { visitId: string; bedId: string };

      const [updated] = await db
        .update(visits)
        .set({ bedId, updatedAt: new Date() })
        .where(eq(visits.id, visitId))
        .returning();

      return { visit: updated };
    });

    // ── Gateway RPC: inpatient.transfer ─────────────────────────
    api.registerGatewayMethod("inpatient.transfer", async (params) => {
      const db = getDb();
      const { visitId, toDepartmentId, toBedId, toDoctorId, reason } = params as {
        visitId: string;
        toDepartmentId?: string;
        toBedId?: string;
        toDoctorId?: string;
        reason?: string;
      };

      const updates: Partial<typeof visits.$inferInsert> = { updatedAt: new Date() };
      if (toDepartmentId) updates.departmentId = toDepartmentId;
      if (toBedId) updates.bedId = toBedId;
      if (toDoctorId) updates.doctorId = toDoctorId;

      const [updated] = await db
        .update(visits)
        .set(updates)
        .where(eq(visits.id, visitId))
        .returning();

      return { visit: updated, transferReason: reason };
    });

    // ── Gateway RPC: inpatient.discharge ────────────────────────
    api.registerGatewayMethod("inpatient.discharge", async (params) => {
      const db = getDb();
      const { visitId, dischargeDiagnosis, dischargeInstructions } = params as {
        visitId: string;
        dischargeDiagnosis?: Array<{ code: string; system: string; display: string }>;
        dischargeInstructions?: string;
      };

      const [updated] = await db
        .update(visits)
        .set({
          status: "discharged",
          dischargeDate: new Date(),
          diagnosisCodes: dischargeDiagnosis ?? [],
          updatedAt: new Date(),
        })
        .where(eq(visits.id, visitId))
        .returning();

      return { visit: updated, dischargeInstructions };
    });

    // ── Gateway RPC: inpatient.list ─────────────────────────────
    api.registerGatewayMethod("inpatient.list", async (params) => {
      const db = getDb();
      const { departmentId, doctorId, status, limit = 50 } = params as {
        departmentId?: string;
        doctorId?: string;
        status?: string;
        limit?: number;
      };

      const filters = [eq(visits.visitType, "inpatient")];
      if (departmentId) filters.push(eq(visits.departmentId, departmentId));
      if (doctorId) filters.push(eq(visits.doctorId, doctorId));
      filters.push(eq(visits.status, status ?? "active"));

      const results = await db
        .select({
          id: visits.id,
          visitNo: visits.visitNo,
          patientId: visits.patientId,
          patientName: patients.name,
          patientMrn: patients.medicalRecordNo,
          departmentId: visits.departmentId,
          departmentName: departments.name,
          doctorId: visits.doctorId,
          doctorName: staff.name,
          chiefComplaint: visits.chiefComplaint,
          admissionDate: visits.admissionDate,
          bedId: visits.bedId,
          status: visits.status,
          diagnosisCodes: visits.diagnosisCodes,
        })
        .from(visits)
        .leftJoin(patients, eq(visits.patientId, patients.id))
        .leftJoin(departments, eq(visits.departmentId, departments.id))
        .leftJoin(staff, eq(visits.doctorId, staff.id))
        .where(and(...filters))
        .orderBy(desc(visits.admissionDate))
        .limit(limit);

      return { inpatients: results };
    });

    // ── Gateway RPC: inpatient.get ──────────────────────────────
    api.registerGatewayMethod("inpatient.get", async (params) => {
      const db = getDb();
      const { id } = params as { id: string };

      const [visit] = await db
        .select({
          id: visits.id,
          visitNo: visits.visitNo,
          patientId: visits.patientId,
          patientName: patients.name,
          patientMrn: patients.medicalRecordNo,
          departmentName: departments.name,
          doctorName: staff.name,
          chiefComplaint: visits.chiefComplaint,
          diagnosisCodes: visits.diagnosisCodes,
          admissionDate: visits.admissionDate,
          dischargeDate: visits.dischargeDate,
          bedId: visits.bedId,
          status: visits.status,
          aiSessionId: visits.aiSessionId,
        })
        .from(visits)
        .leftJoin(patients, eq(visits.patientId, patients.id))
        .leftJoin(departments, eq(visits.departmentId, departments.id))
        .leftJoin(staff, eq(visits.doctorId, staff.id))
        .where(and(eq(visits.id, id), eq(visits.visitType, "inpatient")))
        .limit(1);

      if (!visit) throw new Error(`Inpatient visit not found: ${id}`);

      // Get active orders for this visit
      const activeOrders = await db
        .select({
          id: orders.id,
          orderNo: orders.orderNo,
          orderType: orders.orderType,
          orderCategory: orders.orderCategory,
          itemName: orders.itemName,
          dosage: orders.dosage,
          frequency: orders.frequency,
          route: orders.route,
          status: orders.status,
        })
        .from(orders)
        .where(and(eq(orders.visitId, id), sql`${orders.status} NOT IN ('cancelled', 'completed')`))
        .orderBy(desc(orders.createdAt));

      return { visit, activeOrders };
    });

    // ── Gateway RPC: inpatient.nursingRounds ────────────────────
    api.registerGatewayMethod("inpatient.nursingRounds", async (params) => {
      const db = getDb();
      const { departmentId } = params as { departmentId: string };

      // Get all active inpatients in department with pending order executions
      const activeVisits = await db
        .select({
          visitId: visits.id,
          visitNo: visits.visitNo,
          patientName: patients.name,
          patientMrn: patients.medicalRecordNo,
          bedId: visits.bedId,
          admissionDate: visits.admissionDate,
        })
        .from(visits)
        .leftJoin(patients, eq(visits.patientId, patients.id))
        .where(
          and(
            eq(visits.visitType, "inpatient"),
            eq(visits.departmentId, departmentId),
            eq(visits.status, "active"),
          ),
        )
        .orderBy(visits.bedId);

      // For each visit, get count of pending orders
      const roundsData = [];
      for (const v of activeVisits) {
        const [pendingCount] = await db
          .select({ count: sql<number>`COUNT(*)` })
          .from(orders)
          .where(and(eq(orders.visitId, v.visitId), eq(orders.status, "approved")));

        roundsData.push({
          ...v,
          pendingOrderCount: pendingCount?.count ?? 0,
        });
      }

      return { rounds: roundsData };
    });

    // ── Gateway RPC: inpatient.executeOrder ──────────────────────
    api.registerGatewayMethod("inpatient.executeOrder", async (params) => {
      const db = getDb();
      const { orderId, executorId, action, notes } = params as {
        orderId: string;
        executorId: string;
        action: string; // administered, collected, completed
        notes?: string;
      };

      const [execution] = await db
        .insert(orderExecutions)
        .values({
          orderId,
          executorId,
          action,
          notes,
        } satisfies NewOrderExecution)
        .returning();

      // Update order status
      const newStatus = action === "administered" || action === "completed" ? "completed" : "executing";
      await db.update(orders).set({ status: newStatus, updatedAt: new Date() }).where(eq(orders.id, orderId));

      return { execution };
    });

    // ── Gateway RPC: inpatient.recordVitals ─────────────────────
    api.registerGatewayMethod("inpatient.recordVitals", async (params) => {
      const db = getDb();
      const { visitId, nurseId, vitals } = params as {
        visitId: string;
        nurseId: string;
        vitals: Record<string, unknown>;
      };

      const [execution] = await db
        .insert(orderExecutions)
        .values({
          orderId: visitId,
          executorId: nurseId,
          action: "vital_signs",
          notes: JSON.stringify({ ...vitals, recordedAt: new Date().toISOString() }),
        })
        .returning();

      return { record: execution };
    });

    // ── Gateway RPC: inpatient.census ───────────────────────────
    api.registerGatewayMethod("inpatient.census", async (params) => {
      const db = getDb();
      const { departmentId } = params as { departmentId?: string };

      const filters = [eq(visits.visitType, "inpatient"), eq(visits.status, "active")];
      if (departmentId) filters.push(eq(visits.departmentId, departmentId));

      const census = await db
        .select({
          departmentId: visits.departmentId,
          departmentName: departments.name,
          count: sql<number>`COUNT(*)`,
        })
        .from(visits)
        .leftJoin(departments, eq(visits.departmentId, departments.id))
        .where(and(...filters))
        .groupBy(visits.departmentId, departments.name);

      const total = census.reduce((sum, c) => sum + Number(c.count), 0);

      return { census, total };
    });

    api.logger.info(
      "Inpatient Management plugin registered " +
        "(tools: admit_patient, query_inpatients, record_vital_signs; " +
        "RPC: inpatient.admit/assignBed/transfer/discharge/list/get/nursingRounds/executeOrder/recordVitals/census)",
    );
  },
};

export default inpatientPlugin;
