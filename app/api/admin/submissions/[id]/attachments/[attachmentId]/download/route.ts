import { NextRequest, NextResponse } from "next/server";
import { requireActiveAdmin } from "@/app/_lib/server/adminApiAuth";
import { getSupabaseAdmin } from "@/app/_lib/server/supabaseAdmin";
import { decryptEncryptedPayloadFieldToJson } from "@/app/_lib/server/decryptEncryptedPayload";
import { extractSubmissionAttachments } from "@/app/_lib/attachments/extractSubmissionAttachments";
import { logSubmissionAudit } from "@/app/_lib/server/logSubmissionAudit";
import {
  assertMayDecryptSubmission,
  jsonForbidden,
  jsonNotFound,
  loadWorkspaceCaseForSubmission,
  workspaceUserContextFromAdmin,
} from "@/app/_lib/server/submissionCaseAccess";
import { fetchWorkspaceRole } from "@/app/_lib/server/workspaceRole";

export const runtime = "nodejs";

type RouteParams = { params: Promise<{ id: string; attachmentId: string }> };

const SIGNED_URL_EXPIRY_SECONDS = 60 * 5;

export async function GET(request: NextRequest, context: RouteParams) {
  try {
    const auth = await requireActiveAdmin(request);
    if (!auth.ok) return auth.response;
    const { admin } = auth;

    const role = await fetchWorkspaceRole(admin.uid);
    if (!role) return jsonForbidden();

    const { id, attachmentId } = await context.params;
    if (!id?.trim() || !attachmentId?.trim()) {
      return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
    }

    const workspaceCase = await loadWorkspaceCaseForSubmission(id);
    if (!workspaceCase) return jsonNotFound();

    const ctx = await workspaceUserContextFromAdmin(admin);
    const denied = assertMayDecryptSubmission(role, workspaceCase, ctx);
    if (denied) return denied;

    let attachment = (workspaceCase.attachments ?? []).find((a) => a.id === attachmentId);
    if (!attachment) {
      const enc = workspaceCase.encryptedPayload?.trim();
      if (enc) {
        try {
          const decrypted = decryptEncryptedPayloadFieldToJson(enc);
          const extracted = extractSubmissionAttachments(decrypted);
          attachment = extracted.find((a) => a.id === attachmentId);
        } catch {
          attachment = undefined;
        }
      }
    }
    if (!attachment) return jsonNotFound();
    if (!attachment.storagePath?.trim()) return jsonNotFound();

    const { client, bucket } = getSupabaseAdmin();
    const { data, error } = await client.storage
      .from(bucket)
      .createSignedUrl(attachment.storagePath, SIGNED_URL_EXPIRY_SECONDS);

    if (error || !data?.signedUrl) {
      return NextResponse.json({ error: "Could not generate download URL" }, { status: 500 });
    }

    try {
      await logSubmissionAudit({
        submissionId: id,
        adminUid: admin.uid,
        adminEmail: admin.adminEmail,
        action: "download_attachment",
        details: { attachmentId, name: attachment.name ?? null },
      });
    } catch {
      /* audit failure must not block download */
    }

    return NextResponse.json(
      { signedUrl: data.signedUrl, expiresIn: SIGNED_URL_EXPIRY_SECONDS },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

