import "server-only";

import { createDecipheriv, createHash } from "node:crypto";

/**
 * Server-only env: same semantic secret as secure-reporter-app uses for payload encryption.
 * Never use NEXT_PUBLIC_* for this value.
 */
const SECRET_ENV = "SUBMISSION_PAYLOAD_SECRET";

function getSecret(): string {
  const secret = process.env[SECRET_ENV];
  if (typeof secret !== "string" || secret.length === 0) {
    throw new Error(
      `${SECRET_ENV} must be set in the server environment to decrypt submission payloads.`,
    );
  }
  return secret;
}

/**
 * Mirrors secure-reporter-app: AES-256-CBC, key = SHA256(secret), IV = MD5("iv:" + secret).
 */
function deriveKeyAndIv(secret: string): { key: Buffer; iv: Buffer } {
  const key = createHash("sha256").update(secret, "utf8").digest();
  const iv = createHash("md5").update(`iv:${secret}`, "utf8").digest();
  return { key, iv };
}

function decodeCiphertext(encryptedPayload: string): Buffer {
  const trimmed = encryptedPayload.trim();
  try {
    return Buffer.from(trimmed, "base64");
  } catch {
    throw new Error("encryptedPayload is not valid base64.");
  }
}

/**
 * Decrypts a submission ciphertext and parses UTF-8 JSON.
 *
 * @param encryptedPayload Base64-encoded AES-CBC ciphertext (no IV in payload; IV is derived).
 * @returns Parsed JSON value (object, array, string, number, boolean, or null).
 */
export function decryptEncryptedPayloadToJson(encryptedPayload: string): unknown {
  const secret = getSecret();
  const { key, iv } = deriveKeyAndIv(secret);
  const ciphertext = decodeCiphertext(encryptedPayload);

  let decipher;
  try {
    decipher = createDecipheriv("aes-256-cbc", key, iv);
  } catch {
    throw new Error("Failed to initialize AES-CBC decipher.");
  }

  let plaintext: string;
  try {
    const buf = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    plaintext = buf.toString("utf8");
  } catch {
    throw new Error("Decryption failed (wrong secret, corrupt payload, or encoding mismatch).");
  }

  try {
    return JSON.parse(plaintext) as unknown;
  } catch {
    throw new Error("Decrypted payload is not valid JSON.");
  }
}

/**
 * Same as {@link decryptEncryptedPayloadToJson}, but accepts the raw Firestore field type.
 */
export function decryptEncryptedPayloadFieldToJson(encryptedPayload: unknown): unknown {
  if (typeof encryptedPayload !== "string") {
    throw new Error("encryptedPayload must be a base64 string.");
  }
  return decryptEncryptedPayloadToJson(encryptedPayload);
}
