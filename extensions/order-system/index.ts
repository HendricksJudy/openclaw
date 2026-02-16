/**
 * ClawHospital - Order System Extension [M05]
 *
 * Provides:
 *   - Medical order creation (drug, lab, exam, procedure)
 *   - Order status workflow (pending → reviewing → approved → executing → completed)
 *   - Pharmacist review workflow
 *   - Order execution tracking
 *   - AI Tools for order creation assistance
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { Type } from "@sinclair/typebox";
import { getDb } from "../../src/db/connection.ts";
import { orders, orderExecutions, type NewOrder, type NewOrderExecution } from "../../src/db/schema/orders.ts";
import { visits } from "../../src/db/schema/visits.ts";
import { staff } from "../../src/db/schema/staff.ts";
import { patients } from "../../src/db/schema/patients.ts";
import { eq, and, inArray, sql, desc } from "drizzle-orm";

const orderSystemPlugin = {
  id: "clawhospital-order-system",
  name: "Order System",
  description: "Medical order lifecycle management: creation, review, approval, execution, and tracking",
  version: "1.0.0",

  register(api: OpenClawPluginApi) {
    api.logger.info("Order System plugin registering...");

    // ── AI Tool: create_order ──────────────────────────────────
    api.registerTool(
      {
        name: "create_medical_order",
        description:
          "Create a medical order (drug prescription, lab test, examination, or procedure) for a patient visit. " +
          "Use this when a doctor wants to prescribe medication, order lab tests, or request procedures.",
        parameters: Type.Object({
          visitId: Type.String({ description: "Visit UUID" }),
          orderType: Type.String({ description: "Type: drug, lab, exam, procedure" }),
          itemCode: Type.String({ description: "Item/drug code from the catalog" }),
          itemName: Type.String({ description: "Item/drug name" }),
          doctorId: Type.String({ description: "Ordering doctor UUID" }),
          specification: Type.Optional(Type.String({ description: "Drug specification, e.g. '500mg tablet'" })),
          dosage: Type.Optional(Type.String({ description: "Dosage, e.g. '500mg'" })),
          frequency: Type.Optional(Type.String({ description: "Frequency, e.g. 'TID' (three times daily)" })),
          route: Type.Optional(Type.String({ description: "Route: oral, iv, im, sc, topical, etc." })),
          quantity: Type.Optional(Type.Number({ description: "Quantity to prescribe/order" })),
          unit: Type.Optional(Type.String({ description: "Unit: tablet, vial, ml, test, etc." })),
          orderCategory: Type.Optional(Type.String({ description: "long_term, temp, stat" })),
          notes: Type.Optional(Type.String({ description: "Additional instructions or notes" })),
        }),
        async execute(_id, params) {
          const db = getDb();
          const orderNo = `ORD${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 4).toUpperCase()}`;

          const [order] = await db.insert(orders).values({
            visitId: params.visitId,
            orderNo,
            orderType: params.orderType,
            orderCategory: params.orderCategory ?? "temp",
            itemCode: params.itemCode,
            itemName: params.itemName,
            specification: params.specification,
            dosage: params.dosage,
            frequency: params.frequency,
            route: params.route,
            quantity: params.quantity?.toString(),
            unit: params.unit,
            doctorId: params.doctorId,
            status: "pending",
            notes: params.notes,
          } satisfies NewOrder).returning();

          return {
            content: [{
              type: "text" as const,
              text: `Order created:\n- Order #: ${orderNo}\n- Type: ${params.orderType}\n- Item: ${params.itemName}${params.dosage ? ` ${params.dosage}` : ""}${params.frequency ? ` ${params.frequency}` : ""}${params.route ? ` (${params.route})` : ""}\n- Status: Pending review`,
            }],
          };
        },
      },
      { name: "create_medical_order" },
    );

    // ── Gateway RPC: order.create ──────────────────────────────
    api.registerGatewayMethod("order.create", async (params) => {
      const db = getDb();
      const data = params as NewOrder;
      if (!data.orderNo) {
        data.orderNo = `ORD${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 4).toUpperCase()}`;
      }
      const [order] = await db.insert(orders).values(data).returning();
      return { order };
    });

    // ── Gateway RPC: order.createBatch ─────────────────────────
    api.registerGatewayMethod("order.createBatch", async (params) => {
      const db = getDb();
      const { orders: orderList } = params as { orders: NewOrder[] };
      const results = [];
      for (const data of orderList) {
        if (!data.orderNo) {
          data.orderNo = `ORD${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
        }
        const [order] = await db.insert(orders).values(data).returning();
        results.push(order);
      }
      return { orders: results };
    });

    // ── Gateway RPC: order.get ─────────────────────────────────
    api.registerGatewayMethod("order.get", async (params) => {
      const db = getDb();
      const { id } = params as { id: string };
      const [order] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
      if (!order) throw new Error(`Order not found: ${id}`);

      // Get executions
      const executions = await db
        .select()
        .from(orderExecutions)
        .where(eq(orderExecutions.orderId, id))
        .orderBy(orderExecutions.executedAt);

      return { order, executions };
    });

    // ── Gateway RPC: order.listByVisit ─────────────────────────
    api.registerGatewayMethod("order.listByVisit", async (params) => {
      const db = getDb();
      const { visitId, orderType, status } = params as {
        visitId: string;
        orderType?: string;
        status?: string;
      };

      const filters = [eq(orders.visitId, visitId)];
      if (orderType) filters.push(eq(orders.orderType, orderType));
      if (status) filters.push(eq(orders.status, status));

      const results = await db
        .select({
          id: orders.id,
          orderNo: orders.orderNo,
          orderType: orders.orderType,
          orderCategory: orders.orderCategory,
          itemCode: orders.itemCode,
          itemName: orders.itemName,
          specification: orders.specification,
          dosage: orders.dosage,
          frequency: orders.frequency,
          route: orders.route,
          quantity: orders.quantity,
          unit: orders.unit,
          status: orders.status,
          aiReviewResult: orders.aiReviewResult,
          doctorName: staff.name,
          notes: orders.notes,
          createdAt: orders.createdAt,
        })
        .from(orders)
        .leftJoin(staff, eq(orders.doctorId, staff.id))
        .where(and(...filters))
        .orderBy(desc(orders.createdAt));

      return { orders: results };
    });

    // ── Gateway RPC: order.review ──────────────────────────────
    api.registerGatewayMethod("order.review", async (params) => {
      const db = getDb();
      const { orderId, pharmacistId, approved, aiReviewResult, notes } = params as {
        orderId: string;
        pharmacistId: string;
        approved: boolean;
        aiReviewResult?: Record<string, unknown>;
        notes?: string;
      };

      const newStatus = approved ? "approved" : "pending"; // rejected orders go back to pending for revision

      const [updated] = await db
        .update(orders)
        .set({
          status: newStatus,
          pharmacistId,
          aiReviewResult: aiReviewResult ?? null,
          notes: notes ? sql`COALESCE(${orders.notes}, '') || E'\n' || ${notes}` : orders.notes,
          updatedAt: new Date(),
        })
        .where(eq(orders.id, orderId))
        .returning();

      return { order: updated };
    });

    // ── Gateway RPC: order.execute ─────────────────────────────
    api.registerGatewayMethod("order.execute", async (params) => {
      const db = getDb();
      const { orderId, executorId, action, notes } = params as {
        orderId: string;
        executorId: string;
        action: string; // dispensed, administered, collected, reported
        notes?: string;
      };

      const [execution] = await db.insert(orderExecutions).values({
        orderId,
        executorId,
        action,
        notes,
      } satisfies NewOrderExecution).returning();

      // Update order status based on action
      let newStatus = "executing";
      if (action === "reported" || action === "administered") {
        newStatus = "completed";
      }

      await db
        .update(orders)
        .set({ status: newStatus, updatedAt: new Date() })
        .where(eq(orders.id, orderId));

      return { execution };
    });

    // ── Gateway RPC: order.cancel ──────────────────────────────
    api.registerGatewayMethod("order.cancel", async (params) => {
      const db = getDb();
      const { orderId, reason } = params as { orderId: string; reason?: string };

      const [updated] = await db
        .update(orders)
        .set({
          status: "cancelled",
          stopTime: new Date(),
          notes: reason ? sql`COALESCE(${orders.notes}, '') || E'\nCancelled: ' || ${reason}` : orders.notes,
          updatedAt: new Date(),
        })
        .where(eq(orders.id, orderId))
        .returning();

      return { order: updated };
    });

    // ── Gateway RPC: order.pendingReview ────────────────────────
    api.registerGatewayMethod("order.pendingReview", async (params) => {
      const db = getDb();
      const { departmentId, limit = 50 } = params as { departmentId?: string; limit?: number };

      const pendingOrders = await db
        .select({
          id: orders.id,
          orderNo: orders.orderNo,
          orderType: orders.orderType,
          itemName: orders.itemName,
          dosage: orders.dosage,
          frequency: orders.frequency,
          route: orders.route,
          quantity: orders.quantity,
          patientName: patients.name,
          patientMrn: patients.medicalRecordNo,
          doctorName: staff.name,
          createdAt: orders.createdAt,
        })
        .from(orders)
        .leftJoin(visits, eq(orders.visitId, visits.id))
        .leftJoin(patients, eq(visits.patientId, patients.id))
        .leftJoin(staff, eq(orders.doctorId, staff.id))
        .where(
          departmentId
            ? and(eq(orders.status, "pending"), eq(visits.departmentId, departmentId))
            : eq(orders.status, "pending"),
        )
        .orderBy(orders.createdAt)
        .limit(limit);

      return { orders: pendingOrders };
    });

    api.logger.info(
      "Order System plugin registered " +
      "(tools: create_medical_order; " +
      "RPC: order.create/createBatch/get/listByVisit/review/execute/cancel/pendingReview)",
    );
  },
};

export default orderSystemPlugin;
