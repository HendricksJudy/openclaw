/**
 * ClawHospital - JWT Authentication
 *
 * Handles token generation, verification, and refresh.
 * Uses Node.js built-in crypto for HMAC-SHA256 JWT signing (no external dependency).
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export type JwtPayload = {
  sub: string; // user ID
  staffId: string;
  username: string;
  roles: string[]; // role codes
  iat: number;
  exp: number;
  type?: "access" | "refresh";
};

export type TokenPair = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
};

const ACCESS_TOKEN_TTL = 60 * 60; // 1 hour
const REFRESH_TOKEN_TTL = 60 * 60 * 24 * 7; // 7 days

function getSecret(): string {
  const secret = process.env.CLAWHOSPITAL_JWT_SECRET;
  if (!secret) {
    throw new Error(
      "[clawhospital:auth] CLAWHOSPITAL_JWT_SECRET environment variable is required",
    );
  }
  return secret;
}

function base64url(input: string | Buffer): string {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf.toString("base64url");
}

function hmacSign(data: string, secret: string): string {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

function signJwt(payload: Record<string, unknown>): string {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64url(JSON.stringify(payload));
  const signature = hmacSign(`${header}.${body}`, getSecret());
  return `${header}.${body}.${signature}`;
}

function decodeAndVerify(token: string): JwtPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const [header, body, signature] = parts;
    const expectedSig = hmacSign(`${header}.${body}`, getSecret());

    // Timing-safe comparison to prevent timing attacks
    const sigBuf = Buffer.from(signature!, "base64url");
    const expectedBuf = Buffer.from(expectedSig, "base64url");
    if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
      return null;
    }

    const payload = JSON.parse(Buffer.from(body!, "base64url").toString()) as JwtPayload;

    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) return null;

    return payload;
  } catch {
    return null;
  }
}

export function generateAccessToken(payload: Omit<JwtPayload, "iat" | "exp" | "type">): string {
  const now = Math.floor(Date.now() / 1000);
  return signJwt({
    ...payload,
    type: "access",
    iat: now,
    exp: now + ACCESS_TOKEN_TTL,
  });
}

function generateRefreshToken(payload: Omit<JwtPayload, "iat" | "exp" | "type">): string {
  const now = Math.floor(Date.now() / 1000);
  return signJwt({
    sub: payload.sub,
    staffId: payload.staffId,
    username: payload.username,
    roles: payload.roles,
    type: "refresh",
    iat: now,
    exp: now + REFRESH_TOKEN_TTL,
  });
}

export function generateTokenPair(payload: Omit<JwtPayload, "iat" | "exp" | "type">): TokenPair {
  return {
    accessToken: generateAccessToken(payload),
    refreshToken: generateRefreshToken(payload),
    expiresIn: ACCESS_TOKEN_TTL,
  };
}

/** Verify an access token. Returns null if invalid, expired, or wrong type. */
export function verifyToken(token: string): JwtPayload | null {
  const payload = decodeAndVerify(token);
  if (!payload) return null;
  // Accept tokens without type field (backwards compat) or explicit access type
  if (payload.type && payload.type !== "access") return null;
  return payload;
}

/** Verify a refresh token. Returns null if invalid, expired, or wrong type. */
export function verifyRefreshToken(token: string): JwtPayload | null {
  const payload = decodeAndVerify(token);
  if (!payload) return null;
  if (payload.type !== "refresh") return null;
  return payload;
}

export { ACCESS_TOKEN_TTL, REFRESH_TOKEN_TTL };
