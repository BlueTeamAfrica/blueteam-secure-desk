import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import type { CaseStatus, SubmissionAttachment, WorkspaceCase } from "@/app/_lib/caseWorkspaceModel";
import { extractDecryptedFiling } from "@/app/_lib/decryptedSubmissionReadout";
import { getSubmissionDisplay } from "@/app/_lib/items/getSubmissionDisplay";
import { mapSubmissionToItem } from "@/app/_lib/items/mapSubmissionToItem";
import { safeExportName } from "@/app/_lib/integrations/safeExportName";
import { getWorkspaceConfig } from "@/app/_lib/org/getWorkspaceConfig";
import { decryptEncryptedPayloadFieldToJson } from "@/app/_lib/server/decryptEncryptedPayload";
import { getAdminFirestore } from "@/app/_lib/server/firebaseAdmin";
import {
  asciiFallbackExportFilename,
  buildExportDocxFilename,
  buildSubmissionDocxBuffer,
} from "@/app/_lib/server/buildSubmissionDocx";
import { loadWorkspaceCaseForSubmission } from "@/app/_lib/server/submissionCaseAccess";
import { getSupabaseAdmin } from "@/app/_lib/server/supabaseAdmin";
import { getValidWorkspaceAccessToken } from "@/app/_lib/server/workspaceOneDriveToken";
import {
  type GraphFileItem,
  graphEnsureFolder,
  graphUploadFile,
} from "@/app/_lib/server/workspaceOneDriveGraph";

// ─── Workspace locale for DOCX generation ───────────────────────────────────
// Server-side DOCX builds have no requesting-user browser context, so we use
// the workspace default locale. For factsd this is "ar"; demoNgo stays "en".
const WORKSPACE_DOCX_LOCALE = (getWorkspaceConfig().locale || "en") as "en" | "ar";

// ─── Helpers ────────────────────────────────────────────────────────────────

/** True when the workspace OneDrive integration is configured and enabled. */
function isOneDriveEnabled(): boolean {
  const cfg = getWorkspaceConfig().integrations;
  return cfg.exportProvider === "oneDrive" || (cfg.oneDrive?.enabled === true);
}

/**
 * Build the drive-relative folder path for a given stage.
 * e.g. "SecureDesk-Test/raw"
 *
 * Reads directly from oneDrive.rootFolderName + oneDrive.stageFolderMap so
 * the path is always correct regardless of what exportProvider is set to.
 * (exportProvider controls the UI export button; this sync runs independently.)
 */
function buildStageFolderPath(status: CaseStatus): string {
  const cfg = getWorkspaceConfig().integrations.oneDrive;
  if (!cfg) throw new Error("OneDrive config (integrations.oneDrive) is not defined in workspace config.");
  const root = safeExportName(cfg.rootFolderName, { maxLen: 128 });
  const stageName = cfg.stageFolderMap[status];
  const folder = safeExportName(stageName ?? status, { maxLen: 60 });
  return `${root}/${folder}`;
}

/**
 * Build the drive path for a submission's subfolder.
 * e.g. "SecureDesk-Test/raw/CASE-WCVXC"
 *
 * All files for a submission (DOCX + attachments) live inside this subfolder.
 * Moving a stage = moving this subfolder, which carries all contents with it.
 */
function buildSubmissionFolderPath(status: CaseStatus, folderName: string): string {
  const safeName = safeExportName(folderName, { maxLen: 60 });
  return `${buildStageFolderPath(status)}/${safeName}`;
}

/**
 * Derive the OneDrive subfolder name for a submission.
 *
 * Priority:
 *  1. Decrypted report title (server-side decrypt, most descriptive)
 *  2. Case reference code (always available without decryption)
 *  3. `case-{last6chars}` fallback
 */
async function buildFolderName(
  submissionId: string,
  display: ReturnType<typeof getSubmissionDisplay>,
  encryptedPayload?: string | null,
): Promise<string> {
  if (encryptedPayload?.trim()) {
    try {
      const json = decryptEncryptedPayloadFieldToJson(encryptedPayload);
      const filing = extractDecryptedFiling(json);
      const title = filing?.title?.trim();
      if (title) return safeExportName(title, { maxLen: 60 });
    } catch { /* fall through to ref fallback */ }
  }
  const ref = display.displayRef?.trim();
  return ref && ref.length > 0 ? ref : `case-${submissionId.slice(-6)}`;
}

/**
 * Download attachment bytes from Supabase Storage.
 * Returns null if the download fails (e.g. file deleted, Supabase unavailable).
 */
async function downloadAttachmentFromSupabase(storagePath: string): Promise<Uint8Array | null> {
  try {
    const { client, bucket } = getSupabaseAdmin();
    const { data, error } = await client.storage.from(bucket).download(storagePath);
    if (error || !data) return null;
    const ab = await data.arrayBuffer();
    return new Uint8Array(ab);
  } catch {
    return null;
  }
}

/**
 * Upload all attachments for a submission into an existing OneDrive subfolder.
 * Skips attachments that fail to download or have no storagePath.
 * Returns the count of successfully uploaded attachments.
 */
async function uploadAttachmentsToFolder(args: {
  accessToken: string;
  folderPath: string;
  attachments: SubmissionAttachment[];
}): Promise<number> {
  let uploaded = 0;
  for (const att of args.attachments) {
    if (!att.storagePath?.trim()) continue;
    // Use original filename; sanitize for OneDrive path safety only.
    const safeName = safeExportName(att.name || att.id || "attachment", { maxLen: 120 });
    const filePath = `${args.folderPath}/${safeName}`;
    const bytes = await downloadAttachmentFromSupabase(att.storagePath);
    if (!bytes) continue; // download failed — skip silently
    try {
      await graphUploadFile({
        accessToken: args.accessToken,
        drivePath: filePath,
        bytes,
        mimeType: att.mimeType ?? "application/octet-stream",
      });
      uploaded++;
    } catch {
      // Individual attachment upload failure must not block the rest.
    }
  }
  return uploaded;
}

/**
 * Create a fresh stage subfolder for a submission and populate it with:
 * 1. A fresh metadata DOCX reflecting currentStatus
 * 2. The reporter's DOCX attachment (if one exists in the payload or attachments)
 *
 * Returns the created folder's OneDrive item or null on failure.
 */
async function createStageFolder(args: {
  accessToken: string;
  submissionId: string;
  workspaceCase: WorkspaceCase;
  decryptedFiling: ReturnType<typeof extractDecryptedFiling> | undefined;
  currentStatus: CaseStatus;
  folderName: string;
  actor: { uid: string; role: string };
  actionLabel: string;
}): Promise<{ folder: GraphFileItem; docxFilename: string } | null> {
  const { accessToken, submissionId, workspaceCase, decryptedFiling, currentStatus, folderName, actor, actionLabel } = args;

  const folderPath = buildSubmissionFolderPath(currentStatus, folderName);
  const folder = await graphEnsureFolder({ accessToken, folderPath });

  const display = getSubmissionDisplay({ submission: { ...workspaceCase, status: currentStatus }, decryptedFiling });
  const item = mapSubmissionToItem({ submission: { ...workspaceCase, status: currentStatus }, decryptedFiling });

  // Upload metadata DOCX
  const docxFilename = workspaceCase.onedriveDocxFilename
    || buildExportDocxFilename(display)
    || asciiFallbackExportFilename(display);

  const buffer = await buildSubmissionDocxBuffer({
    submission: { ...workspaceCase, status: currentStatus },
    display,
    item,
    generatedAtIso: new Date().toISOString(),
    locale: WORKSPACE_DOCX_LOCALE,
    lastChangedBy: { uid: actor.uid, role: actor.role, action: actionLabel },
  });

  await graphUploadFile({
    accessToken,
    drivePath: `${folderPath}/${docxFilename}`,
    bytes: new Uint8Array(buffer),
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });

  // Upload DOCX attachments only — PDFs and other files stay in the incoming/ folder.
  const allAttachments = (decryptedFiling?.attachments?.length ?? 0) > 0
    ? (decryptedFiling?.attachments ?? [])
    : (workspaceCase.attachments ?? []);

  const docxAttachments = allAttachments.filter(
    (a) =>
      a.mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      a.name?.toLowerCase().endsWith(".docx"),
  );

  if (docxAttachments.length > 0) {
    await uploadAttachmentsToFolder({
      accessToken,
      folderPath,
      attachments: docxAttachments,
    });
  }

  // Suppress unused variable warning — submissionId reserved for future logging.
  void submissionId;

  return { folder, docxFilename };
}

/** Build the full drive path for a file: folderPath/filename */
function buildFileDrivePath(status: CaseStatus, filename: string): string {
  return `${buildStageFolderPath(status)}/${filename}`;
}

/**
 * Regenerate and re-upload the metadata DOCX inside an existing submission subfolder.
 *
 * Called after every move (dashboard→OneDrive direction) and after every
 * stage change detected by pull-sync (OneDrive→dashboard direction) so the
 * DOCX always reflects current submission data.
 *
 * Non-fatal: any failure is swallowed so it never blocks the move/sync.
 * Only applies to subfolder-style exports (folderName without .docx extension).
 */
async function refreshDocxInFolder(args: {
  accessToken: string;
  submissionId: string;
  status: CaseStatus;
  folderName: string;
  lastChangedBy?: { uid: string; role: string; action: string };
}): Promise<void> {
  // Legacy DOCX-style exports (onedriveFilename ends with .docx) have no subfolder.
  if (args.folderName.toLowerCase().endsWith(".docx")) return;

  const workspaceCase = await loadWorkspaceCaseForSubmission(args.submissionId);
  if (!workspaceCase) return;

  let decryptedFiling: ReturnType<typeof extractDecryptedFiling> | undefined;
  const enc = workspaceCase.encryptedPayload?.trim();
  if (enc) {
    try {
      const json = decryptEncryptedPayloadFieldToJson(enc);
      decryptedFiling = extractDecryptedFiling(json);
    } catch { /* skip */ }
  }

  // Override status with the caller-supplied currentStatus so the DOCX reflects
  // the new stage, not the stale Firestore value at the time of this call.
  const caseWithCurrentStatus = { ...workspaceCase, status: args.status };
  const display = getSubmissionDisplay({ submission: caseWithCurrentStatus, decryptedFiling });
  const item = mapSubmissionToItem({ submission: caseWithCurrentStatus, decryptedFiling });

  // Use the stored DOCX filename so we always overwrite the same file.
  // Recomputing with buildExportDocxFilename would produce a different name if
  // the title or date changed, creating a second file instead of updating the first.
  const docxFilename =
    workspaceCase.onedriveDocxFilename ||
    buildExportDocxFilename(display) ||
    asciiFallbackExportFilename(display);

  const folderPath = buildSubmissionFolderPath(args.status, args.folderName);

  const buffer = await buildSubmissionDocxBuffer({
    submission: caseWithCurrentStatus,
    display,
    item,
    generatedAtIso: new Date().toISOString(),
    locale: WORKSPACE_DOCX_LOCALE,
    lastChangedBy: args.lastChangedBy,
  });

  await graphUploadFile({
    accessToken: args.accessToken,
    drivePath: `${folderPath}/${docxFilename}`,
    bytes: new Uint8Array(buffer),
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });

  await getAdminFirestore()
    .collection("submissions")
    .doc(args.submissionId)
    .update({ onedriveLastSyncedAt: FieldValue.serverTimestamp() });
}

// ─── Public API ─────────────────────────────────────────────────────────────

export type OneDriveSyncResult =
  | { ok: true; action: "uploaded" | "moved" | "skipped"; webUrl: string | null }
  | { ok: false; reason: string };

/**
 * Push a submission to OneDrive: creates a subfolder named by case reference,
 * uploads the metadata DOCX (named with the report title) and all attachments
 * (with their original filenames) into that subfolder.
 *
 * Folder structure:
 *   {root}/{stage}/{CASE-REF}/
 *     {Title}.docx          ← metadata summary
 *     original-name.jpg     ← reporter attachments as-is
 *     audio-clip.mp3
 *
 * - If already synced (onedriveItemId set), skips unless `force: true`.
 * - Decrypts the payload server-side (no UI permission gate needed here).
 */
export async function pushSubmissionToOneDrive(
  submissionId: string,
  opts: { force?: boolean } = {},
): Promise<OneDriveSyncResult> {
  if (!isOneDriveEnabled()) {
    return { ok: false, reason: "OneDrive integration is not enabled for this workspace." };
  }

  const accessToken = await getValidWorkspaceAccessToken();
  if (!accessToken) {
    return { ok: false, reason: "OneDrive is not connected. Connect it in workspace settings." };
  }

  const workspaceCase = await loadWorkspaceCaseForSubmission(submissionId);
  if (!workspaceCase) {
    return { ok: false, reason: "Submission not found." };
  }

  // Skip if already synced (unless forced).
  if (workspaceCase.onedriveItemId && !opts.force) {
    return { ok: true, action: "skipped", webUrl: workspaceCase.onedriveWebUrl };
  }

  // Decrypt payload — needed for title, body, and attachments stored in the payload.
  let decryptedFiling: ReturnType<typeof extractDecryptedFiling> | undefined;
  const enc = workspaceCase.encryptedPayload?.trim();
  if (enc) {
    try {
      const json = decryptEncryptedPayloadFieldToJson(enc);
      decryptedFiling = extractDecryptedFiling(json);
    } catch {
      decryptedFiling = undefined;
    }
  }

  const display = getSubmissionDisplay({ submission: workspaceCase, decryptedFiling });
  const item = mapSubmissionToItem({ submission: workspaceCase, decryptedFiling });

  // ── Subfolder ────────────────────────────────────────────────────────────────
  const folderName = await buildFolderName(submissionId, display, workspaceCase.encryptedPayload);
  const folderPath = buildSubmissionFolderPath(workspaceCase.status, folderName);
  const folder = await graphEnsureFolder({ accessToken, folderPath });

  // ── DOCX (metadata summary) ──────────────────────────────────────────────────
  const docxFilename = buildExportDocxFilename(display) || asciiFallbackExportFilename(display);
  const buffer = await buildSubmissionDocxBuffer({
    submission: workspaceCase,
    display,
    item,
    generatedAtIso: new Date().toISOString(),
    locale: WORKSPACE_DOCX_LOCALE,
  });
  await graphUploadFile({
    accessToken,
    drivePath: `${folderPath}/${docxFilename}`,
    bytes: new Uint8Array(buffer),
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });

  // ── Attachments ──────────────────────────────────────────────────────────────
  // Prefer decrypted filing attachments (most complete); fall back to Firestore-level.
  const attachments =
    (decryptedFiling?.attachments?.length ?? 0) > 0
      ? (decryptedFiling?.attachments ?? [])
      : (workspaceCase.attachments ?? []);

  await uploadAttachmentsToFolder({ accessToken, folderPath, attachments });

  // ── Persist subfolder ID + DOCX filename to Firestore ───────────────────────
  await getAdminFirestore()
    .collection("submissions")
    .doc(submissionId)
    .update({
      onedriveItemId: folder.id,
      onedriveWebUrl: folder.webUrl ?? null,
      onedriveFilename: folderName,
      onedriveDocxFilename: docxFilename,   // exact filename, read back on every refresh
      onedriveLastSyncedAt: FieldValue.serverTimestamp(),
    });

  return { ok: true, action: "uploaded", webUrl: folder.webUrl };
}

/**
 * Refresh the metadata DOCX for a submission that is already on OneDrive.
 *
 * Regenerates the DOCX with current submission data and overwrites it in the
 * existing subfolder. Attachments are not touched (they don't change). If the
 * submission hasn't been exported yet, falls back to a full push.
 *
 * Use this when dashboard content changes (notes, priority, assignee) and
 * the editor wants the OneDrive DOCX to reflect those changes without a
 * stage change or full re-export.
 */
export async function refreshSubmissionDocxInOneDrive(
  submissionId: string,
  lastChangedBy?: { uid: string; role: string; action: string },
): Promise<OneDriveSyncResult> {
  if (!isOneDriveEnabled()) {
    return { ok: false, reason: "OneDrive integration is not enabled for this workspace." };
  }

  const accessToken = await getValidWorkspaceAccessToken();
  if (!accessToken) {
    return { ok: false, reason: "OneDrive is not connected." };
  }

  const workspaceCase = await loadWorkspaceCaseForSubmission(submissionId);
  if (!workspaceCase) {
    return { ok: false, reason: "Submission not found." };
  }

  const { onedriveItemId, onedriveFilename } = workspaceCase;

  // No existing export — fall back to a full push.
  if (!onedriveItemId || !onedriveFilename) {
    return pushSubmissionToOneDrive(submissionId);
  }

  // If a changelog entry is provided, persist it to Firestore before refreshing
  // so buildSubmissionDocxBuffer can read it from workspaceCase.onedriveChangeLog.
  if (lastChangedBy) {
    try {
      await getAdminFirestore()
        .collection("submissions")
        .doc(submissionId)
        .update({
          onedriveChangeLog: FieldValue.arrayUnion({
            action: lastChangedBy.action,
            uid: lastChangedBy.uid,
            role: lastChangedBy.role,
            ts: new Date().toISOString(),
          }),
        });
    } catch { /* non-fatal — DOCX refresh proceeds regardless */ }
  }

  try {
    await refreshDocxInFolder({
      accessToken,
      submissionId,
      status: workspaceCase.status,
      folderName: onedriveFilename,
      lastChangedBy,
    });
    return { ok: true, action: "uploaded", webUrl: workspaceCase.onedriveWebUrl };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "DOCX refresh failed." };
  }
}

/**
 * Move a submission's OneDrive file to the folder corresponding to `toStatus`.
 *
 * - If no `onedriveItemId` exists, falls back to a fresh upload.
 * - If OneDrive is not connected or not enabled, returns `{ ok: false }`.
 */
export async function moveSubmissionToStageInOneDrive(
  submissionId: string,
  toStatus: CaseStatus,
  actor: { uid: string; role: string },
): Promise<OneDriveSyncResult> {
  if (!isOneDriveEnabled()) {
    return { ok: false, reason: "OneDrive integration is not enabled for this workspace." };
  }

  const accessToken = await getValidWorkspaceAccessToken();
  if (!accessToken) {
    return { ok: false, reason: "OneDrive is not connected." };
  }

  const workspaceCase = await loadWorkspaceCaseForSubmission(submissionId);
  if (!workspaceCase) {
    return { ok: false, reason: "Submission not found." };
  }

  const { onedriveItemId, onedriveFilename } = workspaceCase;

  // No existing OneDrive item — fresh upload: create subfolder + DOCX + attachments.
  if (!onedriveItemId) {
    let decryptedFiling: ReturnType<typeof extractDecryptedFiling> | undefined;
    const enc = workspaceCase.encryptedPayload?.trim();
    if (enc) {
      try {
        const json = decryptEncryptedPayloadFieldToJson(enc);
        decryptedFiling = extractDecryptedFiling(json);
      } catch {
        decryptedFiling = undefined;
      }
    }

    const display = getSubmissionDisplay({ submission: workspaceCase, decryptedFiling });
    const item = mapSubmissionToItem({ submission: workspaceCase, decryptedFiling });

    const folderName = await buildFolderName(submissionId, display, workspaceCase.encryptedPayload);
    const folderPath = buildSubmissionFolderPath(toStatus, folderName);
    const folder = await graphEnsureFolder({ accessToken, folderPath });

    const docxFilename = buildExportDocxFilename(display) || asciiFallbackExportFilename(display);
    const buffer = await buildSubmissionDocxBuffer({
      submission: workspaceCase,
      display,
      item,
      generatedAtIso: new Date().toISOString(),
      locale: WORKSPACE_DOCX_LOCALE,
    });
    await graphUploadFile({
      accessToken,
      drivePath: `${folderPath}/${docxFilename}`,
      bytes: new Uint8Array(buffer),
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });

    const attachments =
      (decryptedFiling?.attachments?.length ?? 0) > 0
        ? (decryptedFiling?.attachments ?? [])
        : (workspaceCase.attachments ?? []);
    await uploadAttachmentsToFolder({ accessToken, folderPath, attachments });

    await getAdminFirestore()
      .collection("submissions")
      .doc(submissionId)
      .update({
        onedriveItemId: folder.id,
        onedriveWebUrl: folder.webUrl ?? null,
        onedriveFilename: folderName,
        onedriveDocxFilename: docxFilename,
        onedriveLastSyncedAt: FieldValue.serverTimestamp(),
      });

    return { ok: true, action: "uploaded", webUrl: folder.webUrl };
  }

  // Decrypt payload for folder creation.
  let decryptedFiling: ReturnType<typeof extractDecryptedFiling> | undefined;
  const enc = workspaceCase.encryptedPayload?.trim();
  if (enc) {
    try {
      const json = decryptEncryptedPayloadFieldToJson(enc);
      decryptedFiling = extractDecryptedFiling(json);
    } catch { decryptedFiling = undefined; }
  }

  const folderName = await buildFolderName(
    submissionId,
    getSubmissionDisplay({ submission: workspaceCase, decryptedFiling }),
    workspaceCase.encryptedPayload,
  );

  const actionLabel = `moved to ${toStatus}`;

  // Create fresh folder in destination stage with metadata DOCX + reporter DOCX.
  const result = await createStageFolder({
    accessToken,
    submissionId,
    workspaceCase,
    decryptedFiling,
    currentStatus: toStatus,
    folderName,
    actor,
    actionLabel,
  });

  if (!result) {
    return { ok: false, reason: "Failed to create stage folder in OneDrive." };
  }

  // Update Firestore with new folder details.
  const changeEntry = {
    action: actionLabel,
    uid: actor.uid,
    role: actor.role,
    ts: new Date().toISOString(),
  };

  await getAdminFirestore()
    .collection("submissions")
    .doc(submissionId)
    .update({
      onedriveItemId: result.folder.id,
      onedriveWebUrl: result.folder.webUrl ?? null,
      onedriveFilename: folderName,
      onedriveDocxFilename: result.docxFilename,
      onedriveLastSyncedAt: FieldValue.serverTimestamp(),
      onedriveChangeLog: FieldValue.arrayUnion(changeEntry),
    });

  return { ok: true, action: "moved", webUrl: result.folder.webUrl };
}

