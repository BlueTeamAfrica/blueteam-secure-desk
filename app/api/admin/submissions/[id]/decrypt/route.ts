import { NextRequest, NextResponse } from "next/server";
import { requireActiveAdmin } from "@/app/_lib/server/adminApiAuth";
import { decryptEncryptedPayloadFieldToJson } from "@/app/_lib/server/decryptEncryptedPayload";
import { logSubmissionAudit } from "@/app/_lib/server/logSubmissionAudit";
import {
  assertMayDecryptSubmission,
  jsonForbidden,
  jsonNotFound,
  loadWorkspaceCaseForSubmission,
  workspaceUserContextFromAdmin,
} from "@/app/_lib/server/submissionCaseAccess";
import { fetchWorkspaceRole } from "@/app/_lib/server/workspaceRole";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteParams) {
  try {
    const auth = await requireActiveAdmin(request);
    if (!auth.ok) return auth.response;
    const { admin } = auth;

    const role = await fetchWorkspaceRole(admin.uid);
    if (!role) {
      // Temporary server-side debug only (no payload/title/body).
      console.warn("[decrypt] permissionDecision", {
        uid: admin.uid,
        role: null,
        submissionId: (await context.params).id,
        permissionDecision: "deny_no_role",
      });
      return jsonForbidden();
    }

    const { id } = await context.params;
    const workspaceCase = await loadWorkspaceCaseForSubmission(id);
    if (!workspaceCase) {
      return jsonNotFound();
    }

    const ctx = await workspaceUserContextFromAdmin(admin);
    const decryptDenied = assertMayDecryptSubmission(role, workspaceCase, ctx);
    if (decryptDenied) {
      // Temporary server-side debug only (no payload/title/body).
      console.warn("[decrypt] permissionDecision", {
        uid: admin.uid,
        role,
        submissionId: id,
        permissionDecision: "deny_assertMayDecryptSubmission",
      });
      return decryptDenied;
    }

    const encryptedPayload = workspaceCase.encryptedPayload;
    if (encryptedPayload === undefined || encryptedPayload === null) {
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }

    let decrypted: unknown;
    try {
      decrypted = decryptEncryptedPayloadFieldToJson(encryptedPayload);
    } catch {
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }

    try {
      await logSubmissionAudit({
        submissionId: id,
        adminUid: admin.uid,
        adminEmail: admin.adminEmail,
        action: "decrypt",
      });
    } catch {
      /* audit failure must not block decrypt response */
    }

    return NextResponse.json(decrypted);
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
