import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminFirestore } from "@/app/_lib/server/firebaseAdmin";

export type VerifiedAdmin = { uid: string; adminEmail: string | null };

export type AdminAuthResult =
  | { ok: true; admin: VerifiedAdmin }
  | { ok: false; response: NextResponse };

export async function requireActiveAdmin(request: NextRequest): Promise<AdminAuthResult> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  let uid: string;
  let adminEmail: string | null = null;
  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    uid = decoded.uid;
    adminEmail = typeof decoded.email === "string" ? decoded.email : null;
  } catch {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const db = getAdminFirestore();
  const adminSnap = await db.collection("adminUsers").doc(uid).get();
  const adminData = adminSnap.data() as { active?: unknown } | undefined;
  if (!adminSnap.exists || adminData?.active !== true) {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { ok: true, admin: { uid, adminEmail } };
}
