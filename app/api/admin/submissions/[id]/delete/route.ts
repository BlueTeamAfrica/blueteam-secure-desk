import { NextRequest, NextResponse } from "next/server";
import { requireActiveAdmin } from "@/app/_lib/server/adminApiAuth";
import { getAdminFirestore } from "@/app/_lib/server/firebaseAdmin";
import { fetchWorkspaceRole } from "@/app/_lib/server/workspaceRole";
import { canDeleteItem } from "@/app/_lib/workflow/permissions";
import { logSubmissionAudit } from "@/app/_lib/server/logSubmissionAudit";

type RouteParams = { params: Promise<{ id: string }> };

export async function DELETE(request: NextRequest, context: RouteParams) {
  try {
    const auth = await requireActiveAdmin(request);
    if (!auth.ok) return auth.response;
    const { admin } = auth;

    const role = await fetchWorkspaceRole(admin.uid);
    if (!canDeleteItem(role)) {
      return NextResponse.json(
        { error: "Only the workspace owner can delete reports." },
        { status: 403 },
      );
    }

    const { id } = await context.params;
    if (!id?.trim()) {
      return NextResponse.json({ error: "Missing submission id" }, { status: 400 });
    }

    const db = getAdminFirestore();
    const ref = db.collection("submissions").doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    }

    await ref.delete();

    try {
      await logSubmissionAudit({
        submissionId: id,
        adminUid: admin.uid,
        adminEmail: admin.adminEmail,
        action: "delete",
      });
    } catch {
      /* audit failure must not block delete */
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Could not delete submission" }, { status: 500 });
  }
}
