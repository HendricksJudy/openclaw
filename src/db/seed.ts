/**
 * ClawHospital - Database Seed Script
 *
 * Seeds initial data: demo departments, a superadmin user, sample data.
 * Run: node --import tsx src/db/seed.ts
 */

import { getDb, closeDb } from "./connection.ts";
import { departments } from "./schema/departments.ts";
import { staff } from "./schema/staff.ts";
import { users } from "./schema/auth.ts";
import { userRoles, roles } from "./schema/auth.ts";
import { hashPassword } from "../auth/password.ts";
import { eq } from "drizzle-orm";

async function seed() {
  const db = getDb();
  console.log("[seed] Starting ClawHospital database seed...");

  // ── Departments ────────────────────────────────────────────
  const deptData = [
    { code: "ADMIN", name: "Administration", deptType: "admin", sortOrder: 1 },
    { code: "IM", name: "Internal Medicine", deptType: "clinical", sortOrder: 10 },
    { code: "SUR", name: "Surgery", deptType: "clinical", sortOrder: 11 },
    { code: "PED", name: "Pediatrics", deptType: "clinical", sortOrder: 12 },
    { code: "OBG", name: "Obstetrics & Gynecology", deptType: "clinical", sortOrder: 13 },
    { code: "ER", name: "Emergency", deptType: "clinical", sortOrder: 14 },
    { code: "ICU", name: "Intensive Care Unit", deptType: "clinical", sortOrder: 15 },
    { code: "ORTHO", name: "Orthopedics", deptType: "clinical", sortOrder: 16 },
    { code: "CARDIO", name: "Cardiology", deptType: "clinical", sortOrder: 17 },
    { code: "NEURO", name: "Neurology", deptType: "clinical", sortOrder: 18 },
    { code: "DERM", name: "Dermatology", deptType: "clinical", sortOrder: 19 },
    { code: "PSYCH", name: "Psychiatry", deptType: "clinical", sortOrder: 20 },
    { code: "RAD", name: "Radiology", deptType: "radiology", sortOrder: 30 },
    { code: "LAB", name: "Laboratory", deptType: "lab", sortOrder: 31 },
    { code: "PHARM", name: "Pharmacy", deptType: "pharmacy", sortOrder: 32 },
    { code: "NURS", name: "Nursing Department", deptType: "nursing", sortOrder: 40 },
    { code: "FIN", name: "Finance", deptType: "finance", sortOrder: 50 },
  ];

  for (const dept of deptData) {
    await db
      .insert(departments)
      .values(dept)
      .onConflictDoNothing({ target: departments.code });
  }
  console.log(`[seed] Seeded ${deptData.length} departments`);

  // ── Superadmin Staff + User ─────────────────────────────────
  const adminDept = await db
    .select()
    .from(departments)
    .where(eq(departments.code, "ADMIN"))
    .limit(1);

  if (adminDept.length > 0) {
    const adminStaffData = {
      staffNo: "ADMIN001",
      name: "System Administrator",
      departmentId: adminDept[0]!.id,
      roleType: "admin",
      title: "System Admin",
      email: "admin@clawhospital.local",
    };

    const [adminStaff] = await db
      .insert(staff)
      .values(adminStaffData)
      .onConflictDoNothing({ target: staff.staffNo })
      .returning();

    if (adminStaff) {
      const passwordHash = await hashPassword("admin123"); // Change in production!

      const [adminUser] = await db
        .insert(users)
        .values({
          staffId: adminStaff.id,
          username: "admin",
          passwordHash,
        })
        .onConflictDoNothing({ target: users.username })
        .returning();

      if (adminUser) {
        const superadminRole = await db
          .select()
          .from(roles)
          .where(eq(roles.code, "superadmin"))
          .limit(1);

        if (superadminRole.length > 0) {
          await db
            .insert(userRoles)
            .values({
              userId: adminUser.id,
              roleId: superadminRole[0]!.id,
            })
            .onConflictDoNothing();
        }

        console.log("[seed] Created superadmin user (username: admin, password: admin123)");
        console.log("[seed] WARNING: Change the default password in production!");
      }
    }
  }

  console.log("[seed] Seed complete.");
  await closeDb();
}

seed().catch((err) => {
  console.error("[seed] Seed failed:", err);
  process.exit(1);
});
