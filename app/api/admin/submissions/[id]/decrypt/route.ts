import { NextRequest, NextResponse } from "next/server";
import { requireActiveAdmin } from "@/app/_lib/server/adminApiAuth";
import {
  decryptEncryptedPayloadFieldToJson,
  getSubmissionPayloadSecretDiagnostics,
  SubmissionPayloadDecryptFailedError,
  SubmissionPayloadSecretMissingError,
} from "@/app/_lib/server/decryptEncryptedPayload";
import { logSubmissionAudit } from "@/app/_lib/server/logSubmissionAudit";
import {
  assertMayDecryptSubmission,
  jsonNotFound,
  loadWorkspaceCaseForSubmission,
  workspaceUserContextFromAdmin,
} from "@/app/_lib/server/submissionCaseAccess";
import { fetchWorkspaceRole } from "@/app/_lib/server/workspaceRole";
import { mayShowDecryptUi, mayViewSubmission, normalizeWorkspaceRole } from "@/app/_lib/rbac";

type RouteParams = { params: Promise<{ id: string }> };

function looksLikeEmail(v: string | null | undefined): boolean {
  const t = (v ?? "").trim();
  if (!t) return false;
  return t.includes("@") && !t.includes(" ");
}

export async function GET(request: NextRequest, context: RouteParams) {
  try {
    const auth = await requireActiveAdmin(request);
    if (!auth.ok) return auth.response;
    const { admin } = auth;

    const { id } = await context.params;

    const role = await fetchWorkspaceRole(admin.uid);
    if (!role) {
      // Temporary server-side debug only (no payload/title/body).
      console.warn("[decrypt] permissionDecision", {
        uid: admin.uid,
        role: null,
        submissionId: id,
        permissionDecision: "deny_no_role",
      });
      return NextResponse.json(
        {
          error: "You don't have permission to perform this action.",
          debug: {
            uid: admin.uid,
            email: admin.adminEmail,
            workspaceRole: null,
            normalizedRole: null,
            caseId: id,
            caseStatus: null,
            assignedOwnerId: null,
            assignedOwnerEmail: null,
            mayViewSubmission: false,
            mayShowDecryptUi: false,
            reason: "no_workspace_role",
          },
        },
        { status: 403 },
      );
    }

    const workspaceCase = await loadWorkspaceCaseForSubmission(id);
    if (!workspaceCase) {
      return jsonNotFound();
    }

    const ctx = await workspaceUserContextFromAdmin(admin);
    const assignedOwnerEmail = looksLikeEmail(workspaceCase.assignedOwnerName) ? workspaceCase.assignedOwnerName : null;
    const debugBase = {
      uid: admin.uid,
      email: admin.adminEmail,
      workspaceRole: role,
      normalizedRole: normalizeWorkspaceRole(role),
      caseId: workspaceCase.id,
      caseStatus: workspaceCase.status,
      assignedOwnerId: workspaceCase.assignedOwnerId,
      assignedOwnerEmail,
      mayViewSubmission: mayViewSubmission(role, workspaceCase, ctx),
      mayShowDecryptUi: mayShowDecryptUi(role, workspaceCase, ctx),
    };

    const decryptDenied = assertMayDecryptSubmission(role, workspaceCase, ctx);
    if (decryptDenied) {
      // Temporary server-side debug only (no payload/title/body).
      console.warn("[decrypt] permissionDecision", {
        uid: admin.uid,
        role,
        submissionId: id,
        permissionDecision: "deny_assertMayDecryptSubmission",
      });
      const reason = !debugBase.mayViewSubmission
        ? "mayViewSubmission=false"
        : !debugBase.mayShowDecryptUi
          ? "mayShowDecryptUi=false"
          : "assertMayDecryptSubmission_denied";
      return NextResponse.json(
        {
          error: "You don't have permission to perform this action.",
          debug: { ...debugBase, reason },
        },
        { status: 403 },
      );
    }

    const encryptedPayload = workspaceCase.encryptedPayload;
    if (encryptedPayload === undefined || encryptedPayload === null) {
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }

    console.warn("[decrypt] decrypt_secret_state", {
      ...getSubmissionPayloadSecretDiagnostics(),
      submissionId: id,
    });

    let decrypted: unknown;
    try {
      decrypted = decryptEncryptedPayloadFieldToJson(encryptedPayload);
    } catch (decryptErr) {
      if (decryptErr instanceof SubmissionPayloadSecretMissingError) {
        return NextResponse.json({ error: decryptErr.message }, { status: 503 });
      }
      if (decryptErr instanceof SubmissionPayloadDecryptFailedError) {
        return NextResponse.json({ error: "Could not decrypt this submission." }, { status: 400 });
      }
      throw decryptErr instanceof Error ? decryptErr : new Error(String(decryptErr));
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
  } catch (err) {
    let submissionId: string | undefined;
    try {
      submissionId = (await context.params).id;
    } catch {
      submissionId = undefined;
    }

    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error("[DECRYPT ERROR]", {
      message,
      stack,
      submissionId,
    });

    const safeForClient =
      message === "Server decrypt secret is not configured" ||
      message === "Could not decrypt this submission." ||
      !/openssl|decoder routines|::|digital envelope routines|bad decrypt|wrong final block length/i.test(
        message,
      );

    return NextResponse.json(
      {
        error: "Internal server error",
        ...(safeForClient ? { debug: message } : {}),
      },
      { status: 500 },
    );
  }
}
