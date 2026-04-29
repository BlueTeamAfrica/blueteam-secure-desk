import { NextRequest, NextResponse } from "next/server";
import { extractDecryptedFiling } from "@/app/_lib/decryptedSubmissionReadout";
import { getSubmissionDisplay } from "@/app/_lib/items/getSubmissionDisplay";
import { mapSubmissionToItem } from "@/app/_lib/items/mapSubmissionToItem";
import { getExportDestinationForStage } from "@/app/_lib/integrations/getExportDestinationForStage";
import { safeExportName } from "@/app/_lib/integrations/safeExportName";
import { mayShowDecryptUi } from "@/app/_lib/rbac";
import { requireActiveAdmin } from "@/app/_lib/server/adminApiAuth";
import { decryptEncryptedPayloadFieldToJson } from "@/app/_lib/server/decryptEncryptedPayload";
import { getOneDriveTokenSet, setOneDriveTokenSet } from "@/app/_lib/server/onedriveTokenStore";
import { refreshAccessToken } from "@/app/_lib/server/onedriveOAuth";
import { logSubmissionAudit } from "@/app/_lib/server/logSubmissionAudit";
import {
  asciiFallbackExportFilename,
  buildExportDocxFilename,
  buildSubmissionDocxBuffer,
} from "@/app/_lib/server/buildSubmissionDocx";
import {
  jsonForbidden,
  jsonNotFound,
  loadWorkspaceCaseForSubmission,
  workspaceUserContextFromAdmin,
} from "@/app/_lib/server/submissionCaseAccess";
import { fetchWorkspaceRole } from "@/app/_lib/server/workspaceRole";
import { mayExportSubmissionDocx } from "@/app/_lib/workflow/permissions";

export const runtime = "nodejs";

type UploadBody = { submissionId?: unknown };

function safeString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
}

async function putDocxToOneDrive(args: { accessToken: string; path: string; bytes: Uint8Array }) {
  const url = `https://graph.microsoft.com/v1.0/me/drive/root:/${args.path}:/content`;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${args.accessToken}`,
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    },
    body: Buffer.from(args.bytes),
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = "OneDrive upload failed.";
    try {
      const j = JSON.parse(text) as { error?: { message?: unknown } };
      if (typeof j?.error?.message === "string") msg = j.error.message;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return text;
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireActiveAdmin(request);
    if (!auth.ok) return auth.response;
    const { admin } = auth;

    const role = await fetchWorkspaceRole(admin.uid);
    if (!role) return jsonForbidden();

    const body = (await request.json().catch(() => null)) as UploadBody | null;
    const submissionId = safeString(body?.submissionId);
    if (!submissionId) {
      return NextResponse.json({ error: "Missing submissionId" }, { status: 400 });
    }

    const workspaceCase = await loadWorkspaceCaseForSubmission(submissionId);
    if (!workspaceCase) return jsonNotFound();

    const ctx = await workspaceUserContextFromAdmin(admin);
    if (!mayExportSubmissionDocx({ role, workspaceCase, ctx })) {
      return NextResponse.json({ error: "You don't have permission to export this report." }, { status: 403 });
    }

    let token = await getOneDriveTokenSet();
    if (!token) {
      return NextResponse.json({ error: "OneDrive is not connected yet." }, { status: 409 });
    }

    const expiresAt = new Date(token.expires_at).getTime();
    if (Number.isNaN(expiresAt) || expiresAt < Date.now() + 60_000) {
      if (!token.refresh_token) {
        return NextResponse.json({ error: "OneDrive connection expired. Please reconnect." }, { status: 409 });
      }
      token = await refreshAccessToken(token.refresh_token);
      await setOneDriveTokenSet(token);
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

    const display = getSubmissionDisplay({ submission: workspaceCase, decryptedFiling });
    const item = mapSubmissionToItem({ submission: workspaceCase, decryptedFiling });

    const generatedAtIso = new Date().toISOString();
    const buffer = await buildSubmissionDocxBuffer({
      submission: workspaceCase,
      display,
      item,
      generatedAtIso,
    });

    const filename = buildExportDocxFilename(display);
    const fallback = asciiFallbackExportFilename(display);
    const dest = getExportDestinationForStage(workspaceCase.status);
    const root = safeExportName(dest.rootFolderName || "Secure Desk Exports", { maxLen: 60 });
    const folder = safeExportName(dest.folderName || "DOCX", { maxLen: 60 });
    const finalName = filename || fallback;
    const path = `${encodeURIComponent(root)}/${encodeURIComponent(folder)}/${encodeURIComponent(finalName)}`;

    await putDocxToOneDrive({ accessToken: token.access_token, path, bytes: new Uint8Array(buffer) });

    try {
      await logSubmissionAudit({
        submissionId,
        adminUid: admin.uid,
        adminEmail: admin.adminEmail,
        action: "export_docx",
        details: { destination: "oneDrive", filename },
      });
    } catch {
      /* ignore */
    }

    return NextResponse.json({ ok: true, message: "Uploaded to OneDrive.", path }, { status: 200 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "OneDrive upload failed.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

