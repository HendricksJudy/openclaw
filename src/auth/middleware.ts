/**
 * ClawHospital - Auth Middleware
 *
 * Express middleware for JWT authentication and RBAC authorization.
 */

import type { Request, Response, NextFunction } from "express";
import { verifyToken, type JwtPayload } from "./jwt.ts";
import { hasPermission, type PermissionCheck, type AccessContext } from "./rbac.ts";

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
      accessContext?: AccessContext;
    }
  }
}

/**
 * Authenticate request via Bearer token.
 * Populates req.user and req.accessContext on success.
 */
export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header" });
    return;
  }

  const token = authHeader.slice(7);
  const payload = verifyToken(token);

  if (!payload) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  req.user = payload;
  req.accessContext = {
    userId: payload.sub,
    roleCodes: payload.roles,
  };

  next();
}

/**
 * Authorize request against a specific permission.
 * Must be used after `authenticate`.
 *
 * @example
 * router.post("/orders", authenticate, authorize({ resource: "orders", action: "create" }), handler);
 */
export function authorize(check: PermissionCheck) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.accessContext) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const allowed = await hasPermission(req.accessContext, check);
    if (!allowed) {
      res.status(403).json({
        error: "Forbidden",
        required: `${check.resource}:${check.action}`,
      });
      return;
    }

    next();
  };
}

/**
 * Require any of the listed roles.
 * Must be used after `authenticate`.
 *
 * @example
 * router.get("/admin", authenticate, requireRole("admin", "superadmin"), handler);
 */
export function requireRole(...roleCodes: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const hasRole = req.user.roles.some((r) => roleCodes.includes(r));
    if (!hasRole) {
      res.status(403).json({
        error: "Forbidden",
        requiredRoles: roleCodes,
      });
      return;
    }

    next();
  };
}
