import { NextRequest, NextResponse } from "next/server";
import { requireActiveAdmin } from "@/app/_lib/server/adminApiAuth";
import { decryptEncryptedPayloadFieldToJson } from "@/app/_lib/server/decryptEncryptedPayload";
import { extractDecryptedFiling } from "@/app/_lib/decryptedSubmissionReadout";
import { buildExportPackage } from "@/app/_lib/integrations/buildExportPackage";
import { canAccessCaseData, mayShowDecryptUi } from "@/app/_lib/rbac";
import {
  jsonForbidden,
  jsonNotFound,
  loadWorkspaceCaseForSubmission,
  workspaceUserContextFromAdmin,
} from "@/app/_lib/server/submissionCaseAccess";
import { fetchWorkspaceRole } from "@/app/_lib/server/workspaceRole";
import { getWorkspaceConfig } from "@/app/_lib/org/getWorkspaceConfig";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteParams) {
  try {
    const auth = await requireActiveAdmin(request);
    if (!auth.ok) return auth.response;
    const { admin } = auth;

    const role = await fetchWorkspaceRole(admin.uid);
    if (!role) return jsonForbidden();
    if (!canAccessCaseData(role)) return jsonForbidden();

    const { id } = await context.params;
    if (!id?.trim()) {
      return NextResponse.json({ error: "Missing submission id" }, { status: 400 });
    }

    const workspaceCase = await loadWorkspaceCaseForSubmission(id);
    if (!workspaceCase) return jsonNotFound();

    const ctx = await workspaceUserContextFromAdmin(admin);

    let decryptedFiling: ReturnType<typeof extractDecryptedFiling> | undefined;
    const enc = workspaceCase.encryptedPayload?.trim();
    if (enc && mayShowDecryptUi(role, workspaceCase, ctx)) {
      try {
        const json = decryptEncryptedPayloadFieldToJson(enc);
        decryptedFiling = extractDecryptedFiling(json);
      } catch {
        decryptedFiling = undefined;
      }
    }

    const cfg = getWorkspaceConfig();
    const pkg = buildExportPackage({
      submissionId: id,
      decryptedFiling,
      caseMeta: workspaceCase,
      attachments: workspaceCase.attachments ?? [],
      status: workspaceCase.status,
      workspaceName: cfg.branding.workspaceName,
    });

    return NextResponse.json(
      { package: pkg },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

