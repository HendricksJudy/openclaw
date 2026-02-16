/**
 * ClawHospital - Electronic Medical Records Extension [M04]
 *
 * Provides:
 *   - EMR document CRUD (admission notes, progress notes, discharge summaries, etc.)
 *   - Template management for structured clinical documents
 *   - Document signing and countersigning workflow
 *   - AI-powered quality scoring
 *   - AI Tool for clinical document queries
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { Type } from "@sinclair/typebox";
import { getDb } from "../../src/db/connection.ts";
import {
  emrDocuments,
  emrTemplates,
  type NewEmrDocument,
  type NewEmrTemplate,
} from "../../src/db/schema/emr.ts";
import { visits } from "../../src/db/schema/visits.ts";
import { patients } from "../../src/db/schema/patients.ts";
import { staff } from "../../src/db/schema/staff.ts";
import { eq, and, ilike, or, sql, desc } from "drizzle-orm";

const emrPlugin = {
  id: "clawhospital-emr",
  name: "Electronic Medical Records",
  description: "Clinical document management with templates, signing workflow, and AI quality scoring",
  version: "1.0.0",

  register(api: OpenClawPluginApi) {
    api.logger.info("EMR plugin registering...");

    // ── AI Tool: query_patient_records ──────────────────────────
    api.registerTool(
      {
        name: "query_patient_records",
        description:
          "Retrieve clinical documents (EMR) for a patient. " +
          "Use this when a doctor wants to review a patient's medical history, " +
          "admission notes, progress notes, or discharge summaries.",
        parameters: Type.Object({
          patientId: Type.String({ description: "Patient UUID" }),
          docType: Type.Optional(
            Type.String({
              description:
                "Filter by document type: admission_note, progress_note, discharge_summary, operative_note, consultation_note, nursing_assessment, history_physical",
            }),
          ),
          limit: Type.Optional(Type.Number({ description: "Max results", default: 10 })),
        }),
        async execute(_id, params) {
          const db = getDb();

          const filters = [eq(visits.patientId, params.patientId)];

          let docFilters: ReturnType<typeof and>[] = [];
          if (params.docType) {
            docFilters = [eq(emrDocuments.docType, params.docType)];
          }

          const docs = await db
            .select({
              id: emrDocuments.id,
              docType: emrDocuments.docType,
              signStatus: emrDocuments.signStatus,
              qualityScore: emrDocuments.qualityScore,
              authorName: staff.name,
              visitDate: visits.visitDate,
              contentText: emrDocuments.contentText,
              createdAt: emrDocuments.createdAt,
            })
            .from(emrDocuments)
            .leftJoin(visits, eq(emrDocuments.visitId, visits.id))
            .leftJoin(staff, eq(emrDocuments.authorId, staff.id))
            .where(
              and(
                eq(visits.patientId, params.patientId),
                ...(params.docType ? [eq(emrDocuments.docType, params.docType)] : []),
              ),
            )
            .orderBy(desc(emrDocuments.createdAt))
            .limit(params.limit ?? 10);

          if (docs.length === 0) {
            return { content: [{ type: "text" as const, text: "No clinical documents found for this patient." }] };
          }

          const formatted = docs
            .map(
              (d) =>
                `- **${d.docType}** | Date: ${d.visitDate ? new Date(d.visitDate).toLocaleDateString() : "N/A"} | Author: Dr. ${d.authorName} | Status: ${d.signStatus} | Quality: ${d.qualityScore ?? "N/A"}\n  ${(d.contentText ?? "").slice(0, 200)}${(d.contentText ?? "").length > 200 ? "..." : ""}`,
            )
            .join("\n\n");

          return { content: [{ type: "text" as const, text: `Clinical Documents:\n\n${formatted}` }] };
        },
      },
      { name: "query_patient_records" },
    );

    // ── Gateway RPC: emr.document.create ───────────────────────
    api.registerGatewayMethod("emr.document.create", async (params) => {
      const db = getDb();
      const data = params as NewEmrDocument;

      // Generate plain text rendering from structured content
      if (data.content && !data.contentText) {
        data.contentText = flattenContent(data.content as Record<string, unknown>);
      }

      const [doc] = await db.insert(emrDocuments).values(data).returning();
      return { document: doc };
    });

    // ── Gateway RPC: emr.document.get ──────────────────────────
    api.registerGatewayMethod("emr.document.get", async (params) => {
      const db = getDb();
      const { id } = params as { id: string };

      const [doc] = await db
        .select({
          id: emrDocuments.id,
          visitId: emrDocuments.visitId,
          docType: emrDocuments.docType,
          templateId: emrDocuments.templateId,
          content: emrDocuments.content,
          contentText: emrDocuments.contentText,
          authorId: emrDocuments.authorId,
          authorName: staff.name,
          signStatus: emrDocuments.signStatus,
          signedAt: emrDocuments.signedAt,
          countersignedBy: emrDocuments.countersignedBy,
          countersignedAt: emrDocuments.countersignedAt,
          qualityScore: emrDocuments.qualityScore,
          qualityIssues: emrDocuments.qualityIssues,
          version: emrDocuments.version,
          createdAt: emrDocuments.createdAt,
          updatedAt: emrDocuments.updatedAt,
        })
        .from(emrDocuments)
        .leftJoin(staff, eq(emrDocuments.authorId, staff.id))
        .where(eq(emrDocuments.id, id))
        .limit(1);

      if (!doc) throw new Error(`EMR document not found: ${id}`);
      return { document: doc };
    });

    // ── Gateway RPC: emr.document.update ───────────────────────
    api.registerGatewayMethod("emr.document.update", async (params) => {
      const db = getDb();
      const { id, content, contentText } = params as {
        id: string;
        content?: Record<string, unknown>;
        contentText?: string;
      };

      // Can only edit draft documents
      const [existing] = await db.select().from(emrDocuments).where(eq(emrDocuments.id, id)).limit(1);
      if (!existing) throw new Error(`Document not found: ${id}`);
      if (existing.signStatus !== "draft") {
        throw new Error("Cannot edit a signed document. Create an addendum instead.");
      }

      const updates: Partial<typeof emrDocuments.$inferInsert> = { updatedAt: new Date() };
      if (content) {
        updates.content = content;
        updates.contentText = contentText ?? flattenContent(content);
      }

      // Increment version
      updates.version = String(Number(existing.version) + 1);

      const [updated] = await db
        .update(emrDocuments)
        .set(updates)
        .where(eq(emrDocuments.id, id))
        .returning();

      return { document: updated };
    });

    // ── Gateway RPC: emr.document.sign ─────────────────────────
    api.registerGatewayMethod("emr.document.sign", async (params) => {
      const db = getDb();
      const { id, signerId } = params as { id: string; signerId: string };

      const [existing] = await db.select().from(emrDocuments).where(eq(emrDocuments.id, id)).limit(1);
      if (!existing) throw new Error(`Document not found: ${id}`);

      if (existing.signStatus === "signed" || existing.signStatus === "countersigned") {
        throw new Error("Document already signed.");
      }

      // If the signer is the author, it's a primary sign
      // If different, it's a countersign
      let updates: Partial<typeof emrDocuments.$inferInsert>;
      if (existing.authorId === signerId) {
        updates = {
          signStatus: "signed",
          signedAt: new Date(),
          updatedAt: new Date(),
        };
      } else {
        updates = {
          signStatus: "countersigned",
          countersignedBy: signerId,
          countersignedAt: new Date(),
          updatedAt: new Date(),
        };
      }

      const [updated] = await db
        .update(emrDocuments)
        .set(updates)
        .where(eq(emrDocuments.id, id))
        .returning();

      return { document: updated };
    });

    // ── Gateway RPC: emr.document.listByVisit ──────────────────
    api.registerGatewayMethod("emr.document.listByVisit", async (params) => {
      const db = getDb();
      const { visitId, docType } = params as { visitId: string; docType?: string };

      const filters = [eq(emrDocuments.visitId, visitId)];
      if (docType) filters.push(eq(emrDocuments.docType, docType));

      const docs = await db
        .select({
          id: emrDocuments.id,
          docType: emrDocuments.docType,
          signStatus: emrDocuments.signStatus,
          qualityScore: emrDocuments.qualityScore,
          authorName: staff.name,
          version: emrDocuments.version,
          createdAt: emrDocuments.createdAt,
          updatedAt: emrDocuments.updatedAt,
        })
        .from(emrDocuments)
        .leftJoin(staff, eq(emrDocuments.authorId, staff.id))
        .where(and(...filters))
        .orderBy(desc(emrDocuments.createdAt));

      return { documents: docs };
    });

    // ── Gateway RPC: emr.document.qualityCheck ─────────────────
    api.registerGatewayMethod("emr.document.qualityCheck", async (params) => {
      const db = getDb();
      const { id } = params as { id: string };

      const [doc] = await db.select().from(emrDocuments).where(eq(emrDocuments.id, id)).limit(1);
      if (!doc) throw new Error(`Document not found: ${id}`);

      // Rule-based quality scoring
      const issues: Array<{ code: string; severity: string; message: string; field?: string }> = [];
      const content = doc.content as Record<string, unknown>;

      // Check completeness
      if (!content.chiefComplaint && doc.docType !== "nursing_assessment") {
        issues.push({ code: "QC001", severity: "warning", message: "Chief complaint is missing", field: "chiefComplaint" });
      }
      if (!content.historyOfPresentIllness && ["admission_note", "history_physical"].includes(doc.docType)) {
        issues.push({ code: "QC002", severity: "error", message: "History of present illness is required", field: "historyOfPresentIllness" });
      }
      if (!content.physicalExamination && ["admission_note", "history_physical"].includes(doc.docType)) {
        issues.push({ code: "QC003", severity: "warning", message: "Physical examination findings are missing", field: "physicalExamination" });
      }
      if (!content.assessment && doc.docType !== "nursing_assessment") {
        issues.push({ code: "QC004", severity: "warning", message: "Assessment/diagnosis is missing", field: "assessment" });
      }
      if (!content.plan) {
        issues.push({ code: "QC005", severity: "info", message: "Treatment plan is missing", field: "plan" });
      }
      if (doc.docType === "discharge_summary" && !content.followUpInstructions) {
        issues.push({ code: "QC006", severity: "error", message: "Follow-up instructions required for discharge summary", field: "followUpInstructions" });
      }

      // Text length checks
      const textLen = (doc.contentText ?? "").length;
      if (textLen < 50) {
        issues.push({ code: "QC010", severity: "error", message: "Document content is too brief (less than 50 characters)" });
      }

      // Calculate score: 100 - (errors * 15 + warnings * 5 + info * 1)
      const errorCount = issues.filter((i) => i.severity === "error").length;
      const warnCount = issues.filter((i) => i.severity === "warning").length;
      const infoCount = issues.filter((i) => i.severity === "info").length;
      const score = Math.max(0, 100 - errorCount * 15 - warnCount * 5 - infoCount * 1);

      // Store results
      const [updated] = await db
        .update(emrDocuments)
        .set({
          qualityScore: score.toFixed(2),
          qualityIssues: issues,
          updatedAt: new Date(),
        })
        .where(eq(emrDocuments.id, id))
        .returning();

      return { score, issues, document: updated };
    });

    // ── Gateway RPC: emr.template.create ───────────────────────
    api.registerGatewayMethod("emr.template.create", async (params) => {
      const db = getDb();
      const data = params as NewEmrTemplate;
      const [template] = await db.insert(emrTemplates).values(data).returning();
      return { template };
    });

    // ── Gateway RPC: emr.template.list ─────────────────────────
    api.registerGatewayMethod("emr.template.list", async (params) => {
      const db = getDb();
      const { docType, departmentId } = params as { docType?: string; departmentId?: string };

      const filters = [eq(emrTemplates.isActive, "true")];
      if (docType) filters.push(eq(emrTemplates.docType, docType));
      if (departmentId) filters.push(eq(emrTemplates.departmentId, departmentId));

      const templates = await db
        .select()
        .from(emrTemplates)
        .where(and(...filters));

      return { templates };
    });

    // ── Gateway RPC: emr.pendingSigning ────────────────────────
    api.registerGatewayMethod("emr.pendingSigning", async (params) => {
      const db = getDb();
      const { authorId, limit = 50 } = params as { authorId?: string; limit?: number };

      const filters = [eq(emrDocuments.signStatus, "draft")];
      if (authorId) filters.push(eq(emrDocuments.authorId, authorId));

      const pending = await db
        .select({
          id: emrDocuments.id,
          docType: emrDocuments.docType,
          patientName: patients.name,
          patientMrn: patients.medicalRecordNo,
          authorName: staff.name,
          visitDate: visits.visitDate,
          createdAt: emrDocuments.createdAt,
        })
        .from(emrDocuments)
        .leftJoin(visits, eq(emrDocuments.visitId, visits.id))
        .leftJoin(patients, eq(visits.patientId, patients.id))
        .leftJoin(staff, eq(emrDocuments.authorId, staff.id))
        .where(and(...filters))
        .orderBy(emrDocuments.createdAt)
        .limit(limit);

      return { documents: pending };
    });

    api.logger.info(
      "EMR plugin registered " +
      "(tools: query_patient_records; " +
      "RPC: emr.document.create/get/update/sign/listByVisit/qualityCheck, " +
      "emr.template.create/list, emr.pendingSigning)",
    );
  },
};

/** Flatten structured JSON content into plain text for search indexing. */
function flattenContent(content: Record<string, unknown>, depth = 0): string {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(content)) {
    if (value == null) continue;
    const label = key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase());
    if (typeof value === "string") {
      lines.push(`${label}: ${value}`);
    } else if (typeof value === "object" && !Array.isArray(value)) {
      lines.push(`${label}:`);
      lines.push(flattenContent(value as Record<string, unknown>, depth + 1));
    } else if (Array.isArray(value)) {
      lines.push(`${label}: ${value.map((v) => (typeof v === "object" ? JSON.stringify(v) : String(v))).join(", ")}`);
    } else {
      lines.push(`${label}: ${String(value)}`);
    }
  }
  return lines.join("\n");
}

export default emrPlugin;
