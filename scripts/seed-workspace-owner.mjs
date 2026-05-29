/**
 * Seeds Firestore `users/{uid}` with role `owner` for a given email.
 *
 * Supports two credential modes (checked in order):
 *   1. FIREBASE_SERVICE_ACCOUNT_BASE64  — base64 of the full service-account JSON (preferred)
 *   2. FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY  — legacy trio
 *
 * Usage:
 *   node scripts/seed-workspace-owner.mjs eldabyk@gmail.com
 *
 * The account must already exist in Firebase Auth (password sign-in).
 */
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const emailArg = process.argv[2] || "eldabyk@gmail.com";

function initAdmin() {
  if (getApps()[0]) return;

  // Preferred: base64-encoded service account JSON
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (b64) {
    const serviceAccount = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
    initializeApp({ credential: cert(serviceAccount) });
    return;
  }

  // Fallback: legacy trio
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY;
  if (!projectId || !clientEmail || !privateKeyRaw) {
    console.error(
      "Set FIREBASE_SERVICE_ACCOUNT_BASE64, or all three of: " +
      "FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY",
    );
    process.exit(1);
  }
  const privateKey = privateKeyRaw.replace(/\\n/g, "\n");
  initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}

async function main() {
  initAdmin();
  const auth = getAuth();
  const db = getFirestore();

  const user = await auth.getUserByEmail(emailArg);
  const uid = user.uid;

  await db.collection("users").doc(uid).set({ role: "owner" }, { merge: true });

  console.log(`Seeded users/${uid} as owner for ${emailArg}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
