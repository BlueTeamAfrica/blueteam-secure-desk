import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { requireActiveAdmin } from "@/app/_lib/server/adminApiAuth";
import { getAdminFirestore } from "@/app/_lib/server/firebaseAdmin";
import { logSubmissionAudit } from "@/app/_lib/server/logSubmissionAudit";
import { mayRunLegacyReviewerStatus, maySaveReviewerNote } from "@/app/_lib/workflow/permissions";
import {
  assertMayMutateSubmission,
  jsonForbidden,
  jsonNotFound,
  loadWorkspaceCaseForSubmission,
  workspaceUserContextFromAdmin,
} from "@/app/_lib/server/submissionCaseAccess";
import { fetchWorkspaceRole } from "@/app/_lib/server/workspaceRole";

type RouteParams = { params: Promise<{ id: string }> };

const REVIEWER_ACTIONS = ["mark_in_review", "mark_verified", "save_reviewer_note"] as const;
type ReviewerAction = (typeof REVIEWER_ACTIONS)[number];

function isReviewerAction(a: string): a is ReviewerAction {
  return (REVIEWER_ACTIONS as readonly string[]).includes(a);
}

export async function POST(request: NextRequest, context: RouteParams) {
  try {
    const auth = await requireActiveAdmin(request);
    if (!auth.ok) return auth.response;
    const { admin } = auth;

    const role = await fetchWorkspaceRole(admin.uid);
    if (!role) {
      return jsonForbidden();
    }
    const mutateDenied = assertMayMutateSubmission(role);
    if (mutateDenied) return mutateDenied;

    const { id } = await context.params;
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    if (typeof body !== "object" || body === null || !("action" in body)) {
      return NextResponse.json({ error: "Missing action" }, { status: 400 });
    }

    const action = (body as { action: unknown }).action;
    if (typeof action !== "string" || !isReviewerAction(action)) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    if (action === "save_reviewer_note") {
      if (
        !("reviewerNote" in body) ||
        typeof (body as { reviewerNote: unknown }).reviewerNote !== "string"
      ) {
        return NextResponse.json({ error: "Missing reviewerNote" }, { status: 400 });
      }
    }

    const workspaceCase = await loadWorkspaceCaseForSubmission(id);
    if (!workspaceCase) {
      return jsonNotFound();
    }

    const ctx = await workspaceUserContextFromAdmin(admin);

    if (action === "save_reviewer_note") {
      if (!maySaveReviewerNote({ role, workspaceCase, ctx })) return jsonForbidden();
    } else {
      if (!mayRunLegacyReviewerStatus({ role, workspaceCase, ctx })) return jsonForbidden();
    }

    const db = getAdminFirestore();
    const subRef = db.collection("submissions").doc(id);

    let auditDetails: Record<string, unknown> | undefined;

    if (action === "mark_in_review") {
      await subRef.update({ processingStatus: "in_review" });
    } else if (action === "mark_verified") {
      await subRef.update({
        processingStatus: "verified",
        reviewedAt: FieldValue.serverTimestamp(),
      });
      auditDetails = { processingStatus: "verified" };
    } else {
      const reviewerNote = (body as unknown as { reviewerNote: string }).reviewerNote;
      await subRef.update({ reviewerNote });
      auditDetails = { noteLength: reviewerNote.length };
    }

    try {
      await logSubmissionAudit({
        submissionId: id,
        adminUid: admin.uid,
        adminEmail: admin.adminEmail,
        action,
        ...(auditDetails !== undefined ? { details: auditDetails } : {}),
      });
    } catch {
      /* audit failure must not block successful update response */
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
