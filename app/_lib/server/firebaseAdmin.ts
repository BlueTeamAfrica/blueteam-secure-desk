import "server-only";

import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

let app: App | undefined;

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

  app = initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n") ?? "",
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

export function getAdminProjectId(): string | null {
  const a = getAdminApp();
  const projectId =
    typeof a.options?.projectId === "string"
      ? a.options.projectId
      : typeof process.env.FIREBASE_PROJECT_ID === "string"
        ? process.env.FIREBASE_PROJECT_ID
        : null;
  return projectId && projectId.length > 0 ? projectId : null;
}
