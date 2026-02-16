/**
 * ClawHospital - Password Hashing
 *
 * Uses Node.js built-in scrypt for password hashing (no external dependency).
 */

import { scrypt, randomBytes, timingSafeEqual } from "node:crypto";

const SALT_LENGTH = 32;
const KEY_LENGTH = 64;
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 };

/**
 * Hash a plain-text password.
 * Returns a string in format: `scrypt:N:r:p:salt:hash` (all base64url encoded).
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);

  const hash = await new Promise<Buffer>((resolve, reject) => {
    scrypt(
      password,
      salt,
      KEY_LENGTH,
      SCRYPT_PARAMS,
      (err, derivedKey) => {
        if (err) reject(err);
        else resolve(derivedKey);
      },
    );
  });

  const { N, r, p } = SCRYPT_PARAMS;
  return `scrypt:${N}:${r}:${p}:${salt.toString("base64url")}:${hash.toString("base64url")}`;
}

/**
 * Verify a password against a stored hash.
 */
export async function verifyPassword(
  password: string,
  storedHash: string,
): Promise<boolean> {
  const parts = storedHash.split(":");
  if (parts[0] !== "scrypt" || parts.length !== 6) return false;

  const N = parseInt(parts[1]!, 10);
  const r = parseInt(parts[2]!, 10);
  const p = parseInt(parts[3]!, 10);
  const salt = Buffer.from(parts[4]!, "base64url");
  const expected = Buffer.from(parts[5]!, "base64url");

  const actual = await new Promise<Buffer>((resolve, reject) => {
    scrypt(
      password,
      salt,
      expected.length,
      { N, r, p },
      (err, derivedKey) => {
        if (err) reject(err);
        else resolve(derivedKey);
      },
    );
  });

  return timingSafeEqual(actual, expected);
}
