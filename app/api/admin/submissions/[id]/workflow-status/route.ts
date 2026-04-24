import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import type { CaseStatus } from "@/app/_lib/caseWorkspaceModel";
import { normalizeCaseStatus } from "@/app/_lib/caseWorkspaceModel";
import type { WorkspaceUserContext } from "@/app/_lib/rbac";
import { canChangeWorkflowStatus } from "@/app/_lib/workflow/permissions";
import { requireActiveAdmin } from "@/app/_lib/server/adminApiAuth";
import { getAdminFirestore } from "@/app/_lib/server/firebaseAdmin";
import { logSubmissionAudit } from "@/app/_lib/server/logSubmissionAudit";
import {
  assertMayMutateSubmission,
  jsonForbidden,
  jsonNotFound,
  loadWorkspaceCaseForSubmission,
  workspaceUserContextFromAdmin,
} from "@/app/_lib/server/submissionCaseAccess";
import { fetchWorkspaceRole } from "@/app/_lib/server/workspaceRole";

type RouteParams = { params: Promise<{ id: string }> };

const CASE_STATUS_SET = new Set<string>([
  "new",
  "needs_triage",
  "assigned",
  "in_review",
  "waiting_follow_up",
  "resolved",
  "archived",
]);

function parseCaseStatusBody(v: unknown): CaseStatus | null {
  if (typeof v !== "string") return null;
  const t = v.trim().toLowerCase().replace(/[\s-]+/g, "_").replace(/_+/g, "_");
  if (!CASE_STATUS_SET.has(t)) return null;
  return t as CaseStatus;
}

/** `processingStatus` values that keep legacy readers / filters aligned with approved enum. */
const PROCESSING_FOR_CASE_STATUS: Record<CaseStatus, string> = {
  new: "new",
  needs_triage: "needs_triage",
  assigned: "assigned",
  in_review: "in_review",
  waiting_follow_up: "waiting_follow_up",
  resolved: "verified",
  archived: "archived",
};

export async function POST(request: NextRequest, context: RouteParams) {
  try {
    const auth = await requireActiveAdmin(request);
    if (!auth.ok) return auth.response;
    const { admin } = auth;

    const role = await fetchWorkspaceRole(admin.uid);
    const mutateDenied = assertMayMutateSubmission(role);
    if (mutateDenied) return mutateDenied;
    if (!role) {
      return jsonForbidden();
    }

    const { id } = await context.params;
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    if (typeof body !== "object" || body === null || !("caseStatus" in body)) {
      return NextResponse.json({ error: "Missing caseStatus" }, { status: 400 });
    }
    const target = parseCaseStatusBody((body as { caseStatus: unknown }).caseStatus);
    if (!target) {
      return NextResponse.json({ error: "Invalid caseStatus" }, { status: 400 });
    }

    const workspaceCase = await loadWorkspaceCaseForSubmission(id);
    if (!workspaceCase) {
      return jsonNotFound();
    }

    const ctx: WorkspaceUserContext = await workspaceUserContextFromAdmin(admin);
    const processingStatus =
      typeof workspaceCase.processingStatus === "string" ? workspaceCase.processingStatus : null;
    const current = normalizeCaseStatus(workspaceCase.raw, processingStatus);

    if (!canChangeWorkflowStatus({ role, fromStatus: current, toStatus: target, workspaceCase, ctx })) {
      return jsonForbidden();
    }

    const db = getAdminFirestore();
    const subRef = db.collection("submissions").doc(id);

    const patch: Record<string, unknown> = {
      caseStatus: target,
      processingStatus: PROCESSING_FOR_CASE_STATUS[target],
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (target === "resolved") {
      patch.resolvedAt = FieldValue.serverTimestamp();
    }
    if (target === "archived") {
      patch.archivedAt = FieldValue.serverTimestamp();
    }

    await subRef.update(patch);

    try {
      await logSubmissionAudit({
        submissionId: id,
        adminUid: admin.uid,
        adminEmail: admin.adminEmail,
        action: "update_case_status",
        details: { from: current, to: target },
      });
    } catch {
      /* audit failure must not block */
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
