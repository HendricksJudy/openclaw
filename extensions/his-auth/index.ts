/**
 * ClawHospital - Auth Extension Plugin
 *
 * Provides HTTP routes for:
 *   POST /api/auth/login      — Authenticate and receive JWT tokens
 *   POST /api/auth/refresh    — Refresh an access token
 *   GET  /api/auth/me         — Get current user info
 *   POST /api/auth/logout     — Invalidate refresh token
 *   POST /api/auth/password   — Change password
 *
 * Registers as an OpenClaw plugin with HTTP route handlers.
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { generateTokenPair, verifyToken, verifyRefreshToken } from "../../src/auth/jwt.ts";
import { verifyPassword, hashPassword } from "../../src/auth/password.ts";
import { getUserRoleCodes } from "../../src/auth/rbac.ts";
import { writeAuditLog } from "../../src/audit/logger.ts";
import { getDb } from "../../src/db/connection.ts";
import { users } from "../../src/db/schema/auth.ts";
import { staff } from "../../src/db/schema/staff.ts";
import { eq, and } from "drizzle-orm";

const hisAuthPlugin = {
  id: "clawhospital-his-auth",
  name: "ClawHospital Auth",
  description: "Hospital RBAC authentication, user management, and login API",
  version: "1.0.0",

  register(api: OpenClawPluginApi) {
    api.logger.info("ClawHospital Auth plugin registering...");

    // ── POST /api/auth/login ──────────────────────────────────
    api.registerHttpRoute({
      path: "/api/auth/login",
      handler: async (req, res) => {
        if (req.method !== "POST") {
          res.writeHead(405, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Method not allowed" }));
          return;
        }

        try {
          const body = await readBody(req);
          const { username, password } = JSON.parse(body);

          if (!username || !password) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Username and password required" }));
            return;
          }

          const db = getDb();

          // Find user
          const [user] = await db
            .select()
            .from(users)
            .where(and(eq(users.username, username), eq(users.isActive, true)))
            .limit(1);

          if (!user) {
            res.writeHead(401, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Invalid credentials" }));
            return;
          }

          // Check lockout
          if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
            res.writeHead(423, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Account temporarily locked", lockedUntil: user.lockedUntil }));
            return;
          }

          // Verify password
          const valid = await verifyPassword(password, user.passwordHash);
          if (!valid) {
            // Increment failed attempts
            const attempts = Number(user.failedLoginAttempts ?? "0") + 1;
            const maxAttempts = 5;
            const updates: Record<string, unknown> = { failedLoginAttempts: String(attempts) };
            if (attempts >= maxAttempts) {
              updates.lockedUntil = new Date(Date.now() + 30 * 60 * 1000); // lock 30 min
            }
            await db.update(users).set(updates).where(eq(users.id, user.id));

            res.writeHead(401, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Invalid credentials" }));
            return;
          }

          // Get staff info
          const [staffMember] = await db
            .select()
            .from(staff)
            .where(eq(staff.id, user.staffId))
            .limit(1);

          // Get roles
          const roleCodes = await getUserRoleCodes(user.id);

          // Generate tokens
          const tokens = generateTokenPair({
            sub: user.id,
            staffId: user.staffId,
            username: user.username,
            roles: roleCodes,
          });

          // Store refresh token, reset failed attempts
          await db
            .update(users)
            .set({
              refreshToken: tokens.refreshToken,
              lastLoginAt: new Date(),
              failedLoginAttempts: "0",
              lockedUntil: null,
            })
            .where(eq(users.id, user.id));

          // Audit log
          await writeAuditLog(
            {
              operatorId: user.id,
              operatorName: user.username,
              channel: "web",
              ipAddress: req.socket.remoteAddress,
            },
            {
              action: "login",
              resourceType: "auth",
              detail: { success: true },
            },
          );

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              ...tokens,
              user: {
                id: user.id,
                staffId: user.staffId,
                username: user.username,
                name: staffMember?.name,
                roles: roleCodes,
                departmentId: staffMember?.departmentId,
              },
            }),
          );
        } catch (err) {
          api.logger.error(`Login error: ${err}`);
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Internal server error" }));
        }
      },
    });

    // ── POST /api/auth/refresh ────────────────────────────────
    api.registerHttpRoute({
      path: "/api/auth/refresh",
      handler: async (req, res) => {
        if (req.method !== "POST") {
          res.writeHead(405, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Method not allowed" }));
          return;
        }

        try {
          const body = await readBody(req);
          const { refreshToken } = JSON.parse(body);

          if (!refreshToken) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Refresh token required" }));
            return;
          }

          const payload = verifyRefreshToken(refreshToken);
          if (!payload) {
            res.writeHead(401, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Invalid or expired refresh token" }));
            return;
          }

          const db = getDb();

          // Verify refresh token matches what's stored
          const [user] = await db
            .select()
            .from(users)
            .where(and(eq(users.id, payload.sub), eq(users.isActive, true)))
            .limit(1);

          if (!user || user.refreshToken !== refreshToken) {
            res.writeHead(401, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Refresh token revoked or invalid" }));
            return;
          }

          // Get current roles (may have changed since last login)
          const roleCodes = await getUserRoleCodes(user.id);

          // Generate new token pair (rotation)
          const tokens = generateTokenPair({
            sub: user.id,
            staffId: user.staffId,
            username: user.username,
            roles: roleCodes,
          });

          // Store new refresh token
          await db
            .update(users)
            .set({ refreshToken: tokens.refreshToken })
            .where(eq(users.id, user.id));

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(tokens));
        } catch (err) {
          api.logger.error(`Token refresh error: ${err}`);
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Internal server error" }));
        }
      },
    });

    // ── POST /api/auth/logout ─────────────────────────────────
    api.registerHttpRoute({
      path: "/api/auth/logout",
      handler: async (req, res) => {
        if (req.method !== "POST") {
          res.writeHead(405, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Method not allowed" }));
          return;
        }

        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith("Bearer ")) {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Not authenticated" }));
          return;
        }

        const payload = verifyToken(authHeader.slice(7));
        if (!payload) {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Invalid or expired token" }));
          return;
        }

        try {
          const db = getDb();

          // Clear stored refresh token
          await db
            .update(users)
            .set({ refreshToken: null })
            .where(eq(users.id, payload.sub));

          await writeAuditLog(
            {
              operatorId: payload.sub,
              operatorName: payload.username,
              channel: "web",
              ipAddress: req.socket.remoteAddress,
            },
            {
              action: "logout",
              resourceType: "auth",
              detail: {},
            },
          );

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true }));
        } catch (err) {
          api.logger.error(`Logout error: ${err}`);
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Internal server error" }));
        }
      },
    });

    // ── POST /api/auth/password ───────────────────────────────
    api.registerHttpRoute({
      path: "/api/auth/password",
      handler: async (req, res) => {
        if (req.method !== "POST") {
          res.writeHead(405, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Method not allowed" }));
          return;
        }

        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith("Bearer ")) {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Not authenticated" }));
          return;
        }

        const payload = verifyToken(authHeader.slice(7));
        if (!payload) {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Invalid or expired token" }));
          return;
        }

        try {
          const body = await readBody(req);
          const { currentPassword, newPassword } = JSON.parse(body);

          if (!currentPassword || !newPassword) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Current and new password required" }));
            return;
          }

          if (newPassword.length < 8) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "New password must be at least 8 characters" }));
            return;
          }

          const db = getDb();
          const [user] = await db
            .select()
            .from(users)
            .where(eq(users.id, payload.sub))
            .limit(1);

          if (!user) {
            res.writeHead(404, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "User not found" }));
            return;
          }

          const valid = await verifyPassword(currentPassword, user.passwordHash);
          if (!valid) {
            res.writeHead(401, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Current password is incorrect" }));
            return;
          }

          const newHash = await hashPassword(newPassword);
          await db
            .update(users)
            .set({ passwordHash: newHash, refreshToken: null })
            .where(eq(users.id, payload.sub));

          await writeAuditLog(
            {
              operatorId: payload.sub,
              operatorName: payload.username,
              channel: "web",
              ipAddress: req.socket.remoteAddress,
            },
            {
              action: "password_change",
              resourceType: "auth",
              detail: {},
            },
          );

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true, message: "Password updated. Please login again." }));
        } catch (err) {
          api.logger.error(`Password change error: ${err}`);
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Internal server error" }));
        }
      },
    });

    // ── GET /api/auth/me ─────────────────────────────────────
    api.registerHttpRoute({
      path: "/api/auth/me",
      handler: async (req, res) => {
        if (req.method !== "GET") {
          res.writeHead(405, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Method not allowed" }));
          return;
        }

        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith("Bearer ")) {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Not authenticated" }));
          return;
        }

        const payload = verifyToken(authHeader.slice(7));
        if (!payload) {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Invalid or expired token" }));
          return;
        }

        const db = getDb();
        const [staffMember] = await db
          .select()
          .from(staff)
          .where(eq(staff.id, payload.staffId))
          .limit(1);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            id: payload.sub,
            staffId: payload.staffId,
            username: payload.username,
            roles: payload.roles,
            name: staffMember?.name,
            departmentId: staffMember?.departmentId,
            roleType: staffMember?.roleType,
          }),
        );
      },
    });

    api.logger.info(
      "ClawHospital Auth plugin registered (routes: /api/auth/login, /api/auth/refresh, /api/auth/logout, /api/auth/password, /api/auth/me)",
    );
  },
};

/** Helper: read HTTP request body as string */
function readBody(req: import("node:http").IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
    req.on("error", reject);
  });
}

export default hisAuthPlugin;
