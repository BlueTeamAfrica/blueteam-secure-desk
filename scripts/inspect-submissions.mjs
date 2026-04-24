import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import admin from "firebase-admin";

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
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

function safeJsonPreview(v, maxLen = 500) {
  try {
    const text = JSON.stringify(v, null, 2);
    return text.length > maxLen ? `${text.slice(0, maxLen)}…` : text;
  } catch {
    return String(v);
  }
}

function pickAttachmentCandidate(doc) {
  const direct =
    doc.attachments ??
    doc.files ??
    doc.uploads ??
    doc.media ??
    doc.assets ??
    doc.evidence ??
    null;
  if (Array.isArray(direct)) return { path: "top-level", value: direct };

  // Common nested locations that still keep metadata unencrypted.
  const payload = doc.payload;
  if (payload && typeof payload === "object" && Array.isArray(payload.attachments)) {
    return { path: "payload.attachments", value: payload.attachments };
  }
  const submission = doc.submission;
  if (submission && typeof submission === "object" && Array.isArray(submission.attachments)) {
    return { path: "submission.attachments", value: submission.attachments };
  }
  const reporter = doc.reporter;
  if (reporter && typeof reporter === "object" && Array.isArray(reporter.attachments)) {
    return { path: "reporter.attachments", value: reporter.attachments };
  }

  return { path: null, value: null };
}

async function main() {
  loadEnvFromDotenvLocal();

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY;
  if (!projectId || !clientEmail || !privateKeyRaw) {
    throw new Error("Missing FIREBASE_PROJECT_ID/FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY in env.");
  }
  const privateKey = privateKeyRaw.replace(/\\n/g, "\n");

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
    });
  }
  const db = admin.firestore();

  const snap = await db.collection("submissions").orderBy("createdAt", "desc").limit(5).get();
  console.log(`submissions sample: ${snap.size} docs`);

  for (const doc of snap.docs) {
    const data = doc.data();
    const keys = Object.keys(data).sort();
    const { path: attachmentPath, value: attachments } = pickAttachmentCandidate(data);

    console.log("\n---");
    console.log(`id: ${doc.id}`);
    console.log(`keys: ${keys.join(", ")}`);

    if (attachmentPath && Array.isArray(attachments)) {
      console.log(`attachments found at: ${attachmentPath}`);
      console.log(`attachments count: ${attachments.length}`);
      console.log(`attachments[0] preview: ${safeJsonPreview(attachments[0])}`);
    } else {
      console.log("attachments found at: (none of the checked locations)");
    }

    if (typeof data.encryptedPayload === "string") {
      console.log(`encryptedPayload: (string, length=${data.encryptedPayload.length})`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

