import { NextRequest, NextResponse } from "next/server";
import { fetchWorkspaceRole } from "@/app/_lib/server/workspaceRole";
import { requireFirebaseUser } from "@/app/_lib/server/userApiAuth";
import { getPersonalOneDriveToken } from "@/app/_lib/server/personalOneDriveTokenStore";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await requireFirebaseUser(request);
  if (!auth.ok) return auth.response;
  const { user } = auth;

  const role = await fetchWorkspaceRole(user.uid);
  if (role !== "owner" && role !== "admin") {
    return NextResponse.json({ connected: false }, { status: 200 });
  }

  try {
    const token = await getPersonalOneDriveToken(user.uid);
    const expiresAt = token?.expiresAt ? new Date(token.expiresAt).getTime() : 0;
    const connected = !!token && (!!token.refreshToken || (expiresAt > Date.now()));
    const accountEmail = token?.accountEmail;
    return NextResponse.json({ connected, ...(accountEmail ? { accountEmail } : {}) }, { status: 200 });
  } catch {
    return NextResponse.json({ connected: false }, { status: 200 });
  }
}

