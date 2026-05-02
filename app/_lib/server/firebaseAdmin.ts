import "server-only";

import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

let app: App | undefined;

export type FirebaseAdminEnvDiagnostics = {
  FIREBASE_PROJECT_ID_present: boolean;
  FIREBASE_CLIENT_EMAIL_present: boolean;
  FIREBASE_PRIVATE_KEY_present: boolean;
  privateKeyStartsWithBegin: boolean;
  privateKeyHasEscapedNewlines: boolean;
  privateKeyHasRealNewlines: boolean;
  privateKeyLength: number;
};

/**
 * Safe diagnostics for service-account env (never logs the private key).
 */
export function getFirebaseAdminEnvDiagnostics(): FirebaseAdminEnvDiagnostics {
  const raw =
    typeof process.env.FIREBASE_PRIVATE_KEY === "string" ? process.env.FIREBASE_PRIVATE_KEY : "";
  const normalized = raw.replace(/\\n/g, "\n");
  return {
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
 * Server-only service account fields (no NEXT_PUBLIC_*).
 * FIREBASE_PRIVATE_KEY may use literal "\\n" in env; those become newlines before passing to cert().
 */
function getAdminApp(): App {
  if (app) return app;
  const existing = getApps()[0];
  if (existing) {
    app = existing;
    return app;
  }

  console.warn("[firebase-admin] env_diagnostics", getFirebaseAdminEnvDiagnostics());

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
      "FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY must be set on the server for admin API routes.",
    );
  }

  const privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n");

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
