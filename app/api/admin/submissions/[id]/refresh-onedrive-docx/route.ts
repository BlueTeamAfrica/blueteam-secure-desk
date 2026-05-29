import { NextRequest, NextResponse } from "next/server";
import { requireActiveAdmin } from "@/app/_lib/server/adminApiAuth";
import { fetchWorkspaceRole } from "@/app/_lib/server/workspaceRole";
import { refreshSubmissionDocxInOneDrive } from "@/app/_lib/server/submissionOneDriveSyncServer";
import { logSubmissionAudit } from "@/app/_lib/server/logSubmissionAudit";
import {
  assertMayMutateSubmission,
  jsonForbidden,
  jsonNotFound,
  loadWorkspaceCaseForSubmission,
  workspaceUserContextFromAdmin,
} from "@/app/_lib/server/submissionCaseAccess";
import { mayExportSubmissionDocx } from "@/app/_lib/workflow/permissions";

export const runtime = "nodejs";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * POST /api/admin/submissions/[id]/refresh-onedrive-docx
 *
 * Regenerates the metadata DOCX for an already-exported submission and
 * overwrites it in the existing OneDrive subfolder with current data.
 * Attachments are not re-uploaded (they don't change).
 *
 * If the submission hasn't been exported yet, does a full first export.
 */
export async function POST(request: NextRequest, context: RouteParams) {
  try {
    const auth = await requireActiveAdmin(request);
    if (!auth.ok) return auth.response;
    const { admin } = auth;

    const role = await fetchWorkspaceRole(admin.uid);
    const mutateDenied = assertMayMutateSubmission(role);
    if (mutateDenied) return mutateDenied;
    if (!role) return jsonForbidden();

    const { id } = await context.params;

    const workspaceCase = await loadWorkspaceCaseForSubmission(id);
    if (!workspaceCase) return jsonNotFound();

    const ctx = await workspaceUserContextFromAdmin(admin);
    if (!mayExportSubmissionDocx({ role, workspaceCase, ctx })) {
      return NextResponse.json(
        { error: "You don't have permission to export this report." },
        { status: 403 },
      );
    }

    const result = await refreshSubmissionDocxInOneDrive(id);

    if (!result.ok) {
      const status = result.reason.includes("not connected") || result.reason.includes("not enabled")
        ? 409
        : 500;
      return NextResponse.json({ error: result.reason }, { status });
    }

    try {
      await logSubmissionAudit({
        submissionId: id,
        adminUid: admin.uid,
        adminEmail: admin.adminEmail,
        action: "export_docx",
        details: { destination: "oneDrive", action: "refresh" },
      });
    } catch { /* ignore */ }

    return NextResponse.json({ ok: true, action: result.action, webUrl: result.webUrl ?? null });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Refresh failed.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
