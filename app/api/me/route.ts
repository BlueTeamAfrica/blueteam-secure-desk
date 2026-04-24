import { NextRequest, NextResponse } from "next/server";
import { requireActiveAdmin } from "@/app/_lib/server/adminApiAuth";
import { fetchWorkspaceRole } from "@/app/_lib/server/workspaceRole";

/**
 * Returns the signed-in workspace member's role from Firestore `users/{uid}`.
 * Requires the same admin gate as the rest of the dashboard (adminUsers.active).
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireActiveAdmin(request);
    if (!auth.ok) return auth.response;
    const { admin } = auth;

    const role = await fetchWorkspaceRole(admin.uid);

    return NextResponse.json({
      role,
      email: admin.adminEmail,
    });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
