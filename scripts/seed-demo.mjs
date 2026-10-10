/**
 * Seed script for local demo / marketing screenshot environment.
 *
 * Writes fake data to the Firebase LOCAL EMULATOR ONLY.
 * Requires the emulator to be running: firebase emulators:start
 *
 * Uses Admin SDK for Firestore (bypasses rules) and client SDK for Auth user creation.
 *
 * Usage:
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
 *     node scripts/seed-demo.mjs
 *
 * Or with .env.local.demo active, simply: npm run seed:demo
 */

import { initializeApp as initClientApp } from "firebase/app";
import {
  getAuth,
  connectAuthEmulator,
  createUserWithEmailAndPassword,
} from "firebase/auth";
import { initializeApp as initAdminApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// ── Config ────────────────────────────────────────────────────────────────────
const PROJECT_ID = "demo-project";
const AUTH_HOST = "http://127.0.0.1:9099";

const DEMO_EMAIL = "demo@example.com";
const DEMO_PASSWORD = "demopass123";

// ── Firestore Admin SDK (bypasses rules) ──────────────────────────────────────
// FIRESTORE_EMULATOR_HOST env var is picked up automatically by the Admin SDK.
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
}
if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
}

if (!getApps().length) {
  initAdminApp({ projectId: PROJECT_ID });
}
const db = getFirestore();

// ── Firebase client SDK (for Auth user creation) ──────────────────────────────
const clientApp = initClientApp(
  {
    apiKey: "demo-api-key",
    authDomain: `${PROJECT_ID}.firebaseapp.com`,
    projectId: PROJECT_ID,
  },
  "seed-client",
);
const auth = getAuth(clientApp);
connectAuthEmulator(auth, AUTH_HOST, { disableWarnings: true });

// ── Helpers ───────────────────────────────────────────────────────────────────
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function daysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}

// Firestore Admin SDK uses plain Date objects (auto-converted to Timestamps)
const fakeCases = [
  {
    id: "demo-case-001",
    caseStatus: "incoming",
    title: "Tip: Alleged irregularities in municipal procurement",
    summary:
      "Source reports suspected irregularities in a recent public tender. Claims documents were backdated. Awaiting initial review.",
    reporterSourceName: "Source A",
    reporterRegion: "Northern Region",
    reporterAlias: "source-a",
    sourceChannel: "app",
    priority: "high",
    createdAt: daysAgo(1),
    updatedAt: daysAgo(1),
  },
  {
    id: "demo-case-002",
    caseStatus: "raw",
    title: "Follow-up: Hospital supply chain concerns",
    summary:
      "Follow-up from Source B regarding earlier tip. Additional documents provided. Needs triage to determine verification path.",
    reporterSourceName: "Source B",
    reporterRegion: "Eastern District",
    reporterAlias: "source-b",
    sourceChannel: "app",
    priority: "normal",
    createdAt: daysAgo(3),
    updatedAt: daysAgo(2),
  },
  {
    id: "demo-case-003",
    caseStatus: "first_edit",
    title: "Environmental monitoring data discrepancies",
    summary:
      "Source alleges that publicly reported air quality readings differ from internally circulated figures. Three supporting files attached.",
    reporterSourceName: "Source C",
    reporterRegion: "Capital Zone",
    reporterAlias: "source-c",
    sourceChannel: "app",
    priority: "normal",
    assignedOwnerName: "Alex Morgan",
    assignedOwnerType: "staff",
    createdAt: daysAgo(7),
    updatedAt: daysAgo(1),
    dueDate: daysFromNow(3),
  },
  {
    id: "demo-case-004",
    caseStatus: "second_edit",
    title: "Land registry anomalies in peri-urban parcels",
    summary:
      "Detailed submission covering alleged double-registration of land parcels. Cross-referenced with public registry extracts provided by source.",
    reporterSourceName: "Source D",
    reporterRegion: "Western Province",
    reporterAlias: "source-d",
    sourceChannel: "app",
    priority: "high",
    assignedOwnerName: "Alex Morgan",
    assignedOwnerType: "staff",
    createdAt: daysAgo(10),
    updatedAt: daysAgo(2),
    dueDate: daysFromNow(1),
  },
  {
    id: "demo-case-005",
    caseStatus: "in_review",
    title: "School construction fund audit trail",
    summary:
      "Source provides internal audit memos suggesting funds allocated for school construction were redirected. Awaiting legal review before publication decision.",
    reporterSourceName: "Source E",
    reporterRegion: "Southern Region",
    reporterAlias: "source-e",
    sourceChannel: "app",
    priority: "critical",
    assignedOwnerName: "Alex Morgan",
    assignedOwnerType: "staff",
    createdAt: daysAgo(14),
    updatedAt: daysAgo(3),
  },
  {
    id: "demo-case-006",
    caseStatus: "reviewed",
    title: "Transport ministry vehicle fleet discrepancy",
    summary:
      "Verified and resolved. Source provided fleet registration data; discrepancy confirmed and documented. Case closed.",
    reporterSourceName: "Source F",
    reporterRegion: "Central District",
    reporterAlias: "source-f",
    sourceChannel: "app",
    priority: "normal",
    assignedOwnerName: "Alex Morgan",
    assignedOwnerType: "staff",
    createdAt: daysAgo(21),
    updatedAt: daysAgo(4),
    reviewedAt: daysAgo(4),
  },
];

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("🌱 Seeding demo data into Firebase Local Emulator…");
  console.log(`   FIRESTORE_EMULATOR_HOST: ${process.env.FIRESTORE_EMULATOR_HOST}`);
  console.log(`   FIREBASE_AUTH_EMULATOR_HOST: ${process.env.FIREBASE_AUTH_EMULATOR_HOST}`);
  console.log();

  // Create demo admin user via client Auth SDK
  let uid;
  try {
    const cred = await createUserWithEmailAndPassword(auth, DEMO_EMAIL, DEMO_PASSWORD);
    uid = cred.user.uid;
    console.log(`✓ Created auth user: ${DEMO_EMAIL} (uid: ${uid})`);
  } catch (err) {
    if (err.code === "auth/email-already-in-use") {
      console.log(`ℹ  Auth user already exists — re-using existing UID from emulator`);
      // Sign in to get the uid
      const { signInWithEmailAndPassword } = await import("firebase/auth");
      const cred = await signInWithEmailAndPassword(auth, DEMO_EMAIL, DEMO_PASSWORD);
      uid = cred.user.uid;
      console.log(`   uid: ${uid}`);
    } else {
      throw err;
    }
  }

  // Write adminUsers and users records via Admin SDK (bypasses rules)
  await db.collection("adminUsers").doc(uid).set({ active: true });
  console.log(`✓ adminUsers/${uid} → { active: true }`);

  await db.collection("users").doc(uid).set({ role: "owner" });
  console.log(`✓ users/${uid} → { role: "owner" }`);

  // Write fake cases via Admin SDK
  for (const { id, ...fields } of fakeCases) {
    // Wire assignedOwnerId to the real uid for cases that have an owner
    if (fields.assignedOwnerName) {
      fields.assignedOwnerId = uid;
    }
    await db.collection("submissions").doc(id).set(fields);
    console.log(`✓ submissions/${id} → ${fields.caseStatus}`);
  }

  console.log();
  console.log("✅ Done. Demo data is ready in the local emulator.");
  console.log();
  console.log("   Sign in with:");
  console.log(`   Email:    ${DEMO_EMAIL}`);
  console.log(`   Password: ${DEMO_PASSWORD}`);
  console.log();
  console.log("   Emulator UI: http://localhost:4000");

  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
