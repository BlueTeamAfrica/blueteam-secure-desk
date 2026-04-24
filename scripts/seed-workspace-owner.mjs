/**
 * Seeds Firestore `users/{uid}` with role `owner` for a given email.
 * Requires the same env vars as the Next server: FIREBASE_PROJECT_ID,
 * FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY (use literal \\n in .env).
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
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY;
  if (!projectId || !clientEmail || !privateKeyRaw) {
    console.error(
      "Missing FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, or FIREBASE_PRIVATE_KEY in the environment.",
    );
    process.exit(1);
  }
  const privateKey = privateKeyRaw.replace(/\\n/g, "\n");
  initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
  });
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
