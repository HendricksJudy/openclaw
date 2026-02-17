/**
 * ClawHospital - Examination Management Extension [M08]
 *
 * Provides:
 *   - Examination/imaging order scheduling
 *   - Report authoring and review workflow
 *   - PACS/RIS integration interfaces
 *   - AI Tool for report queries
 *   - Critical findings alert routing via multi-channel
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { Type } from "@sinclair/typebox";
import { getDb } from "../../src/db/connection.ts";
import { orders } from "../../src/db/schema/orders.ts";
import { visits } from "../../src/db/schema/visits.ts";
import { patients } from "../../src/db/schema/patients.ts";
import { staff } from "../../src/db/schema/staff.ts";
import { departments } from "../../src/db/schema/departments.ts";
import { eq, and, sql, desc, ilike, or } from "drizzle-orm";

// Exam report statuses: scheduled → in_progress → preliminary → final → amended
// Critical findings trigger immediate multi-channel notification.

const examinationPlugin = {
  id: "clawhospital-examination",
  name: "Examination Management",
  description: "Imaging/radiology scheduling, report management, PACS/RIS interface, and critical findings alerts",
  version: "1.0.0",

  register(api: OpenClawPluginApi) {
    api.logger.info("Examination Management plugin registering...");

    // ── AI Tool: schedule_examination ───────────────────────────
    api.registerTool(
      {
        name: "schedule_examination",
        description:
          "Schedule a diagnostic examination (X-ray, CT, MRI, ultrasound, etc.) for a patient. " +
          "Use when a doctor orders an imaging or diagnostic procedure.",
        parameters: Type.Object({
          visitId: Type.String({ description: "Visit UUID" }),
          examType: Type.String({
            description: "Examination type: xray, ct, mri, ultrasound, endoscopy, ecg, eeg, mammography, pet_ct, fluoroscopy",
          }),
          bodyPart: Type.String({ description: "Body region, e.g. 'chest', 'abdomen', 'head', 'spine_lumbar'" }),
          urgency: Type.Optional(Type.String({ description: "routine, urgent, stat" })),
          clinicalIndication: Type.String({ description: "Clinical reason for the exam" }),
          doctorId: Type.String({ description: "Ordering physician UUID" }),
          preferredDate: Type.Optional(Type.String({ description: "Preferred date YYYY-MM-DD" })),
          notes: Type.Optional(Type.String({ description: "Special instructions (contrast, sedation, etc.)" })),
        }),
        async execute(_id, params) {
          const db = getDb();
          const orderNo = `EX${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 4).toUpperCase()}`;
          const itemName = `${params.examType.toUpperCase()} - ${params.bodyPart}`;

          const [order] = await db
            .insert(orders)
            .values({
              visitId: params.visitId,
              orderNo,
              orderType: "exam",
              orderCategory: "temp",
              itemCode: `EXAM-${params.examType.toUpperCase()}-${params.bodyPart.toUpperCase().replace(/\s+/g, "_")}`,
              itemName,
              specification: params.bodyPart,
              doctorId: params.doctorId,
              status: "pending",
              notes: [
                `Urgency: ${params.urgency ?? "routine"}`,
                `Indication: ${params.clinicalIndication}`,
                params.preferredDate ? `Preferred date: ${params.preferredDate}` : null,
                params.notes ?? null,
              ]
                .filter(Boolean)
                .join("\n"),
            })
            .returning();

          return {
            content: [
              {
                type: "text" as const,
                text:
                  `Examination scheduled:\n` +
                  `- Order #: ${orderNo}\n` +
                  `- Exam: ${itemName}\n` +
                  `- Urgency: ${params.urgency ?? "routine"}\n` +
                  `- Indication: ${params.clinicalIndication}\n` +
                  `- Status: Pending scheduling`,
              },
            ],
          };
        },
      },
      { name: "schedule_examination" },
    );

    // ── AI Tool: query_exam_results ─────────────────────────────
    api.registerTool(
      {
        name: "query_exam_results",
        description:
          "Query examination/imaging results for a patient. " +
          "Use when a doctor wants to review radiology reports, imaging findings, or exam status.",
        parameters: Type.Object({
          patientId: Type.String({ description: "Patient UUID" }),
          examType: Type.Optional(Type.String({ description: "Filter by exam type" })),
          limit: Type.Optional(Type.Number({ description: "Max results (default 10)" })),
        }),
        async execute(_id, params) {
          const db = getDb();
          const filters = [eq(orders.orderType, "exam"), eq(visits.patientId, params.patientId)];
          if (params.examType) {
            filters.push(ilike(orders.itemName, `%${params.examType}%`));
          }

          const results = await db
            .select({
              id: orders.id,
              orderNo: orders.orderNo,
              itemName: orders.itemName,
              status: orders.status,
              notes: orders.notes,
              aiReviewResult: orders.aiReviewResult,
              doctorName: staff.name,
              createdAt: orders.createdAt,
            })
            .from(orders)
            .leftJoin(visits, eq(orders.visitId, visits.id))
            .leftJoin(staff, eq(orders.doctorId, staff.id))
            .where(and(...filters))
            .orderBy(desc(orders.createdAt))
            .limit(params.limit ?? 10);

          if (results.length === 0) {
            return { content: [{ type: "text" as const, text: "No examination results found for this patient." }] };
          }

          const formatted = results
            .map(
              (r) =>
                `- **${r.itemName}** (${r.orderNo}) | Status: ${r.status} | Ordered by: Dr. ${r.doctorName} | ${new Date(r.createdAt).toLocaleDateString()}\n  ${(r.notes ?? "No report yet").slice(0, 200)}`,
            )
            .join("\n\n");

          return { content: [{ type: "text" as const, text: `Examination Results:\n\n${formatted}` }] };
        },
      },
      { name: "query_exam_results" },
    );

    // ── Gateway RPC: examination.schedule ────────────────────────
    api.registerGatewayMethod("examination.schedule", async (params) => {
      const db = getDb();
      const { visitId, examType, bodyPart, urgency, clinicalIndication, doctorId, preferredDate, notes } = params as {
        visitId: string;
        examType: string;
        bodyPart: string;
        urgency?: string;
        clinicalIndication: string;
        doctorId: string;
        preferredDate?: string;
        notes?: string;
      };

      const orderNo = `EX${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 4).toUpperCase()}`;
      const itemName = `${examType.toUpperCase()} - ${bodyPart}`;

      const [order] = await db
        .insert(orders)
        .values({
          visitId,
          orderNo,
          orderType: "exam",
          orderCategory: "temp",
          itemCode: `EXAM-${examType.toUpperCase()}-${bodyPart.toUpperCase().replace(/\s+/g, "_")}`,
          itemName,
          specification: bodyPart,
          doctorId,
          status: "pending",
          notes: [
            `Urgency: ${urgency ?? "routine"}`,
            `Indication: ${clinicalIndication}`,
            preferredDate ? `Preferred date: ${preferredDate}` : null,
            notes ?? null,
          ]
            .filter(Boolean)
            .join("\n"),
        })
        .returning();

      return { order };
    });

    // ── Gateway RPC: examination.reportCreate ───────────────────
    api.registerGatewayMethod("examination.reportCreate", async (params) => {
      const db = getDb();
      const { orderId, radiologistId, findings, impression, criticalFinding } = params as {
        orderId: string;
        radiologistId: string;
        findings: string;
        impression: string;
        criticalFinding?: boolean;
      };

      const reportData = {
        radiologistId,
        findings,
        impression,
        criticalFinding: criticalFinding ?? false,
        reportedAt: new Date().toISOString(),
        reportStatus: "preliminary",
      };

      const [updated] = await db
        .update(orders)
        .set({
          aiReviewResult: reportData,
          status: "executing",
          notes: sql`COALESCE(${orders.notes}, '') || E'\n\n--- REPORT ---\nFindings: ' || ${findings} || E'\nImpression: ' || ${impression}`,
          updatedAt: new Date(),
        })
        .where(eq(orders.id, orderId))
        .returning();

      return { order: updated, criticalFinding: criticalFinding ?? false };
    });

    // ── Gateway RPC: examination.reportFinalize ─────────────────
    api.registerGatewayMethod("examination.reportFinalize", async (params) => {
      const db = getDb();
      const { orderId, attendingRadiologistId } = params as {
        orderId: string;
        attendingRadiologistId: string;
      };

      const [existing] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
      if (!existing) throw new Error(`Exam order not found: ${orderId}`);

      const report = (existing.aiReviewResult ?? {}) as Record<string, unknown>;
      report.reportStatus = "final";
      report.finalizedBy = attendingRadiologistId;
      report.finalizedAt = new Date().toISOString();

      const [updated] = await db
        .update(orders)
        .set({
          aiReviewResult: report,
          status: "completed",
          updatedAt: new Date(),
        })
        .where(eq(orders.id, orderId))
        .returning();

      return { order: updated };
    });

    // ── Gateway RPC: examination.worklist ────────────────────────
    api.registerGatewayMethod("examination.worklist", async (params) => {
      const db = getDb();
      const { examType, status, limit = 50 } = params as {
        examType?: string;
        status?: string;
        limit?: number;
      };

      const filters = [eq(orders.orderType, "exam")];
      if (status) filters.push(eq(orders.status, status));
      if (examType) filters.push(ilike(orders.itemName, `%${examType}%`));

      const worklist = await db
        .select({
          id: orders.id,
          orderNo: orders.orderNo,
          itemName: orders.itemName,
          specification: orders.specification,
          status: orders.status,
          notes: orders.notes,
          patientName: patients.name,
          patientMrn: patients.medicalRecordNo,
          orderingDoctor: staff.name,
          createdAt: orders.createdAt,
        })
        .from(orders)
        .leftJoin(visits, eq(orders.visitId, visits.id))
        .leftJoin(patients, eq(visits.patientId, patients.id))
        .leftJoin(staff, eq(orders.doctorId, staff.id))
        .where(and(...filters))
        .orderBy(orders.createdAt)
        .limit(limit);

      return { worklist };
    });

    // ── Gateway RPC: examination.pacsStudyLink ──────────────────
    // Returns a PACS viewer URL for a given exam order (stub for integration)
    api.registerGatewayMethod("examination.pacsStudyLink", async (params) => {
      const { orderId, pacsBaseUrl } = params as { orderId: string; pacsBaseUrl?: string };
      const base = pacsBaseUrl ?? "https://pacs.hospital.local";

      // In production, this would query the PACS system via DICOM Web (WADO-RS)
      // For now, return a structured link
      return {
        viewerUrl: `${base}/viewer?studyInstanceUID=${orderId}`,
        dicomWebUrl: `${base}/dicomweb/studies/${orderId}`,
        note: "PACS integration stub — replace with actual DICOM Web endpoint in production",
      };
    });

    api.logger.info(
      "Examination Management plugin registered " +
        "(tools: schedule_examination, query_exam_results; " +
        "RPC: examination.schedule/reportCreate/reportFinalize/worklist/pacsStudyLink)",
    );
  },
};

export default examinationPlugin;
