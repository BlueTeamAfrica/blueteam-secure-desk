import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminFirestore } from "@/app/_lib/server/firebaseAdmin";

export type VerifiedAdmin = { uid: string; adminEmail: string | null };

export type AdminAuthResult =
  | { ok: true; admin: VerifiedAdmin }
  | { ok: false; response: NextResponse };

function isTrueish(value: unknown): boolean {
  return value === true || value === "true";
}

function jsonUnauthorizedDebug(args: {
  authHeaderPresent: boolean;
  bearerPresent: boolean;
  verifyErrorCode: string | null;
  verifyErrorMessage: string | null;
  adminProjectId: string | null;
}): NextResponse {
  const { authHeaderPresent, bearerPresent, verifyErrorCode, verifyErrorMessage, adminProjectId } = args;
  return NextResponse.json(
    {
      error: "Unauthorized",
      debug: {
        authHeaderPresent,
        bearerPresent,
        verifyErrorCode,
        verifyErrorMessage,
        adminProjectId,
      },
    },
    { status: 401 },
  );
}

export async function requireActiveAdmin(request: NextRequest): Promise<AdminAuthResult> {
  const authHeader = request.headers.get("authorization");
  const authHeaderPresent = !!authHeader;
  const bearerPresent = !!authHeader?.startsWith("Bearer ");
  const adminProjectId = process.env.FIREBASE_PROJECT_ID ?? null;
  const tokenLength = bearerPresent ? authHeader!.slice("Bearer ".length).trim().length : 0;
  console.warn("[AUTH DEBUG] requireActiveAdmin", {
    adminProjectId,
    authHeaderPresent,
    bearerPresent,
    tokenLength,
  });

  if (!bearerPresent) {
    return {
      ok: false,
      response: jsonUnauthorizedDebug({
        authHeaderPresent,
        bearerPresent,
        verifyErrorCode: null,
        verifyErrorMessage: null,
        adminProjectId,
      }),
    };
  }
  const token = (authHeader ?? "").slice("Bearer ".length).trim();
  if (!token) {
    return {
      ok: false,
      response: jsonUnauthorizedDebug({
        authHeaderPresent,
        bearerPresent,
        verifyErrorCode: "empty_token",
        verifyErrorMessage: null,
        adminProjectId,
      }),
    };
  }

  let uid: string;
  let adminEmail: string | null = null;
  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    uid = decoded.uid;
    adminEmail = typeof decoded.email === "string" ? decoded.email : null;
  } catch (err) {
    const e = err as { code?: unknown; message?: unknown };
    const verifyErrorCode = typeof e?.code === "string" ? e.code : null;
    const verifyErrorMessage = typeof e?.message === "string" ? e.message : null;
    console.warn("[AUTH DEBUG] verifyIdToken failed", {
      adminProjectId,
      verifyErrorCode,
      verifyErrorMessage,
      tokenLength: token.length,
    });
    return {
      ok: false,
      response: jsonUnauthorizedDebug({
        authHeaderPresent,
        bearerPresent,
        verifyErrorCode,
        verifyErrorMessage,
        adminProjectId,
      }),
    };
  }

  const db = getAdminFirestore();
  const adminSnap = await db.collection("adminUsers").doc(uid).get();
  const adminData = adminSnap.data() as { active?: unknown } | undefined;
  if (!adminSnap.exists || !isTrueish(adminData?.active)) {
    console.warn("[AUTH DEBUG] adminUsers gate rejected", {
      adminProjectId,
      uid,
      adminUsersExists: adminSnap.exists,
      adminActive: adminData?.active === true || adminData?.active === "true" ? true : false,
    });
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { ok: true, admin: { uid, adminEmail } };
}
