/**
 * ClawHospital - Audit Logger
 *
 * Append-only audit trail for all clinical and administrative actions.
 * Every write operation on medical data must produce an audit entry.
 */

import { getDb } from "../db/connection.ts";
import { auditLogs, type NewAuditLog } from "../db/schema/audit.ts";

export type AuditContext = {
  operatorId: string;
  operatorName?: string;
  channel?: string;
  ipAddress?: string;
  userAgent?: string;
};

export type AuditEntry = {
  action: string;
  resourceType: string;
  resourceId?: string;
  detail?: Record<string, unknown>;
};

/**
 * Write a single audit log entry.
 */
export async function writeAuditLog(
  ctx: AuditContext,
  entry: AuditEntry,
): Promise<void> {
  const db = getDb();

  const record: NewAuditLog = {
    operatorId: ctx.operatorId,
    operatorName: ctx.operatorName,
    action: entry.action,
    resourceType: entry.resourceType,
    resourceId: entry.resourceId,
    detail: entry.detail,
    channel: ctx.channel,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  };

  await db.insert(auditLogs).values(record);
}

/**
 * Write multiple audit entries in a single transaction.
 */
export async function writeAuditBatch(
  ctx: AuditContext,
  entries: AuditEntry[],
): Promise<void> {
  if (entries.length === 0) return;

  const db = getDb();

  const records: NewAuditLog[] = entries.map((entry) => ({
    operatorId: ctx.operatorId,
    operatorName: ctx.operatorName,
    action: entry.action,
    resourceType: entry.resourceType,
    resourceId: entry.resourceId,
    detail: entry.detail,
    channel: ctx.channel,
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  }));

  await db.insert(auditLogs).values(records);
}

/**
 * Express middleware that auto-logs write operations.
 * Attach after authenticate middleware so req.user is available.
 */
export function auditMiddleware(resourceType: string) {
  return async (
    req: import("express").Request,
    _res: import("express").Response,
    next: import("express").NextFunction,
  ): Promise<void> => {
    // Only audit mutating methods
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
      next();
      return;
    }

    const actionMap: Record<string, string> = {
      POST: "create",
      PUT: "update",
      PATCH: "update",
      DELETE: "delete",
    };

    // Log after the response completes
    const originalEnd = _res.end.bind(_res);
    _res.end = function (...args: Parameters<typeof originalEnd>) {
      const result = originalEnd(...args);

      // Fire-and-forget audit write
      if (req.user) {
        writeAuditLog(
          {
            operatorId: req.user.sub,
            operatorName: req.user.username,
            channel: "web",
            ipAddress: req.ip,
            userAgent: req.headers["user-agent"],
          },
          {
            action: actionMap[req.method] ?? req.method.toLowerCase(),
            resourceType,
            resourceId: req.params.id,
            detail: {
              method: req.method,
              path: req.path,
              statusCode: _res.statusCode,
            },
          },
        ).catch((err) => {
          console.error("[clawhospital:audit] Failed to write audit log:", err);
        });
      }

      return result;
    } as typeof originalEnd;

    next();
  };
}
