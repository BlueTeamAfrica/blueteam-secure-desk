import "server-only";

import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

let app: App | undefined;

/** Preferred on Vercel: full service account JSON, base64-encoded (no PEM newline issues). */
export const FIREBASE_SERVICE_ACCOUNT_BASE64_ENV = "FIREBASE_SERVICE_ACCOUNT_BASE64";

export type FirebaseAdminEnvDiagnostics = {
  credentialMode: "service_account_base64" | "legacy_env";
  FIREBASE_SERVICE_ACCOUNT_BASE64_present: boolean;
  /** Length of trimmed base64 env string (not decoded JSON). */
  serviceAccountBase64EnvLength: number;
  /** True only if base64 decodes to UTF-8 and JSON.parse succeeds with required keys. */
  serviceAccountBase64_parseOk: boolean;
  FIREBASE_PROJECT_ID_present: boolean;
  FIREBASE_CLIENT_EMAIL_present: boolean;
  FIREBASE_PRIVATE_KEY_present: boolean;
  privateKeyStartsWithBegin: boolean;
  privateKeyHasEscapedNewlines: boolean;
  privateKeyHasRealNewlines: boolean;
  privateKeyLength: number;
};

function privateKeyPreview(s: string, maxLen: number): string {
  return s
    .slice(0, maxLen)
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n");
}

type ParsedServiceAccountJson = {
  projectId: string;
  clientEmail: string;
  privateKey: string;
};

function tryParseServiceAccountFromBase64(): ParsedServiceAccountJson | null {
  const b64 = process.env[FIREBASE_SERVICE_ACCOUNT_BASE64_ENV];
  if (typeof b64 !== "string" || !b64.trim()) return null;

  let parsed: unknown;
  try {
    const decoded = Buffer.from(b64.trim(), "base64").toString("utf8");
    parsed = JSON.parse(decoded) as unknown;
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const o = parsed as Record<string, unknown>;
  const projectId = typeof o.project_id === "string" ? o.project_id.trim() : "";
  const clientEmail = typeof o.client_email === "string" ? o.client_email.trim() : "";
  const privateKey = typeof o.private_key === "string" ? o.private_key : "";
  if (!projectId || !clientEmail || !privateKey) return null;

  return { projectId, clientEmail, privateKey };
}

/**
 * Safe diagnostics (never logs private key, client email, or JSON body).
 */
export function getFirebaseAdminEnvDiagnostics(): FirebaseAdminEnvDiagnostics {
  const b64Raw =
    typeof process.env[FIREBASE_SERVICE_ACCOUNT_BASE64_ENV] === "string"
      ? process.env[FIREBASE_SERVICE_ACCOUNT_BASE64_ENV]
      : "";
  const b64Trim = b64Raw.trim();
  const parsed = tryParseServiceAccountFromBase64();
  const parseOk = parsed !== null;

  const raw =
    typeof process.env.FIREBASE_PRIVATE_KEY === "string" ? process.env.FIREBASE_PRIVATE_KEY : "";
  const normalized = raw.replace(/\\n/g, "\n");

  return {
    credentialMode: b64Trim.length > 0 ? "service_account_base64" : "legacy_env",
    FIREBASE_SERVICE_ACCOUNT_BASE64_present: b64Trim.length > 0,
    serviceAccountBase64EnvLength: b64Trim.length,
    serviceAccountBase64_parseOk: parseOk,
    FIREBASE_PROJECT_ID_present:
      typeof process.env.FIREBASE_PROJECT_ID === "string" && process.env.FIREBASE_PROJECT_ID.length > 0,
    FIREBASE_CLIENT_EMAIL_present:
      typeof process.env.FIREBASE_CLIENT_EMAIL === "string" && process.env.FIREBASE_CLIENT_EMAIL.length > 0,
    FIREBASE_PRIVATE_KEY_present: raw.length > 0,
    privateKeyStartsWithBegin:
      normalized.includes("BEGIN PRIVATE KEY") || normalized.includes("BEGIN RSA PRIVATE KEY"),
    privateKeyHasEscapedNewlines: raw.includes("\\n"),
    privateKeyHasRealNewlines: raw.includes("\n"),
    privateKeyLength: raw.length,
  };
}

/**
 * Resolved Firebase project id for health checks (not a secret). Base64 JSON wins when valid.
 */
export function getFirebaseAdminResolvedProjectId(): string | null {
  const fromB64 = tryParseServiceAccountFromBase64();
  if (fromB64?.projectId) return fromB64.projectId;
  const envPid = process.env.FIREBASE_PROJECT_ID;
  return typeof envPid === "string" && envPid.length > 0 ? envPid : null;
}

/**
 * Runtime-only: legacy PEM env shape (never logs full key). Skipped when using base64 credential.
 */
function logFirebasePrivateKeyRuntimeShape(): void {
  const raw =
    typeof process.env.FIREBASE_PRIVATE_KEY === "string" ? process.env.FIREBASE_PRIVATE_KEY : "";
  const normalized = raw.replace(/\\n/g, "\n");
  console.warn("[firebase-admin] private_key_shape", {
    rawPrivateKeyLength: raw.length,
    normalizedPrivateKeyLength: normalized.length,
    rawFirst30: privateKeyPreview(raw, 30),
    normalizedFirst30: privateKeyPreview(normalized, 30),
    rawIncludesBeginPrivateKey: raw.includes("BEGIN PRIVATE KEY"),
    rawIncludesBeginRsaPrivateKey: raw.includes("BEGIN RSA PRIVATE KEY"),
    normalizedIncludesBeginPrivateKey: normalized.includes("BEGIN PRIVATE KEY"),
    normalizedIncludesBeginRsaPrivateKey: normalized.includes("BEGIN RSA PRIVATE KEY"),
    rawHasActualNewlineChars: raw.includes("\n"),
    normalizedHasActualNewlineChars: normalized.includes("\n"),
    rawHasEscapedNewlineSequence: raw.includes("\\n"),
  });
}

/**
 * Server-only credentials:
 * - Preferred: FIREBASE_SERVICE_ACCOUNT_BASE64 (base64 of full service account JSON).
 * - Legacy: FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY (PEM; `\\n` normalized).
 */
function getAdminApp(): App {
  if (app) return app;
  const existing = getApps()[0];
  if (existing) {
    app = existing;
    return app;
  }

  const diag = getFirebaseAdminEnvDiagnostics();
  console.warn("[firebase-admin] env_diagnostics", diag);

  const fromB64 = tryParseServiceAccountFromBase64();
  if (fromB64) {
    const decodedUtf8Length = (() => {
      try {
        const b64 = process.env[FIREBASE_SERVICE_ACCOUNT_BASE64_ENV]!;
        return Buffer.from(b64.trim(), "base64").toString("utf8").length;
      } catch {
        return null;
      }
    })();
    console.warn("[firebase-admin] init_credential", {
      credentialMode: "service_account_base64",
      serviceAccountBase64EnvLength: diag.serviceAccountBase64EnvLength,
      decodedServiceAccountJsonUtf8Length: decodedUtf8Length,
      projectIdLength: fromB64.projectId.length,
      clientEmailLength: fromB64.clientEmail.length,
      privateKeyLength: fromB64.privateKey.length,
    });

    app = initializeApp({
      credential: cert({
        projectId: fromB64.projectId,
        clientEmail: fromB64.clientEmail,
        privateKey: fromB64.privateKey,
      }),
    });
    return app;
  }

  logFirebasePrivateKeyRuntimeShape();

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  if (
    typeof projectId !== "string" ||
    projectId.length === 0 ||
    typeof clientEmail !== "string" ||
    clientEmail.length === 0 ||
    typeof process.env.FIREBASE_PRIVATE_KEY !== "string" ||
    process.env.FIREBASE_PRIVATE_KEY.length === 0
  ) {
    throw new Error(
      "Firebase Admin credentials are not configured. Set FIREBASE_SERVICE_ACCOUNT_BASE64 (preferred) or FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY.",
    );
  }

  const privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n");

  console.warn("[firebase-admin] init_credential", {
    credentialMode: "legacy_env",
    projectIdLength: projectId.length,
    clientEmailLength: clientEmail.length,
    privateKeyLength: privateKey.length,
  });

  app = initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });
  return app;
}

export function getAdminAuth(): Auth {
  return getAuth(getAdminApp());
}

export function getAdminFirestore(): Firestore {
  return getFirestore(getAdminApp());
}
