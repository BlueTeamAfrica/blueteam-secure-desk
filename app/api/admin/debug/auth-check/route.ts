import "server-only";

import { NextResponse } from "next/server";

// Non-production only. Returns Firebase project alignment info to diagnose
// requireActiveAdmin 401s without exposing any sensitive credential data.
// Returns 404 in production so the route is effectively invisible.
export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const b64 = typeof process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 === "string"
    ? process.env.FIREBASE_SERVICE_ACCOUNT_BASE64.trim()
    : "";

  let adminProjectId: string | null = null;
  let credentialMode: "service_account_base64" | "service_account_base64_invalid" | "legacy_env" = "legacy_env";

  if (b64) {
    try {
      const decoded = Buffer.from(b64, "base64").toString("utf8");
      const parsed = JSON.parse(decoded) as Record<string, unknown>;
      adminProjectId = typeof parsed.project_id === "string" ? parsed.project_id : null;
      credentialMode = "service_account_base64";
    } catch {
      credentialMode = "service_account_base64_invalid";
    }
  } else {
    adminProjectId = process.env.FIREBASE_PROJECT_ID ?? null;
  }

  const clientProjectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? null;

  return NextResponse.json({
    credentialMode,
    adminProjectId,
    clientProjectId,
    projectsMatch: adminProjectId !== null && adminProjectId === clientProjectId,
    serviceAccountBase64Present: b64.length > 0,
    serviceAccountBase64Length: b64.length,
    legacyProjectIdPresent: typeof process.env.FIREBASE_PROJECT_ID === "string" && process.env.FIREBASE_PROJECT_ID.length > 0,
    legacyClientEmailPresent: typeof process.env.FIREBASE_CLIENT_EMAIL === "string" && process.env.FIREBASE_CLIENT_EMAIL.length > 0,
    legacyPrivateKeyPresent: typeof process.env.FIREBASE_PRIVATE_KEY === "string" && process.env.FIREBASE_PRIVATE_KEY.length > 0,
  });
}
