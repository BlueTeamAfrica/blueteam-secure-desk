import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/app/_lib/server/firebaseAdmin";

export type VerifiedUser = { uid: string; email: string | null };

export type UserAuthResult =
  | { ok: true; user: VerifiedUser }
  | { ok: false; response: NextResponse };

export async function requireFirebaseUser(request: NextRequest): Promise<UserAuthResult> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    const email = typeof decoded.email === "string" ? decoded.email : null;
    return { ok: true, user: { uid: decoded.uid, email } };
  } catch {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
}

