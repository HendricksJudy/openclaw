/**
 * ClawHospital - Role-Based Access Control
 *
 * Permission checking utilities and default role definitions.
 */

import { eq, and, inArray } from "drizzle-orm";
import { getDb } from "../db/connection.ts";
import {
  roles,
  permissions,
  rolePermissions,
  userRoles,
  dataAccessPolicies,
} from "../db/schema/auth.ts";

export type PermissionCheck = {
  resource: string;
  action: string;
};

export type AccessContext = {
  userId: string;
  roleCodes: string[];
  departmentId?: string;
};

/**
 * Check if a user has a specific permission via their assigned roles.
 */
export async function hasPermission(
  ctx: AccessContext,
  check: PermissionCheck,
): Promise<boolean> {
  const db = getDb();

  const result = await db
    .select({ id: permissions.id })
    .from(permissions)
    .innerJoin(rolePermissions, eq(rolePermissions.permissionId, permissions.id))
    .innerJoin(roles, eq(roles.id, rolePermissions.roleId))
    .where(
      and(
        inArray(roles.code, ctx.roleCodes),
        eq(permissions.resource, check.resource),
        eq(permissions.action, check.action),
      ),
    )
    .limit(1);

  return result.length > 0;
}

/**
 * Get the data access scope for a user on a given resource.
 * Returns the least restrictive scope across all roles.
 */
export async function getDataScope(
  ctx: AccessContext,
  resource: string,
): Promise<{ scopeType: string; scopeValue: unknown } | null> {
  const db = getDb();

  const roleRecords = await db
    .select({ id: roles.id })
    .from(roles)
    .where(inArray(roles.code, ctx.roleCodes));

  if (roleRecords.length === 0) return null;

  const roleIds = roleRecords.map((r) => r.id);

  const policies = await db
    .select()
    .from(dataAccessPolicies)
    .where(
      and(
        inArray(dataAccessPolicies.roleId, roleIds),
        eq(dataAccessPolicies.resource, resource),
      ),
    );

  if (policies.length === 0) return null;

  // "all" is least restrictive, then "own_department", then "own_patients"
  const scopePriority = ["all", "own_department", "own_patients", "specific_departments"];
  const sorted = policies.sort(
    (a, b) => scopePriority.indexOf(a.scopeType) - scopePriority.indexOf(b.scopeType),
  );

  const best = sorted[0]!;
  return { scopeType: best.scopeType, scopeValue: best.scopeValue };
}

/**
 * Get all role codes for a user.
 */
export async function getUserRoleCodes(userId: string): Promise<string[]> {
  const db = getDb();

  const result = await db
    .select({ code: roles.code })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(eq(userRoles.userId, userId));

  return result.map((r) => r.code);
}

/**
 * Default system roles to seed on first run.
 */
export const DEFAULT_ROLES = [
  { code: "superadmin", name: "Super Administrator", description: "Full system access" },
  { code: "admin", name: "Administrator", description: "System administration" },
  { code: "physician", name: "Physician", description: "Attending/Resident Doctor" },
  { code: "head_nurse", name: "Head Nurse", description: "Nursing unit manager" },
  { code: "nurse", name: "Nurse", description: "Registered Nurse" },
  { code: "pharmacist", name: "Pharmacist", description: "Pharmacy staff" },
  { code: "lab_tech", name: "Lab Technician", description: "Laboratory staff" },
  { code: "radiologist", name: "Radiologist", description: "Radiology/Imaging staff" },
  { code: "billing", name: "Billing Clerk", description: "Financial/billing staff" },
  { code: "receptionist", name: "Receptionist", description: "Front desk registration" },
] as const;

/**
 * Default permissions matrix.
 */
export const DEFAULT_PERMISSIONS: PermissionCheck[] = [
  // Patient management
  { resource: "patients", action: "create" },
  { resource: "patients", action: "read" },
  { resource: "patients", action: "update" },
  { resource: "patients", action: "delete" },
  // Visits
  { resource: "visits", action: "create" },
  { resource: "visits", action: "read" },
  { resource: "visits", action: "update" },
  // Orders
  { resource: "orders", action: "create" },
  { resource: "orders", action: "read" },
  { resource: "orders", action: "approve" },
  { resource: "orders", action: "execute" },
  { resource: "orders", action: "cancel" },
  // EMR
  { resource: "emr", action: "create" },
  { resource: "emr", action: "read" },
  { resource: "emr", action: "update" },
  { resource: "emr", action: "sign" },
  { resource: "emr", action: "countersign" },
  // Pharmacy
  { resource: "pharmacy", action: "dispense" },
  { resource: "pharmacy", action: "inventory" },
  // Lab
  { resource: "lab", action: "collect" },
  { resource: "lab", action: "report" },
  { resource: "lab", action: "verify" },
  // Finance
  { resource: "finance", action: "charge" },
  { resource: "finance", action: "refund" },
  { resource: "finance", action: "settle" },
  { resource: "finance", action: "report" },
  // Scheduling
  { resource: "schedule", action: "create" },
  { resource: "schedule", action: "read" },
  { resource: "schedule", action: "update" },
  // System admin
  { resource: "users", action: "manage" },
  { resource: "roles", action: "manage" },
  { resource: "config", action: "manage" },
  { resource: "audit", action: "read" },
];
