/**
 * ClawHospital - Finance & Billing Extension [M09]
 *
 * Provides:
 *   - Charge item catalog management
 *   - Bill generation and line items
 *   - Payment processing
 *   - Insurance claim submission and tracking
 *   - AI Tool for billing queries
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { Type } from "@sinclair/typebox";
import { getDb } from "../../src/db/connection.ts";
import {
  chargeItems,
  bills,
  billItems,
  payments,
  insuranceClaims,
  type NewBill,
  type NewBillItem,
  type NewPayment,
  type NewInsuranceClaim,
} from "../../src/db/schema/finance.ts";
import { visits } from "../../src/db/schema/visits.ts";
import { patients } from "../../src/db/schema/patients.ts";
import { staff } from "../../src/db/schema/staff.ts";
import { orders } from "../../src/db/schema/orders.ts";
import { eq, and, ilike, or, sql, desc, sum } from "drizzle-orm";

const financePlugin = {
  id: "clawhospital-finance",
  name: "Finance & Billing",
  description: "Billing, payments, insurance claims, and financial reporting",
  version: "1.0.0",

  register(api: OpenClawPluginApi) {
    api.logger.info("Finance & Billing plugin registering...");

    // ── AI Tool: query_patient_bill ─────────────────────────────
    api.registerTool(
      {
        name: "query_patient_bill",
        description:
          "Look up billing information for a patient or visit. " +
          "Use this when a patient asks about their bill, charges, or payment status.",
        parameters: Type.Object({
          patientId: Type.Optional(Type.String({ description: "Patient UUID" })),
          visitId: Type.Optional(Type.String({ description: "Visit UUID" })),
          billNo: Type.Optional(Type.String({ description: "Bill number" })),
        }),
        async execute(_id, params) {
          const db = getDb();

          const filters = [];
          if (params.patientId) filters.push(eq(bills.patientId, params.patientId));
          if (params.visitId) filters.push(eq(bills.visitId, params.visitId));
          if (params.billNo) filters.push(eq(bills.billNo, params.billNo));

          if (filters.length === 0) {
            return { content: [{ type: "text" as const, text: "Please provide a patient ID, visit ID, or bill number." }] };
          }

          const billList = await db
            .select({
              billNo: bills.billNo,
              totalAmount: bills.totalAmount,
              insuranceCovered: bills.insuranceCovered,
              patientOwes: bills.patientOwes,
              paidAmount: bills.paidAmount,
              status: bills.status,
              currency: bills.currency,
              createdAt: bills.createdAt,
            })
            .from(bills)
            .where(and(...filters))
            .orderBy(desc(bills.createdAt))
            .limit(10);

          if (billList.length === 0) {
            return { content: [{ type: "text" as const, text: "No bills found." }] };
          }

          const formatted = billList
            .map(
              (b) =>
                `- Bill #${b.billNo} | Total: ${b.currency} ${b.totalAmount} | Insurance: ${b.insuranceCovered} | Patient owes: ${b.patientOwes} | Paid: ${b.paidAmount} | Status: ${b.status}`,
            )
            .join("\n");

          return { content: [{ type: "text" as const, text: `Bills:\n\n${formatted}` }] };
        },
      },
      { name: "query_patient_bill" },
    );

    // ── Gateway RPC: finance.bill.create ───────────────────────
    api.registerGatewayMethod("finance.bill.create", async (params) => {
      const db = getDb();
      const data = params as NewBill;
      if (!data.billNo) {
        data.billNo = `BL${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 4).toUpperCase()}`;
      }
      const [bill] = await db.insert(bills).values(data).returning();
      return { bill };
    });

    // ── Gateway RPC: finance.bill.get ──────────────────────────
    api.registerGatewayMethod("finance.bill.get", async (params) => {
      const db = getDb();
      const { id } = params as { id: string };

      const [bill] = await db
        .select()
        .from(bills)
        .where(eq(bills.id, id))
        .limit(1);

      if (!bill) throw new Error(`Bill not found: ${id}`);

      const items = await db
        .select()
        .from(billItems)
        .where(eq(billItems.billId, id))
        .orderBy(billItems.createdAt);

      const paymentList = await db
        .select()
        .from(payments)
        .where(eq(payments.billId, id))
        .orderBy(payments.paidAt);

      return { bill, items, payments: paymentList };
    });

    // ── Gateway RPC: finance.bill.addItem ──────────────────────
    api.registerGatewayMethod("finance.bill.addItem", async (params) => {
      const db = getDb();
      const data = params as NewBillItem;

      const [item] = await db.insert(billItems).values(data).returning();

      // Recalculate bill total
      const [totals] = await db
        .select({ total: sql<string>`COALESCE(SUM(${billItems.amount}), 0)` })
        .from(billItems)
        .where(eq(billItems.billId, data.billId));

      await db
        .update(bills)
        .set({
          totalAmount: totals?.total ?? "0",
          patientOwes: sql`${totals?.total ?? "0"} - COALESCE(${bills.insuranceCovered}, 0) - COALESCE(${bills.paidAmount}, 0)`,
          updatedAt: new Date(),
        })
        .where(eq(bills.id, data.billId));

      return { item };
    });

    // ── Gateway RPC: finance.bill.generateFromVisit ────────────
    api.registerGatewayMethod("finance.bill.generateFromVisit", async (params) => {
      const db = getDb();
      const { visitId, createdBy } = params as { visitId: string; createdBy: string };

      // Get visit info
      const [visit] = await db.select().from(visits).where(eq(visits.id, visitId)).limit(1);
      if (!visit) throw new Error(`Visit not found: ${visitId}`);

      // Get all completed orders for this visit
      const visitOrders = await db
        .select()
        .from(orders)
        .where(and(eq(orders.visitId, visitId), eq(orders.status, "completed")));

      // Create bill
      const billNo = `BL${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 4).toUpperCase()}`;
      const [bill] = await db.insert(bills).values({
        billNo,
        patientId: visit.patientId,
        visitId,
        createdBy,
        status: "pending",
      } satisfies NewBill).returning();

      // Create line items from orders
      let totalAmount = 0;
      for (const order of visitOrders) {
        // Look up charge item price
        const [chargeItem] = await db
          .select()
          .from(chargeItems)
          .where(eq(chargeItems.code, order.itemCode))
          .limit(1);

        const qty = Number(order.quantity ?? 1);
        const unitPrice = Number(chargeItem?.unitPrice ?? 0);
        const amount = qty * unitPrice;
        totalAmount += amount;

        await db.insert(billItems).values({
          billId: bill!.id,
          chargeItemId: chargeItem?.id,
          description: order.itemName,
          quantity: String(qty),
          unitPrice: String(unitPrice),
          amount: String(amount),
          category: order.orderType,
          orderId: order.id,
        });
      }

      // Update bill total
      await db
        .update(bills)
        .set({
          totalAmount: String(totalAmount),
          patientOwes: String(totalAmount),
        })
        .where(eq(bills.id, bill!.id));

      return { bill: { ...bill, totalAmount: String(totalAmount) }, itemCount: visitOrders.length };
    });

    // ── Gateway RPC: finance.payment.record ────────────────────
    api.registerGatewayMethod("finance.payment.record", async (params) => {
      const db = getDb();
      const data = params as NewPayment;

      if (!data.paymentNo) {
        data.paymentNo = `PAY${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 4).toUpperCase()}`;
      }

      const [payment] = await db.insert(payments).values(data).returning();

      // Update bill paid amount
      const [totalPaid] = await db
        .select({ total: sql<string>`COALESCE(SUM(${payments.amount}), 0)` })
        .from(payments)
        .where(and(eq(payments.billId, data.billId), eq(payments.status, "completed")));

      const [bill] = await db.select().from(bills).where(eq(bills.id, data.billId)).limit(1);

      const paidNum = Number(totalPaid?.total ?? 0);
      const totalNum = Number(bill?.totalAmount ?? 0);
      const insNum = Number(bill?.insuranceCovered ?? 0);
      const owes = totalNum - insNum - paidNum;

      let status = "partially_paid";
      if (owes <= 0) status = "paid";

      await db
        .update(bills)
        .set({
          paidAmount: String(paidNum),
          patientOwes: String(Math.max(0, owes)),
          status,
          updatedAt: new Date(),
        })
        .where(eq(bills.id, data.billId));

      return { payment };
    });

    // ── Gateway RPC: finance.insurance.submit ──────────────────
    api.registerGatewayMethod("finance.insurance.submit", async (params) => {
      const db = getDb();
      const data = params as NewInsuranceClaim;

      if (!data.claimNo) {
        data.claimNo = `CLM${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
      }

      const [claim] = await db.insert(insuranceClaims).values(data).returning();

      // Link claim to bill
      await db
        .update(bills)
        .set({ insuranceClaimId: claim!.id, updatedAt: new Date() })
        .where(eq(bills.id, data.billId));

      return { claim };
    });

    // ── Gateway RPC: finance.insurance.update ──────────────────
    api.registerGatewayMethod("finance.insurance.update", async (params) => {
      const db = getDb();
      const { claimId, status, approvedAmount, denialReason } = params as {
        claimId: string;
        status: string;
        approvedAmount?: string;
        denialReason?: string;
      };

      const updates: Record<string, unknown> = {
        status,
        updatedAt: new Date(),
      };
      if (approvedAmount != null) updates.approvedAmount = approvedAmount;
      if (denialReason) updates.denialReason = denialReason;
      if (["approved", "partially_approved", "denied"].includes(status)) {
        updates.resolvedAt = new Date();
      }

      const [claim] = await db
        .update(insuranceClaims)
        .set(updates)
        .where(eq(insuranceClaims.id, claimId))
        .returning();

      // If approved, update bill's insurance covered amount
      if (claim && approvedAmount) {
        await db
          .update(bills)
          .set({
            insuranceCovered: approvedAmount,
            patientOwes: sql`${bills.totalAmount} - ${approvedAmount} - COALESCE(${bills.paidAmount}, 0)`,
            updatedAt: new Date(),
          })
          .where(eq(bills.id, claim.billId));
      }

      return { claim };
    });

    // ── Gateway RPC: finance.report.daily ──────────────────────
    api.registerGatewayMethod("finance.report.daily", async (params) => {
      const db = getDb();
      const { date } = params as { date: string };

      const [revenue] = await db
        .select({
          totalBills: sql<number>`COUNT(DISTINCT ${bills.id})`,
          totalRevenue: sql<string>`COALESCE(SUM(${bills.totalAmount}), 0)`,
          totalCollected: sql<string>`COALESCE(SUM(${bills.paidAmount}), 0)`,
          totalInsurance: sql<string>`COALESCE(SUM(${bills.insuranceCovered}), 0)`,
          totalOutstanding: sql<string>`COALESCE(SUM(${bills.patientOwes}), 0)`,
        })
        .from(bills)
        .where(sql`DATE(${bills.createdAt}) = ${date}`);

      const [paymentStats] = await db
        .select({
          totalPayments: sql<number>`COUNT(*)`,
          cashAmount: sql<string>`COALESCE(SUM(CASE WHEN ${payments.paymentMethod} = 'cash' THEN ${payments.amount} ELSE 0 END), 0)`,
          cardAmount: sql<string>`COALESCE(SUM(CASE WHEN ${payments.paymentMethod} = 'card' THEN ${payments.amount} ELSE 0 END), 0)`,
          otherAmount: sql<string>`COALESCE(SUM(CASE WHEN ${payments.paymentMethod} NOT IN ('cash', 'card') THEN ${payments.amount} ELSE 0 END), 0)`,
        })
        .from(payments)
        .where(sql`DATE(${payments.paidAt}) = ${date}`);

      return {
        date,
        revenue: revenue ?? {},
        payments: paymentStats ?? {},
      };
    });

    api.logger.info(
      "Finance & Billing plugin registered " +
      "(tools: query_patient_bill; " +
      "RPC: finance.bill.create/get/addItem/generateFromVisit, " +
      "finance.payment.record, finance.insurance.submit/update, finance.report.daily)",
    );
  },
};

export default financePlugin;
