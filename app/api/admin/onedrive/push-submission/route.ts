import { NextRequest, NextResponse } from "next/server";
import { requireActiveAdmin } from "@/app/_lib/server/adminApiAuth";
import { fetchWorkspaceRole } from "@/app/_lib/server/workspaceRole";
import { pushSubmissionToOneDrive } from "@/app/_lib/server/submissionOneDriveSyncServer";

export const runtime = "nodejs";

type RequestBody = { submissionId?: unknown; force?: unknown };

/**
 * POST /api/admin/onedrive/push-submission
 *
 * Uploads a submission DOCX to the OneDrive stage folder that matches the
 * submission's current `caseStatus`.
 *
 * If the submission already has an `onedriveItemId` the call is a no-op
 * unless `force: true` is passed (which re-uploads and overwrites).
 *
 * Used by:
 *  - The dashboard background "auto on receipt" trigger (new submissions).
 *  - The manual "Upload to OneDrive" action on a card.
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
      return NextResponse.json({ error: "Only owners and admins can push to OneDrive." }, { status: 403 });
    }

    const body = (await request.json().catch(() => null)) as RequestBody | null;
    const submissionId = typeof body?.submissionId === "string" ? body.submissionId.trim() : null;
    if (!submissionId) {
      return NextResponse.json({ error: "Missing submissionId." }, { status: 400 });
    }

    const force = body?.force === true;

    const result = await pushSubmissionToOneDrive(submissionId, { force });

    if (!result.ok) {
      // 409 = integration not connected; 400 = not found / bad state.
      const status = result.reason.includes("not connected") || result.reason.includes("not enabled") ? 409 : 400;
      return NextResponse.json({ error: result.reason }, { status });
    }

    return NextResponse.json({
      ok: true,
      action: result.action,
      webUrl: result.webUrl ?? null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "OneDrive push failed.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
