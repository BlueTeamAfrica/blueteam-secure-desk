import { NextRequest, NextResponse } from "next/server";
import { requireActiveAdmin } from "@/app/_lib/server/adminApiAuth";
import { fetchWorkspaceRole } from "@/app/_lib/server/workspaceRole";
import { pullSyncFromOneDrive } from "@/app/_lib/server/submissionOneDriveSyncServer";

export const runtime = "nodejs";

/**
 * POST /api/admin/onedrive/pull-sync
 *
 * Bidirectional sync: reads all stage folders in OneDrive and updates
 * Firestore submission stages where the file location disagrees with the
 * stored `caseStatus`.
 *
 * This is the OneDrive → Secure Desk direction. It lets the editorial team
 * move files between OneDrive folders (their existing workflow) and have
 * those moves reflected in Secure Desk.
 *
 * The pull-sync is a polling-based approach. For real-time sync, a Graph API
 * webhook subscription (delta query) would be needed — that can be added later
 * as the team's workflow matures.
 *
 * Requires: active admin + owner or admin role.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireActiveAdmin(request);
    if (!auth.ok) return auth.response;
    const { admin } = auth;

    const role = await fetchWorkspaceRole(admin.uid);
    if (role !== "owner" && role !== "admin") {
      return NextResponse.json({ error: "Only owners and admins can run OneDrive sync." }, { status: 403 });
    }

    const result = await pullSyncFromOneDrive();

    if (!result.ok && result.checked === 0) {
      return NextResponse.json({ error: result.errors[0] ?? "Sync failed." }, { status: 409 });
    }

    return NextResponse.json({
      ok: true,
      checked: result.checked,
      updated: result.updated,
      errors: result.errors.length > 0 ? result.errors : undefined,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "OneDrive pull sync failed.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
