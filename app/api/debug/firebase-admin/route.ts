import { NextResponse } from "next/server";
import {
  getAdminFirestore,
  getFirebaseAdminEnvDiagnostics,
  getFirebaseAdminResolvedProjectId,
} from "@/app/_lib/server/firebaseAdmin";

export const dynamic = "force-dynamic";

/**
 * Temporary health check: verifies Admin SDK init + one safe Firestore read.
 * Response contains no tokens, keys, or document data.
 */
export async function GET() {
  const projectId = getFirebaseAdminResolvedProjectId();
  const envDiagnostics = getFirebaseAdminEnvDiagnostics();

  let firestoreReadOk = false;
  let errorMessage: string | null = null;
  let errorCode: string | null = null;

  try {
    const db = getAdminFirestore();
    await db.collection("settings").doc("branding").get();
    firestoreReadOk = true;
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    let msg = e.message.slice(0, 400);
    if (/openssl|decoder routines|::|digital envelope routines/i.test(msg)) {
      msg = "[redacted: crypto/provider detail]";
    }
    errorMessage = msg;
    const c = (err as { code?: unknown }).code;
    errorCode = typeof c === "string" ? c : null;
  }

  return NextResponse.json({
    projectId,
    envDiagnostics,
    firestoreReadOk,
    errorMessage,
    errorCode,
  });
}
