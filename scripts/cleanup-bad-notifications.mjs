/**
 * One-time cleanup: deletes notification documents whose `message` field contains
 * a raw Firestore 20-char auto-ID instead of a human-readable case ref.
 *
 * Background: before 2026-06-23, some notifications were written with the
 * Firestore document ID (e.g. "LX38EtPRyQ0XlrpggLFR") as the case ref because
 * the assign-owner route fell back to the raw doc ID instead of CASE-XXXXX.
 *
 * Detection logic:
 *   BAD  — message contains a 20-char alphanumeric string (Firestore auto-ID pattern)
 *   GOOD — message contains CASE-[A-Z0-9]{5} or no ref at all
 *
 * Run from the dashboard directory:
 *   node scripts/cleanup-bad-notifications.mjs
 *   node scripts/cleanup-bad-notifications.mjs --dry-run   # preview without deleting
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import admin from "firebase-admin";

// ── env loader (same as other scripts) ───────────────────────────────────────

function loadEnvFromDotenvLocal() {
  const p = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(p)) return;
  const raw = fs.readFileSync(p, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (!key) continue;
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

function initAdmin() {
  if (admin.apps.length > 0) return;

  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64?.trim();
  if (b64) {
    const json = Buffer.from(b64, "base64").toString("utf8");
    const sa = JSON.parse(json);
    admin.initializeApp({ credential: admin.credential.cert(sa) });
    return;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.trim().replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "No Firebase credentials found. Set FIREBASE_SERVICE_ACCOUNT_BASE64 or " +
        "FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY in .env.local",
    );
  }
  admin.initializeApp({ credential: admin.credential.cert({ projectId, clientEmail, privateKey }) });
}

// ── detection ─────────────────────────────────────────────────────────────────

// Valid case ref: CASE- followed by 4–6 uppercase letters/digits
const CASE_REF = /CASE-[A-Z0-9]{4,6}/;

function isBadNotification(data) {
  const msg = typeof data.message === "string" ? data.message : "";
  // Bad = message does not contain a valid CASE-XXXXX ref
  return !CASE_REF.test(msg);
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  loadEnvFromDotenvLocal();
  initAdmin();

  const dryRun = process.argv.includes("--dry-run");
  if (dryRun) console.log("DRY RUN — no documents will be deleted.\n");

  const db = admin.firestore();

  // Enumerate all notification parent docs (one per uid)
  const parentSnap = await db.collection("notifications").get();
  if (parentSnap.empty) {
    console.log("No notification parent documents found.");
    return;
  }

  let totalScanned = 0;
  let totalBad = 0;
  let totalDeleted = 0;

  for (const parentDoc of parentSnap.docs) {
    const uid = parentDoc.id;
    const itemsSnap = await db
      .collection("notifications")
      .doc(uid)
      .collection("items")
      .get();

    const bad = itemsSnap.docs.filter((d) => isBadNotification(d.data()));
    totalScanned += itemsSnap.size;
    totalBad += bad.length;

    if (bad.length === 0) continue;

    console.log(`uid=${uid}: ${bad.length} bad / ${itemsSnap.size} total`);
    for (const doc of bad) {
      const data = doc.data();
      console.log(`  [${dryRun ? "SKIP" : "DELETE"}] ${doc.ref.path}`);
      console.log(`    message: ${data.message}`);
      if (!dryRun) {
        await doc.ref.delete();
        totalDeleted++;
      }
    }
  }

  console.log(`\nSummary:`);
  console.log(`  Scanned : ${totalScanned} notification documents`);
  console.log(`  Bad     : ${totalBad} with raw Firestore ID in message`);
  if (!dryRun) console.log(`  Deleted : ${totalDeleted}`);
  else console.log(`  Would delete: ${totalBad} (re-run without --dry-run to apply)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
