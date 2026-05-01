import "server-only";

import { createDecipheriv, createHash } from "node:crypto";

/**
 * Server-only env: same semantic secret as secure-reporter-app uses for payload encryption.
 * Never use NEXT_PUBLIC_* for this value.
 *
 * Algorithm (must match reporter app): AES-256-CBC, key = SHA256(secret), IV = MD5("iv:" + secret).
 */
export const SUBMISSION_PAYLOAD_SECRET_ENV = "SUBMISSION_PAYLOAD_SECRET";

/** Thrown when SUBMISSION_PAYLOAD_SECRET is missing or empty (map to a safe client message). */
export class SubmissionPayloadSecretMissingError extends Error {
  constructor() {
    super("Server decrypt secret is not configured");
    this.name = "SubmissionPayloadSecretMissingError";
  }
}

/** Thrown when ciphertext cannot be decrypted (wrong secret, corrupt payload, etc.). Never carries OpenSSL text. */
export class SubmissionPayloadDecryptFailedError extends Error {
  constructor() {
    super("SUBMISSION_PAYLOAD_DECRYPT_FAILED");
    this.name = "SubmissionPayloadDecryptFailedError";
  }
}

export function getSubmissionPayloadSecretDiagnostics(): {
  decrypt_secret_present: boolean;
  decrypt_secret_length: number;
} {
  const secret = process.env[SUBMISSION_PAYLOAD_SECRET_ENV];
  const present = typeof secret === "string" && secret.length > 0;
  return {
    decrypt_secret_present: present,
    decrypt_secret_length: present ? secret.length : 0,
  };
}

function assertSecretConfigured(): string {
  const secret = process.env[SUBMISSION_PAYLOAD_SECRET_ENV];
  if (typeof secret !== "string" || secret.length === 0) {
    throw new SubmissionPayloadSecretMissingError();
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
    throw new SubmissionPayloadDecryptFailedError();
  }
}

function looksLikeOpenSslOrLowLevelCryptoMessage(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("openssl") ||
    m.includes("decoder routines") ||
    m.includes("::") ||
    m.includes("digital envelope routines") ||
    m.includes("bad decrypt") ||
    m.includes("wrong final block length")
  );
}

function wrapCryptoFailure(err: unknown): never {
  const raw = err instanceof Error ? err.message : String(err);
  console.warn("[decrypt] submission_payload_crypto_failure", {
    ...getSubmissionPayloadSecretDiagnostics(),
    reason: "crypto_or_decode",
    // Server-only: may include OpenSSL detail; never return this string to clients.
    internalMessage: raw.slice(0, 500),
  });
  throw new SubmissionPayloadDecryptFailedError();
}

/**
 * Decrypts a submission ciphertext and parses UTF-8 JSON.
 *
 * @param encryptedPayload Base64-encoded AES-CBC ciphertext (no IV in payload; IV is derived).
 * @returns Parsed JSON value (object, array, string, number, boolean, or null).
 */
export function decryptEncryptedPayloadToJson(encryptedPayload: string): unknown {
  const secret = assertSecretConfigured();
  const { key, iv } = deriveKeyAndIv(secret);
  const ciphertext = decodeCiphertext(encryptedPayload);

  let decipher;
  try {
    decipher = createDecipheriv("aes-256-cbc", key, iv);
  } catch (err) {
    if (err instanceof Error && looksLikeOpenSslOrLowLevelCryptoMessage(err.message)) {
      wrapCryptoFailure(err);
    }
    wrapCryptoFailure(err);
  }

  let plaintext: string;
  try {
    const buf = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    plaintext = buf.toString("utf8");
  } catch (err) {
    if (err instanceof Error && looksLikeOpenSslOrLowLevelCryptoMessage(err.message)) {
      wrapCryptoFailure(err);
    }
    wrapCryptoFailure(err);
  }

  try {
    return JSON.parse(plaintext) as unknown;
  } catch {
    throw new SubmissionPayloadDecryptFailedError();
  }
}

/**
 * Same as {@link decryptEncryptedPayloadToJson}, but accepts the raw Firestore field type.
 */
export function decryptEncryptedPayloadFieldToJson(encryptedPayload: unknown): unknown {
  if (typeof encryptedPayload !== "string") {
    throw new SubmissionPayloadDecryptFailedError();
  }
  return decryptEncryptedPayloadToJson(encryptedPayload);
}
