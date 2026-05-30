import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import type { CaseStatus, SubmissionAttachment } from "@/app/_lib/caseWorkspaceModel";
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
  buildSubmissionFolderName,
} from "@/app/_lib/server/buildSubmissionDocx";
import { loadWorkspaceCaseForSubmission } from "@/app/_lib/server/submissionCaseAccess";
import { getSupabaseAdmin } from "@/app/_lib/server/supabaseAdmin";
import { getValidWorkspaceAccessToken } from "@/app/_lib/server/workspaceOneDriveToken";
import {
  graphEnsureFolder,
  graphListFolderChildren,
  graphMoveItemToFolder,
  graphUploadFile,
} from "@/app/_lib/server/workspaceOneDriveGraph";

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

  const display = getSubmissionDisplay({ submission: workspaceCase, decryptedFiling });
  const item = mapSubmissionToItem({ submission: workspaceCase, decryptedFiling });

  // Use the stored DOCX filename so we always overwrite the same file.
  // Recomputing with buildExportDocxFilename would produce a different name if
  // the title or date changed, creating a second file instead of updating the first.
  const docxFilename =
    workspaceCase.onedriveDocxFilename ||
    buildExportDocxFilename(display) ||
    asciiFallbackExportFilename(display);

  const folderPath = buildSubmissionFolderPath(args.status, args.folderName);

  const buffer = await buildSubmissionDocxBuffer({
    submission: workspaceCase,
    display,
    item,
    generatedAtIso: new Date().toISOString(),
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
  const folderName = buildSubmissionFolderName(display);
  const folderPath = buildSubmissionFolderPath(workspaceCase.status, folderName);
  const folder = await graphEnsureFolder({ accessToken, folderPath });

  // ── DOCX (metadata summary) ──────────────────────────────────────────────────
  const docxFilename = buildExportDocxFilename(display) || asciiFallbackExportFilename(display);
  const buffer = await buildSubmissionDocxBuffer({
    submission: workspaceCase,
    display,
    item,
    generatedAtIso: new Date().toISOString(),
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

  try {
    await refreshDocxInFolder({
      accessToken,
      submissionId,
      status: workspaceCase.status,
      folderName: onedriveFilename,
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

    const folderName = buildSubmissionFolderName(display);
    const folderPath = buildSubmissionFolderPath(toStatus, folderName);
    const folder = await graphEnsureFolder({ accessToken, folderPath });

    const docxFilename = buildExportDocxFilename(display) || asciiFallbackExportFilename(display);
    const buffer = await buildSubmissionDocxBuffer({
      submission: workspaceCase,
      display,
      item,
      generatedAtIso: new Date().toISOString(),
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

  // Existing item (subfolder or legacy DOCX file) — move to new stage folder.
  // Graph API PATCH works identically for files and folders; moving a folder
  // carries all its contents (DOCX + attachments) automatically.
  const itemName = onedriveFilename ?? `${submissionId.slice(-6)}`;
  const newFolderPath = buildStageFolderPath(toStatus);

  const moved = await graphMoveItemToFolder({
    accessToken,
    itemId: onedriveItemId,
    newFolderPath,
    filename: itemName,
  });

  await getAdminFirestore()
    .collection("submissions")
    .doc(submissionId)
    .update({
      onedriveItemId: moved.id,
      onedriveWebUrl: moved.webUrl ?? null,
      onedriveFilename: moved.name,
      onedriveLastSyncedAt: FieldValue.serverTimestamp(),
    });

  // Regenerate the DOCX with current data at the new location.
  try {
    await refreshDocxInFolder({
      accessToken,
      submissionId,
      status: toStatus,
      folderName: moved.name,
    });
  } catch { /* non-fatal */ }

  return { ok: true, action: "moved", webUrl: moved.webUrl };
}

/**
 * Pull sync: read all stage folders in OneDrive and update Firestore stages
 * where the file location disagrees with the stored `caseStatus`.
 *
 * This implements the bidirectional direction: OneDrive → Secure Desk.
 *
 * Strategy:
 *  1. List children of every stage folder.
 *  2. Build a map of { onedriveItemId → stageFolderKey } from the results.
 *  3. Query Firestore for all submissions that have a `onedriveItemId`.
 *  4. For each, if the OneDrive folder's stage differs from Firestore's stage → update.
 *
 * Returns a summary of changes made.
 */
export async function pullSyncFromOneDrive(): Promise<{
  ok: boolean;
  checked: number;
  updated: number;
  errors: string[];
}> {
  if (!isOneDriveEnabled()) {
    return { ok: false, checked: 0, updated: 0, errors: ["OneDrive integration is not enabled."] };
  }

  const accessToken = await getValidWorkspaceAccessToken();
  if (!accessToken) {
    return { ok: false, checked: 0, updated: 0, errors: ["OneDrive is not connected."] };
  }

  const cfg = getWorkspaceConfig().integrations.oneDrive;
  if (!cfg?.stageFolderMap) {
    return { ok: false, checked: 0, updated: 0, errors: ["No stageFolderMap configured."] };
  }

  const rootFolder = safeExportName(cfg.rootFolderName, { maxLen: 128 });
  const errors: string[] = [];

  // Step 1: list all stage folders, build two lookup maps.
  const itemIdToStatus = new Map<string, CaseStatus>();
  // Normalized filename → list of matches (may have >1 if names collide across folders).
  const normalNameToItems = new Map<string, Array<{ itemId: string; status: CaseStatus }>>();

  for (const [status, folderName] of Object.entries(cfg.stageFolderMap) as [CaseStatus, string][]) {
    const safeName = safeExportName(folderName, { maxLen: 60 });
    const folderPath = `${rootFolder}/${safeName}`;
    try {
      const children = await graphListFolderChildren({ accessToken, folderPath });
      for (const child of children) {
        itemIdToStatus.set(child.id, status);

        // Build normalized-filename fallback map.
        // This allows matching files that were moved or copied in OneDrive
        // even when the stored onedriveItemId no longer matches (e.g. a copy
        // creates a new ID, but the filename is preserved).
        const norm = stripDatePrefix(child.name);
        if (norm) {
          const bucket = normalNameToItems.get(norm) ?? [];
          bucket.push({ itemId: child.id, status });
          normalNameToItems.set(norm, bucket);
        }
      }
    } catch (e) {
      errors.push(`Could not read folder "${folderPath}": ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (itemIdToStatus.size === 0 && errors.length > 0) {
    return { ok: false, checked: 0, updated: 0, errors };
  }

  // Step 2: find all Firestore submissions that have any OneDrive metadata.
  const db = getAdminFirestore();

  const [idSnap, nameSnap] = await Promise.all([
    db.collection("submissions")
      .where("onedriveItemId", "!=", null)
      .select("onedriveItemId", "onedriveFilename", "caseStatus", "processingStatus")
      .get(),
    db.collection("submissions")
      .where("onedriveFilename", "!=", null)
      .select("onedriveItemId", "onedriveFilename", "caseStatus", "processingStatus")
      .get(),
  ]);

  // Merge and deduplicate by document ID.
  const docMap = new Map<string, (typeof idSnap.docs)[number]>();
  for (const doc of [...idSnap.docs, ...nameSnap.docs]) {
    docMap.set(doc.id, doc);
  }

  let checked = 0;
  let updated = 0;

  for (const doc of docMap.values()) {
    const data = doc.data();
    const storedItemId = typeof data.onedriveItemId === "string" ? data.onedriveItemId : null;
    const storedFilename = typeof data.onedriveFilename === "string" ? data.onedriveFilename : null;

    let matchedStatus: CaseStatus | undefined;
    let matchedItemId: string | undefined;

    // Primary: item-ID match (fastest, most reliable).
    if (storedItemId) {
      const s = itemIdToStatus.get(storedItemId);
      if (s) {
        matchedStatus = s;
        matchedItemId = storedItemId;
      }
    }

    // Fallback: filename match for copies or re-uploads (new ID, same name).
    // Only used when ID-match failed. Skipped if multiple files share the same
    // normalized name (ambiguous — could be two separate reports).
    if (!matchedStatus && storedFilename) {
      const norm = stripDatePrefix(storedFilename);
      if (norm) {
        const candidates = normalNameToItems.get(norm);
        if (candidates?.length === 1) {
          matchedStatus = candidates[0].status;
          matchedItemId = candidates[0].itemId;
        }
      }
    }

    if (!matchedStatus) {
      // Item not found in any stage folder.
      //
      // Only clear tracking when ALL stage folders were scanned without errors.
      // If any folder scan failed (errors.length > 0), the item might be in a
      // folder we couldn't read — don't clear in that case.
      //
      // We do NOT verify by Graph item ID because deleted items go to the OneDrive
      // Recycle Bin first and remain accessible by ID (200 OK, not 404). The only
      // reliable signal is absence from the live stage folders we just scanned.
      if (storedItemId && errors.length === 0) {
        try {
          await db.collection("submissions").doc(doc.id).update({
            onedriveItemId: null,
            onedriveFilename: null,
            onedriveDocxFilename: null,
            onedriveWebUrl: null,
            onedrivePullSyncedAt: FieldValue.serverTimestamp(),
          });
          checked++;
          updated++;
        } catch { /* non-fatal */ }
      }
      continue;
    }

    const currentStatus = (typeof data.caseStatus === "string" ? data.caseStatus : null) as CaseStatus | null;
    const stageChanged = currentStatus !== matchedStatus;
    const idChanged = storedItemId !== matchedItemId;

    if (!stageChanged && !idChanged) continue; // Already in sync.

    checked++;

    try {
      const patch: Record<string, unknown> = {
        updatedAt: FieldValue.serverTimestamp(),
        onedrivePullSyncedAt: FieldValue.serverTimestamp(),
      };
      if (stageChanged) {
        patch.caseStatus = matchedStatus;
        patch.processingStatus = matchedStatus;
      }
      // Re-link onedriveItemId when the file was copied/re-uploaded (new ID).
      if (idChanged && matchedItemId) {
        patch.onedriveItemId = matchedItemId;
      }
      await db.collection("submissions").doc(doc.id).update(patch);
      updated++;

      // Regenerate the DOCX with current data so the file in OneDrive reflects
      // the latest submission content after the stage change.
      if (stageChanged && storedFilename && matchedStatus) {
        try {
          await refreshDocxInFolder({
            accessToken,
            submissionId: doc.id,
            status: matchedStatus,
            folderName: storedFilename,
          });
        } catch { /* non-fatal — DOCX refresh failure must not block sync */ }
      }
    } catch (e) {
      errors.push(
        `Could not update submission ${doc.id}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  return { ok: true, checked, updated, errors };
}

/**
 * Strip the leading date prefix ("YYYY-MM-DD_") from a filename and lowercase it.
 * This gives a stable normalized key for matching across different export dates.
 * e.g. "2024-01-15_CASE-XYZ_Title.docx" → "case-xyz_title.docx"
 */
function stripDatePrefix(filename: string): string {
  return filename.replace(/^\d{4}-\d{2}-\d{2}_/, "").toLowerCase();
}
