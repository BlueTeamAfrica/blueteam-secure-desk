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

function sanitizeDebugMessage(message: string): string {
  if (/openssl|decoder routines|::|digital envelope routines|bad decrypt|wrong final block length/i.test(message)) {
    return "[redacted: crypto/provider detail]";
  }
  return message.slice(0, 280);
}

function errMeta(err: unknown): { message: string; errorName: string; errorCode: string | null } {
  const e = err instanceof Error ? err : new Error(String(err));
  const code = (err as { code?: unknown }).code;
  return {
    message: sanitizeDebugMessage(e.message || String(err)),
    errorName: e.name,
    errorCode: typeof code === "string" ? code : null,
  };
}

function jsonStageFail(failedStage: string, err: unknown): NextResponse {
  const meta = errMeta(err);
  console.error("[DECRYPT STAGE FAIL]", { failedStage, ...meta });
  return NextResponse.json(
    {
      error: "Internal server error",
      debug: {
        failedStage,
        message: meta.message,
        errorName: meta.errorName,
        errorCode: meta.errorCode,
      },
    },
    { status: 500 },
  );
}

export async function GET(request: NextRequest, context: RouteParams) {
  console.log("[DECRYPT STAGE]", "start");

  let id: string;
  try {
    id = (await context.params).id;
  } catch (err) {
    return jsonStageFail("context.params", err);
  }

  console.log("[DECRYPT STAGE]", "after_context_params");

  let auth: Awaited<ReturnType<typeof requireActiveAdmin>>;
  try {
    auth = await requireActiveAdmin(request);
  } catch (err) {
    return jsonStageFail("requireActiveAdmin", err);
  }
  console.log("[DECRYPT STAGE]", "after requireActiveAdmin");
  if (!auth.ok) return auth.response;
  const { admin } = auth;

  let role: Awaited<ReturnType<typeof fetchWorkspaceRole>>;
  try {
    role = await fetchWorkspaceRole(admin.uid);
  } catch (err) {
    return jsonStageFail("fetchWorkspaceRole", err);
  }
  console.log("[DECRYPT STAGE]", "after fetchWorkspaceRole");

  if (!role) {
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

  let workspaceCase: Awaited<ReturnType<typeof loadWorkspaceCaseForSubmission>>;
  try {
    workspaceCase = await loadWorkspaceCaseForSubmission(id);
  } catch (err) {
    return jsonStageFail("loadWorkspaceCaseForSubmission", err);
  }
  console.log("[DECRYPT STAGE]", "after loadWorkspaceCaseForSubmission");

  if (!workspaceCase) {
    return jsonNotFound();
  }

  let ctx: Awaited<ReturnType<typeof workspaceUserContextFromAdmin>>;
  try {
    ctx = await workspaceUserContextFromAdmin(admin);
  } catch (err) {
    return jsonStageFail("workspaceUserContextFromAdmin", err);
  }
  console.log("[DECRYPT STAGE]", "after_workspaceUserContextFromAdmin");

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
  console.log("[DECRYPT STAGE]", "after permission check");

  const encryptedPayload = workspaceCase.encryptedPayload;
  if (encryptedPayload === undefined || encryptedPayload === null) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  console.warn("[decrypt] decrypt_secret_state", {
    ...getSubmissionPayloadSecretDiagnostics(),
    submissionId: id,
  });

  console.log("[DECRYPT STAGE]", "before payload decrypt");
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
    return jsonStageFail("decryptEncryptedPayloadFieldToJson", decryptErr);
  }
  console.log("[DECRYPT STAGE]", "after payload decrypt");

  console.log("[DECRYPT STAGE]", "before audit log");
  try {
    await logSubmissionAudit({
      submissionId: id,
      adminUid: admin.uid,
      adminEmail: admin.adminEmail,
      action: "decrypt",
    });
  } catch (err) {
    return jsonStageFail("logSubmissionAudit", err);
  }
  console.log("[DECRYPT STAGE]", "after audit log");

  return NextResponse.json(decrypted);
}
