import "server-only";

import crypto from "node:crypto";

function requireTokenSecret(): Buffer {
  const raw = process.env.INTEGRATIONS_TOKEN_SECRET;
  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw new Error("INTEGRATIONS_TOKEN_SECRET must be set for OneDrive integration token storage.");
  }
  // Accept either base64 (preferred) or a raw 32+ char string.
  try {
    const buf = Buffer.from(raw, "base64");
    if (buf.length === 32) return buf;
  } catch {
    /* ignore */
  }
  const buf = Buffer.from(raw, "utf8");
  if (buf.length < 32) {
    throw new Error("INTEGRATIONS_TOKEN_SECRET must be at least 32 bytes (or 32-byte base64).");
  }
  return crypto.createHash("sha256").update(buf).digest(); // 32 bytes
}

function b64url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function unb64url(s: string): Buffer {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return Buffer.from(b64, "base64");
}

export function encryptJson(value: unknown): string {
  const key = requireTokenSecret();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(value), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${b64url(iv)}.${b64url(tag)}.${b64url(ciphertext)}`;
}

export function decryptJson(token: string): unknown {
  const key = requireTokenSecret();
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") throw new Error("Invalid encrypted token format.");
  const iv = unb64url(parts[1]!);
  const tag = unb64url(parts[2]!);
  const ciphertext = unb64url(parts[3]!);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(plaintext.toString("utf8")) as unknown;
}

