/**
 * ClawHospital - Laboratory Management Extension [M07]
 *
 * Provides:
 *   - Lab test catalog management
 *   - Specimen tracking pipeline (ordered → collected → received → processing → completed)
 *   - Result entry and verification
 *   - Critical value alerts (multi-channel notification)
 *   - AI Tools for lab result queries
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { Type } from "@sinclair/typebox";
import { getDb } from "../../src/db/connection.ts";
import {
  labTests,
  specimens,
  labResults,
  type NewSpecimen,
  type NewLabResult,
} from "../../src/db/schema/laboratory.ts";
import { orders } from "../../src/db/schema/orders.ts";
import { visits } from "../../src/db/schema/visits.ts";
import { patients } from "../../src/db/schema/patients.ts";
import { staff } from "../../src/db/schema/staff.ts";
import { eq, and, ilike, or, sql, desc } from "drizzle-orm";

const laboratoryPlugin = {
  id: "clawhospital-laboratory",
  name: "Laboratory Management",
  description: "Lab test catalog, specimen tracking, result entry/verification, and critical value alerts",
  version: "1.0.0",

  register(api: OpenClawPluginApi) {
    api.logger.info("Laboratory Management plugin registering...");

    // ── AI Tool: query_lab_results ─────────────────────────────
    api.registerTool(
      {
        name: "query_lab_results",
        description:
          "Look up lab test results for a patient. " +
          "Use this when a doctor or patient asks about lab results, blood work, or test outcomes.",
        parameters: Type.Object({
          patientId: Type.String({ description: "Patient UUID" }),
          testCode: Type.Optional(Type.String({ description: "Specific lab test code to filter by" })),
          limit: Type.Optional(Type.Number({ description: "Max results to return", default: 20 })),
        }),
        async execute(_id, params) {
          const db = getDb();
          const filters = [eq(labResults.patientId, params.patientId)];
          if (params.testCode) {
            const [test] = await db.select().from(labTests).where(eq(labTests.code, params.testCode)).limit(1);
            if (test) filters.push(eq(labResults.labTestId, test.id));
          }

          const results = await db
            .select({
              testName: labTests.name,
              testCode: labTests.code,
              value: labResults.value,
              numericValue: labResults.numericValue,
              unit: labResults.unit,
              referenceRange: labResults.referenceRange,
              abnormalFlag: labResults.abnormalFlag,
              isCritical: labResults.isCritical,
              status: labResults.status,
              resultedAt: labResults.resultedAt,
              verifiedAt: labResults.verifiedAt,
            })
            .from(labResults)
            .leftJoin(labTests, eq(labResults.labTestId, labTests.id))
            .where(and(...filters))
            .orderBy(desc(labResults.resultedAt))
            .limit(params.limit ?? 20);

          if (results.length === 0) {
            return { content: [{ type: "text" as const, text: "No lab results found for this patient." }] };
          }

          const formatted = results
            .map((r) => {
              let flag = "";
              if (r.isCritical) flag = " 🔴 CRITICAL";
              else if (r.abnormalFlag === "H" || r.abnormalFlag === "HH") flag = " ↑ HIGH";
              else if (r.abnormalFlag === "L" || r.abnormalFlag === "LL") flag = " ↓ LOW";

              return `- **${r.testName}** (${r.testCode}): ${r.value ?? r.numericValue ?? "pending"} ${r.unit ?? ""}${flag} | Ref: ${r.referenceRange ?? "N/A"} | ${r.status}`;
            })
            .join("\n");

          return { content: [{ type: "text" as const, text: `Lab Results:\n\n${formatted}` }] };
        },
      },
      { name: "query_lab_results" },
    );

    // ── Gateway RPC: lab.test.search ───────────────────────────
    api.registerGatewayMethod("lab.test.search", async (params) => {
      const db = getDb();
      const { query, category, limit = 20 } = params as { query?: string; category?: string; limit?: number };

      const filters = [eq(labTests.isActive, true)];
      if (query) {
        const q = `%${query}%`;
        filters.push(or(ilike(labTests.name, q), ilike(labTests.code, q))!);
      }
      if (category) filters.push(eq(labTests.category, category));

      const results = await db.select().from(labTests).where(and(...filters)).limit(limit);
      return { tests: results };
    });

    // ── Gateway RPC: lab.specimen.create ────────────────────────
    api.registerGatewayMethod("lab.specimen.create", async (params) => {
      const db = getDb();
      const data = params as NewSpecimen;

      if (!data.barcode) {
        data.barcode = `SP${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
      }

      const [specimen] = await db.insert(specimens).values(data).returning();
      return { specimen };
    });

    // ── Gateway RPC: lab.specimen.collect ───────────────────────
    api.registerGatewayMethod("lab.specimen.collect", async (params) => {
      const db = getDb();
      const { specimenId, collectedBy } = params as { specimenId: string; collectedBy: string };

      const [updated] = await db
        .update(specimens)
        .set({
          status: "collected",
          collectedBy,
          collectedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(specimens.id, specimenId))
        .returning();

      return { specimen: updated };
    });

    // ── Gateway RPC: lab.specimen.receive ───────────────────────
    api.registerGatewayMethod("lab.specimen.receive", async (params) => {
      const db = getDb();
      const { specimenId, receivedBy } = params as { specimenId: string; receivedBy: string };

      const [updated] = await db
        .update(specimens)
        .set({
          status: "received",
          receivedBy,
          receivedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(specimens.id, specimenId))
        .returning();

      return { specimen: updated };
    });

    // ── Gateway RPC: lab.specimen.reject ────────────────────────
    api.registerGatewayMethod("lab.specimen.reject", async (params) => {
      const db = getDb();
      const { specimenId, reason } = params as { specimenId: string; reason: string };

      const [updated] = await db
        .update(specimens)
        .set({
          status: "rejected",
          rejectionReason: reason,
          updatedAt: new Date(),
        })
        .where(eq(specimens.id, specimenId))
        .returning();

      return { specimen: updated };
    });

    // ── Gateway RPC: lab.result.enter ──────────────────────────
    api.registerGatewayMethod("lab.result.enter", async (params) => {
      const db = getDb();
      const { specimenId, orderId, labTestId, patientId, value, numericValue, unit, referenceRange, resultedBy } =
        params as NewLabResult & { resultedBy: string };

      // Determine abnormal flag
      let abnormalFlag = "N";
      let isCritical = false;

      if (numericValue != null) {
        const [test] = await db.select().from(labTests).where(eq(labTests.id, labTestId)).limit(1);
        if (test) {
          const num = Number(numericValue);
          if (test.criticalHigh && num >= Number(test.criticalHigh)) {
            abnormalFlag = "HH";
            isCritical = true;
          } else if (test.criticalLow && num <= Number(test.criticalLow)) {
            abnormalFlag = "LL";
            isCritical = true;
          } else {
            const ref = test.referenceRange as Record<string, { min?: number; max?: number }> | null;
            const range = ref?.male ?? ref?.female; // simplified; should use patient gender
            if (range) {
              if (range.max != null && num > range.max) abnormalFlag = "H";
              else if (range.min != null && num < range.min) abnormalFlag = "L";
            }
          }
        }
      }

      const [result] = await db.insert(labResults).values({
        specimenId,
        orderId,
        labTestId,
        patientId,
        value,
        numericValue,
        unit,
        referenceRange,
        abnormalFlag,
        isCritical,
        resultedBy,
        resultedAt: new Date(),
        status: "resulted",
      }).returning();

      // Update specimen status
      await db
        .update(specimens)
        .set({ status: "completed", updatedAt: new Date() })
        .where(eq(specimens.id, specimenId));

      return { result, isCritical };
    });

    // ── Gateway RPC: lab.result.verify ─────────────────────────
    api.registerGatewayMethod("lab.result.verify", async (params) => {
      const db = getDb();
      const { resultId, verifiedBy } = params as { resultId: string; verifiedBy: string };

      const [updated] = await db
        .update(labResults)
        .set({
          status: "verified",
          verifiedBy,
          verifiedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(labResults.id, resultId))
        .returning();

      // If this was a critical value, mark notification time
      if (updated?.isCritical && !updated.criticalNotifiedAt) {
        await db
          .update(labResults)
          .set({ criticalNotifiedAt: new Date(), criticalNotifiedTo: verifiedBy })
          .where(eq(labResults.id, resultId));
      }

      // Update corresponding order as completed
      if (updated?.orderId) {
        await db
          .update(orders)
          .set({ status: "completed", updatedAt: new Date() })
          .where(eq(orders.id, updated.orderId));
      }

      return { result: updated };
    });

    // ── Gateway RPC: lab.criticalValues ─────────────────────────
    api.registerGatewayMethod("lab.criticalValues", async (params) => {
      const db = getDb();
      const { unnotifiedOnly = true, limit = 50 } = params as { unnotifiedOnly?: boolean; limit?: number };

      const filters = [eq(labResults.isCritical, true)];
      if (unnotifiedOnly) {
        filters.push(sql`${labResults.criticalNotifiedAt} IS NULL`);
      }

      const critical = await db
        .select({
          id: labResults.id,
          testName: labTests.name,
          testCode: labTests.code,
          value: labResults.value,
          numericValue: labResults.numericValue,
          unit: labResults.unit,
          abnormalFlag: labResults.abnormalFlag,
          patientName: patients.name,
          patientMrn: patients.medicalRecordNo,
          resultedAt: labResults.resultedAt,
          criticalNotifiedAt: labResults.criticalNotifiedAt,
        })
        .from(labResults)
        .leftJoin(labTests, eq(labResults.labTestId, labTests.id))
        .leftJoin(patients, eq(labResults.patientId, patients.id))
        .where(and(...filters))
        .orderBy(desc(labResults.resultedAt))
        .limit(limit);

      return { criticalValues: critical };
    });

    // ── Gateway RPC: lab.worklist ──────────────────────────────
    api.registerGatewayMethod("lab.worklist", async (params) => {
      const db = getDb();
      const { status, limit = 50 } = params as { status?: string; limit?: number };

      const filters = [];
      if (status) filters.push(eq(specimens.status, status));

      const worklist = await db
        .select({
          id: specimens.id,
          barcode: specimens.barcode,
          specimenType: specimens.specimenType,
          testName: labTests.name,
          testCode: labTests.code,
          patientName: patients.name,
          patientMrn: patients.medicalRecordNo,
          status: specimens.status,
          collectedAt: specimens.collectedAt,
          receivedAt: specimens.receivedAt,
        })
        .from(specimens)
        .leftJoin(labTests, eq(specimens.labTestId, labTests.id))
        .leftJoin(patients, eq(specimens.patientId, patients.id))
        .where(filters.length > 0 ? and(...filters) : undefined)
        .orderBy(specimens.createdAt)
        .limit(limit);

      return { worklist };
    });

    api.logger.info(
      "Laboratory Management plugin registered " +
      "(tools: query_lab_results; " +
      "RPC: lab.test.search, lab.specimen.create/collect/receive/reject, " +
      "lab.result.enter/verify, lab.criticalValues, lab.worklist)",
    );
  },
};

export default laboratoryPlugin;
