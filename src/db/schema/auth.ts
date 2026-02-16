/**
 * ClawHospital - Auth Schema
 *
 * RBAC: users (mapped to staff), roles, permissions, user-role assignments.
 */

import {
  pgTable,
  uuid,
  varchar,
  boolean,
  jsonb,
  timestamp,
  text,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { staff } from "./staff.ts";

/**
 * User credentials — each staff member has one user account.
 */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    staffId: uuid("staff_id").unique().notNull().references(() => staff.id),
    username: varchar("username", { length: 50 }).unique().notNull(),
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    failedLoginAttempts: varchar("failed_login_attempts", { length: 5 }).default("0"),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    refreshToken: text("refresh_token"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("idx_users_staff_id").on(table.staffId),
  ],
);

/**
 * Roles — e.g., "physician", "head_nurse", "pharmacist", "billing_clerk", "admin".
 */
export const roles = pgTable("roles", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: varchar("code", { length: 30 }).unique().notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  isSystem: boolean("is_system").default(false).notNull(), // built-in roles cannot be deleted
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Permissions — granular action+resource pairs.
 * Example: { resource: "orders", action: "create" }
 */
export const permissions = pgTable(
  "permissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    resource: varchar("resource", { length: 50 }).notNull(), // patients, orders, emr, pharmacy, ...
    action: varchar("action", { length: 30 }).notNull(), // create, read, update, delete, approve, ...
    description: text("description"),
  },
  (table) => [
    uniqueIndex("idx_permissions_resource_action").on(table.resource, table.action),
  ],
);

/**
 * Role-permission mapping (many-to-many).
 */
export const rolePermissions = pgTable(
  "role_permissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roleId: uuid("role_id").notNull().references(() => roles.id, { onDelete: "cascade" }),
    permissionId: uuid("permission_id").notNull().references(() => permissions.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("idx_role_perm_unique").on(table.roleId, table.permissionId),
  ],
);

/**
 * User-role mapping (many-to-many). A user can have multiple roles.
 */
export const userRoles = pgTable(
  "user_roles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    roleId: uuid("role_id").notNull().references(() => roles.id, { onDelete: "cascade" }),
    departmentScope: uuid("department_scope"), // optional: restrict role to a specific department
    grantedAt: timestamp("granted_at", { withTimezone: true }).defaultNow().notNull(),
    grantedBy: uuid("granted_by"),
  },
  (table) => [
    uniqueIndex("idx_user_role_unique").on(table.userId, table.roleId, table.departmentScope),
  ],
);

/**
 * Data access policies — per-role data visibility rules.
 */
export const dataAccessPolicies = pgTable("data_access_policies", {
  id: uuid("id").primaryKey().defaultRandom(),
  roleId: uuid("role_id").notNull().references(() => roles.id, { onDelete: "cascade" }),
  resource: varchar("resource", { length: 50 }).notNull(),
  scopeType: varchar("scope_type", { length: 20 }).notNull(),
  // own_department, own_patients, all, specific_departments
  scopeValue: jsonb("scope_value"), // department IDs or other scope config
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Role = typeof roles.$inferSelect;
export type NewRole = typeof roles.$inferInsert;
export type Permission = typeof permissions.$inferSelect;
export type NewPermission = typeof permissions.$inferInsert;
