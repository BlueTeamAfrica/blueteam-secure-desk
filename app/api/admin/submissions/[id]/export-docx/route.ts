import { NextRequest, NextResponse } from "next/server";
import { extractDecryptedFiling } from "@/app/_lib/decryptedSubmissionReadout";
import { getSubmissionDisplay } from "@/app/_lib/items/getSubmissionDisplay";
import { mapSubmissionToItem } from "@/app/_lib/items/mapSubmissionToItem";
import { mayShowDecryptUi } from "@/app/_lib/rbac";
import {
  asciiFallbackExportFilename,
  buildExportDocxFilename,
  buildSubmissionDocxBuffer,
} from "@/app/_lib/server/buildSubmissionDocx";
import { requireActiveAdmin } from "@/app/_lib/server/adminApiAuth";
import { decryptEncryptedPayloadFieldToJson } from "@/app/_lib/server/decryptEncryptedPayload";
import {
  jsonForbidden,
  jsonNotFound,
  loadWorkspaceCaseForSubmission,
  workspaceUserContextFromAdmin,
} from "@/app/_lib/server/submissionCaseAccess";
import { fetchWorkspaceRole } from "@/app/_lib/server/workspaceRole";
import { mayExportSubmissionDocx } from "@/app/_lib/workflow/permissions";

export const runtime = "nodejs";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteParams) {
  try {
    const auth = await requireActiveAdmin(request);
    if (!auth.ok) return auth.response;
    const { admin } = auth;

    const role = await fetchWorkspaceRole(admin.uid);
    if (!role) return jsonForbidden();

    const { id } = await context.params;
    if (!id?.trim()) {
      return NextResponse.json({ error: "Missing submission id" }, { status: 400 });
    }

    const workspaceCase = await loadWorkspaceCaseForSubmission(id);
    if (!workspaceCase) return jsonNotFound();

    const ctx = await workspaceUserContextFromAdmin(admin);
    if (!mayExportSubmissionDocx({ role, workspaceCase, ctx })) {
      return NextResponse.json(
        { error: "You don't have permission to export this report." },
        { status: 403 },
      );
    }

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

    const display = getSubmissionDisplay({
      submission: workspaceCase,
      decryptedFiling,
    });
    const item = mapSubmissionToItem({
      submission: workspaceCase,
      decryptedFiling,
    });

    const generatedAtIso = new Date().toISOString();
    const buffer = await buildSubmissionDocxBuffer({
      submission: workspaceCase,
      display,
      item,
      generatedAtIso,
    });

    const filename = buildExportDocxFilename(display);
    const asciiName = asciiFallbackExportFilename(display);
    const encoded = encodeURIComponent(filename);

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encoded}`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Could not generate export" }, { status: 500 });
  }
}
