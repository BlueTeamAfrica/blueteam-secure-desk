import { NextRequest, NextResponse } from "next/server";
import { extractDecryptedFiling } from "@/app/_lib/decryptedSubmissionReadout";
import { getSubmissionDisplay } from "@/app/_lib/items/getSubmissionDisplay";
import { mapSubmissionToItem } from "@/app/_lib/items/mapSubmissionToItem";
import { mayShowDecryptUi } from "@/app/_lib/rbac";
import { requireFirebaseUser } from "@/app/_lib/server/userApiAuth";
import { decryptEncryptedPayloadFieldToJson } from "@/app/_lib/server/decryptEncryptedPayload";
import { getPersonalOneDriveToken, setPersonalOneDriveToken } from "@/app/_lib/server/personalOneDriveTokenStore";
import { refreshAccessToken } from "@/app/_lib/server/microsoftDelegatedOAuth";
import { logSubmissionAudit } from "@/app/_lib/server/logSubmissionAudit";
import { buildSubmissionDocxBuffer, sanitizeDocxFilenameSegment } from "@/app/_lib/server/buildSubmissionDocx";
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

function yyyyMmDd(): string {
  return new Date().toISOString().slice(0, 10);
}

function buildOneDriveDocxName(displayTitle: string): string {
  const safeTitle = sanitizeDocxFilenameSegment(displayTitle || "Report", 80).replace(/-/g, " ");
  return `${yyyyMmDd()} - ${safeTitle}.docx`;
}

async function putDocxToOneDrive(args: { accessToken: string; filename: string; bytes: Uint8Array }) {
  const folder = "Secure Desk Exports";
  const path = `${encodeURIComponent(folder)}/${encodeURIComponent(args.filename)}`;
  const url = `https://graph.microsoft.com/v1.0/me/drive/root:/${path}:/content`;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${args.accessToken}`,
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    },
    body: Buffer.from(args.bytes),
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    const msg = (() => {
      if (!json || typeof json !== "object") return "OneDrive upload failed.";
      if (!("error" in json)) return "OneDrive upload failed.";
      const err = (json as { error?: unknown }).error;
      if (!err || typeof err !== "object") return "OneDrive upload failed.";
      const message = (err as { message?: unknown }).message;
      return typeof message === "string" ? message : "OneDrive upload failed.";
    })();
    throw new Error(msg);
  }
  const webUrl =
    typeof json === "object" && json !== null && "webUrl" in json && typeof (json as { webUrl?: unknown }).webUrl === "string"
      ? (json as { webUrl: string }).webUrl
      : null;
  return { webUrl };
}

export async function POST(request: NextRequest, context: RouteParams) {
  try {
    const auth = await requireFirebaseUser(request);
    if (!auth.ok) return auth.response;
    const { user } = auth;

    const role = await fetchWorkspaceRole(user.uid);
    if (!role) return jsonForbidden();

    const { id } = await context.params;
    if (!id?.trim()) return NextResponse.json({ error: "Missing submission id" }, { status: 400 });

    const workspaceCase = await loadWorkspaceCaseForSubmission(id);
    if (!workspaceCase) return jsonNotFound();

    // Reuse existing context helper (needs a {uid, adminEmail} shape).
    const ctx = await workspaceUserContextFromAdmin({ uid: user.uid, adminEmail: user.email });
    if (!mayExportSubmissionDocx({ role, workspaceCase, ctx })) {
      return NextResponse.json({ error: "You don't have permission to export this report." }, { status: 403 });
    }

    const stored = await getPersonalOneDriveToken(user.uid);
    if (!stored) {
      return NextResponse.json({ error: "OneDrive is not connected yet." }, { status: 409 });
    }

    let accessToken = stored.accessToken;
    const expiresAt = new Date(stored.expiresAt).getTime();
    const expiring = Number.isNaN(expiresAt) || expiresAt < Date.now() + 60_000;
    if (expiring) {
      if (!stored.refreshToken) {
        return NextResponse.json({ error: "OneDrive connection expired. Please reconnect." }, { status: 409 });
      }
      const refreshed = await refreshAccessToken(stored.refreshToken);
      const nextExpiresAt = new Date(Date.now() + Math.max(30, refreshed.expiresIn ?? 3600) * 1000).toISOString();
      accessToken = refreshed.accessToken;
      await setPersonalOneDriveToken(user.uid, {
        ...stored,
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken ?? stored.refreshToken,
        expiresAt: nextExpiresAt,
      });
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

    const buffer = await buildSubmissionDocxBuffer({
      submission: workspaceCase,
      display,
      item,
      generatedAtIso: new Date().toISOString(),
    });

    const filename = buildOneDriveDocxName(display.displayTitle || display.displayRef || "Report");
    const uploaded = await putDocxToOneDrive({
      accessToken,
      filename,
      bytes: new Uint8Array(buffer),
    });

    try {
      await logSubmissionAudit({
        submissionId: id,
        adminUid: user.uid,
        adminEmail: user.email,
        action: "export_docx",
        details: { destination: "oneDrive", filename },
      });
    } catch {
      /* ignore */
    }

    return NextResponse.json({ ok: true, webUrl: uploaded.webUrl ?? null }, { status: 200 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "OneDrive export failed.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

