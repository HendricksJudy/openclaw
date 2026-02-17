/**
 * ClawHospital - Pharmacy Management Extension [M06]
 *
 * Provides:
 *   - Drug catalog management
 *   - Drug inventory tracking
 *   - Prescription dispensing workflow
 *   - Drug interaction checking (AI Tool)
 *   - Return/refund handling
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { Type } from "@sinclair/typebox";
import { getDb } from "../../src/db/connection.ts";
import {
  drugs,
  drugInventory,
  dispensingRecords,
  type NewDispensingRecord,
} from "../../src/db/schema/pharmacy.ts";
import { orders } from "../../src/db/schema/orders.ts";
import { visits } from "../../src/db/schema/visits.ts";
import { patients } from "../../src/db/schema/patients.ts";
import { staff } from "../../src/db/schema/staff.ts";
import { eq, and, ilike, or, sql, lte, desc, gt } from "drizzle-orm";

const pharmacyPlugin = {
  id: "clawhospital-pharmacy",
  name: "Pharmacy Management",
  description: "Drug catalog, inventory, dispensing workflow, and interaction checking",
  version: "1.0.0",

  register(api: OpenClawPluginApi) {
    api.logger.info("Pharmacy Management plugin registering...");

    // ── AI Tool: check_drug_interactions ────────────────────────
    api.registerTool(
      {
        name: "check_drug_interactions",
        description:
          "Check for drug-drug interactions between multiple medications. " +
          "Use this before approving a drug order or when a doctor/pharmacist wants to verify safety.",
        parameters: Type.Object({
          drugCodes: Type.Array(Type.String(), {
            description: "Array of drug codes to check for interactions",
          }),
        }),
        async execute(_id, params) {
          const db = getDb();

          const drugList = await db
            .select({
              code: drugs.code,
              genericName: drugs.genericName,
              interactions: drugs.interactions,
              contraindications: drugs.contraindications,
            })
            .from(drugs)
            .where(sql`${drugs.code} = ANY(${params.drugCodes})`);

          const warnings: string[] = [];

          // Check pairwise interactions
          for (let i = 0; i < drugList.length; i++) {
            const drug = drugList[i]!;
            const interactions = (drug.interactions as Array<{ drugCode: string; severity: string; description: string }>) ?? [];
            for (const interaction of interactions) {
              if (params.drugCodes.includes(interaction.drugCode)) {
                const otherDrug = drugList.find((d) => d.code === interaction.drugCode);
                warnings.push(
                  `⚠️ [${interaction.severity.toUpperCase()}] ${drug.genericName} ↔ ${otherDrug?.genericName ?? interaction.drugCode}: ${interaction.description}`,
                );
              }
            }
          }

          if (warnings.length === 0) {
            return {
              content: [{
                type: "text" as const,
                text: `No known interactions found between the ${params.drugCodes.length} medications checked.`,
              }],
            };
          }

          return {
            content: [{
              type: "text" as const,
              text: `Found ${warnings.length} interaction warning(s):\n\n${warnings.join("\n")}`,
            }],
          };
        },
      },
      { name: "check_drug_interactions" },
    );

    // ── AI Tool: search_drug ───────────────────────────────────
    api.registerTool(
      {
        name: "search_drug",
        description:
          "Search the drug catalog by name, code, or category. " +
          "Use this when a doctor asks about a medication or needs to find a drug code.",
        parameters: Type.Object({
          query: Type.String({ description: "Drug name, code, or category to search for" }),
          limit: Type.Optional(Type.Number({ description: "Max results", default: 10 })),
        }),
        async execute(_id, params) {
          const db = getDb();
          const q = `%${params.query}%`;

          const results = await db
            .select({
              code: drugs.code,
              genericName: drugs.genericName,
              brandName: drugs.brandName,
              dosageForm: drugs.dosageForm,
              strength: drugs.strength,
              category: drugs.category,
              unitPrice: drugs.unitPrice,
            })
            .from(drugs)
            .where(
              and(
                eq(drugs.isActive, true),
                or(
                  ilike(drugs.genericName, q),
                  ilike(drugs.brandName, q),
                  ilike(drugs.code, q),
                  ilike(drugs.category, q),
                ),
              ),
            )
            .limit(params.limit ?? 10);

          if (results.length === 0) {
            return { content: [{ type: "text" as const, text: `No drugs found matching "${params.query}".` }] };
          }

          const formatted = results
            .map((d) =>
              `- **${d.genericName}**${d.brandName ? ` (${d.brandName})` : ""} | Code: ${d.code} | ${d.dosageForm} ${d.strength} | ${d.category ?? ""} | $${d.unitPrice ?? "N/A"}`,
            )
            .join("\n");

          return { content: [{ type: "text" as const, text: `Found ${results.length} drug(s):\n\n${formatted}` }] };
        },
      },
      { name: "search_drug" },
    );

    // ── Gateway RPC: pharmacy.drug.search ──────────────────────
    api.registerGatewayMethod("pharmacy.drug.search", async (params) => {
      const db = getDb();
      const { query, category, limit = 20 } = params as { query?: string; category?: string; limit?: number };

      const filters = [eq(drugs.isActive, true)];
      if (query) {
        const q = `%${query}%`;
        filters.push(or(ilike(drugs.genericName, q), ilike(drugs.brandName, q), ilike(drugs.code, q))!);
      }
      if (category) filters.push(eq(drugs.category, category));

      const results = await db.select().from(drugs).where(and(...filters)).limit(limit);
      return { drugs: results };
    });

    // ── Gateway RPC: pharmacy.dispense ─────────────────────────
    api.registerGatewayMethod("pharmacy.dispense", async (params) => {
      const db = getDb();
      const { orderId, drugId, quantity, dispensedBy, verifiedBy } = params as {
        orderId: string;
        drugId: string;
        quantity: number;
        dispensedBy: string;
        verifiedBy?: string;
      };

      // Get order and visit info
      const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
      if (!order) throw new Error(`Order not found: ${orderId}`);

      const [visit] = await db.select().from(visits).where(eq(visits.id, order.visitId)).limit(1);
      if (!visit) throw new Error(`Visit not found for order: ${orderId}`);

      // Create dispensing record
      const [record] = await db.insert(dispensingRecords).values({
        orderId,
        visitId: order.visitId,
        patientId: visit.patientId,
        drugId,
        quantity: quantity.toString(),
        dispensedBy,
        verifiedBy,
        status: "dispensed",
      } satisfies NewDispensingRecord).returning();

      // Deduct from inventory (FIFO by expiry date)
      let remaining = quantity;
      const inventoryItems = await db
        .select()
        .from(drugInventory)
        .where(and(eq(drugInventory.drugId, drugId), gt(drugInventory.quantity, 0)))
        .orderBy(drugInventory.expiryDate);

      for (const item of inventoryItems) {
        if (remaining <= 0) break;
        const deduct = Math.min(remaining, item.quantity);
        await db
          .update(drugInventory)
          .set({ quantity: item.quantity - deduct, updatedAt: new Date() })
          .where(eq(drugInventory.id, item.id));
        remaining -= deduct;
      }

      // Update order status
      await db
        .update(orders)
        .set({ status: "completed", updatedAt: new Date() })
        .where(eq(orders.id, orderId));

      return { dispensingRecord: record };
    });

    // ── Gateway RPC: pharmacy.pendingOrders ─────────────────────
    api.registerGatewayMethod("pharmacy.pendingOrders", async (params) => {
      const db = getDb();
      const { limit = 50 } = params as { limit?: number };

      const pending = await db
        .select({
          id: orders.id,
          orderNo: orders.orderNo,
          itemCode: orders.itemCode,
          itemName: orders.itemName,
          dosage: orders.dosage,
          frequency: orders.frequency,
          route: orders.route,
          quantity: orders.quantity,
          unit: orders.unit,
          patientName: patients.name,
          patientMrn: patients.medicalRecordNo,
          doctorName: staff.name,
          createdAt: orders.createdAt,
        })
        .from(orders)
        .leftJoin(visits, eq(orders.visitId, visits.id))
        .leftJoin(patients, eq(visits.patientId, patients.id))
        .leftJoin(staff, eq(orders.doctorId, staff.id))
        .where(and(eq(orders.orderType, "drug"), eq(orders.status, "approved")))
        .orderBy(orders.createdAt)
        .limit(limit);

      return { orders: pending };
    });

    // ── Gateway RPC: pharmacy.inventory.check ──────────────────
    api.registerGatewayMethod("pharmacy.inventory.check", async (params) => {
      const db = getDb();
      const { drugId, locationId } = params as { drugId?: string; locationId?: string };

      const filters = [];
      if (drugId) filters.push(eq(drugInventory.drugId, drugId));
      if (locationId) filters.push(eq(drugInventory.locationId, locationId));

      const items = await db
        .select({
          id: drugInventory.id,
          drugId: drugInventory.drugId,
          drugName: drugs.genericName,
          drugCode: drugs.code,
          locationId: drugInventory.locationId,
          batchNo: drugInventory.batchNo,
          quantity: drugInventory.quantity,
          expiryDate: drugInventory.expiryDate,
          minStock: drugInventory.minStock,
        })
        .from(drugInventory)
        .leftJoin(drugs, eq(drugInventory.drugId, drugs.id))
        .where(filters.length > 0 ? and(...filters) : undefined)
        .orderBy(drugInventory.expiryDate);

      return { inventory: items };
    });

    // ── Gateway RPC: pharmacy.inventory.lowStock ───────────────
    api.registerGatewayMethod("pharmacy.inventory.lowStock", async (params) => {
      const db = getDb();
      const { locationId } = params as { locationId?: string };

      const filters = [sql`${drugInventory.quantity} <= ${drugInventory.minStock}`];
      if (locationId) filters.push(eq(drugInventory.locationId, locationId));

      const lowStock = await db
        .select({
          drugId: drugInventory.drugId,
          drugName: drugs.genericName,
          drugCode: drugs.code,
          batchNo: drugInventory.batchNo,
          quantity: drugInventory.quantity,
          minStock: drugInventory.minStock,
          expiryDate: drugInventory.expiryDate,
        })
        .from(drugInventory)
        .leftJoin(drugs, eq(drugInventory.drugId, drugs.id))
        .where(and(...filters))
        .orderBy(drugInventory.quantity);

      return { lowStockItems: lowStock };
    });

    // ── Gateway RPC: pharmacy.inventory.expiring ───────────────
    api.registerGatewayMethod("pharmacy.inventory.expiring", async (params) => {
      const db = getDb();
      const { daysAhead = 90 } = params as { daysAhead?: number };

      const expiryLimit = new Date();
      expiryLimit.setDate(expiryLimit.getDate() + daysAhead);

      const expiring = await db
        .select({
          drugId: drugInventory.drugId,
          drugName: drugs.genericName,
          drugCode: drugs.code,
          batchNo: drugInventory.batchNo,
          quantity: drugInventory.quantity,
          expiryDate: drugInventory.expiryDate,
        })
        .from(drugInventory)
        .leftJoin(drugs, eq(drugInventory.drugId, drugs.id))
        .where(and(lte(drugInventory.expiryDate, expiryLimit.toISOString().split("T")[0]!), gt(drugInventory.quantity, 0)))
        .orderBy(drugInventory.expiryDate);

      return { expiringItems: expiring };
    });

    api.logger.info(
      "Pharmacy Management plugin registered " +
      "(tools: check_drug_interactions, search_drug; " +
      "RPC: pharmacy.drug.search, pharmacy.dispense, pharmacy.pendingOrders, " +
      "pharmacy.inventory.check/lowStock/expiring)",
    );
  },
};

export default pharmacyPlugin;
