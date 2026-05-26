import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import type { CaseStatus } from "@/app/_lib/caseWorkspaceModel";
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
import { getValidWorkspaceAccessToken } from "@/app/_lib/server/workspaceOneDriveToken";
import {
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

/** Build the full drive path for a file: folderPath/filename */
function buildFileDrivePath(status: CaseStatus, filename: string): string {
  return `${buildStageFolderPath(status)}/${filename}`;
}

// ─── Public API ─────────────────────────────────────────────────────────────

export type OneDriveSyncResult =
  | { ok: true; action: "uploaded" | "moved" | "skipped"; webUrl: string | null }
  | { ok: false; reason: string };

/**
 * Push a submission DOCX to OneDrive.
 *
 * - If the submission already has an `onedriveItemId`, skips (already synced).
 *   Pass `force: true` to re-upload and overwrite.
 * - If OneDrive is not connected or not enabled, returns `{ ok: false }`.
 * - Decrypts the payload server-side (no UI permission gate needed here —
 *   the DOCX is intended for the editorial team's shared drive).
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

  // Decrypt payload server-side — the editorial team is the audience for this export.
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

  const buffer = await buildSubmissionDocxBuffer({
    submission: workspaceCase,
    display,
    item,
    generatedAtIso: new Date().toISOString(),
  });

  const filename = buildExportDocxFilename(display) || asciiFallbackExportFilename(display);
  const drivePath = buildFileDrivePath(workspaceCase.status, filename);

  const uploaded = await graphUploadFile({
    accessToken,
    drivePath,
    bytes: new Uint8Array(buffer),
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });

  // Persist OneDrive metadata back to Firestore.
  await getAdminFirestore()
    .collection("submissions")
    .doc(submissionId)
    .update({
      onedriveItemId: uploaded.id,
      onedriveWebUrl: uploaded.webUrl ?? null,
      onedriveFilename: uploaded.name,
      onedriveLastSyncedAt: FieldValue.serverTimestamp(),
    });

  return { ok: true, action: "uploaded", webUrl: uploaded.webUrl };
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

  // No existing OneDrive item — upload fresh to the new stage folder.
  if (!onedriveItemId) {
    // Build the submission in its new stage context.
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
    const buffer = await buildSubmissionDocxBuffer({
      submission: workspaceCase,
      display,
      item,
      generatedAtIso: new Date().toISOString(),
    });

    const filename = buildExportDocxFilename(display) || asciiFallbackExportFilename(display);
    const drivePath = buildFileDrivePath(toStatus, filename);

    const uploaded = await graphUploadFile({
      accessToken,
      drivePath,
      bytes: new Uint8Array(buffer),
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });

    await getAdminFirestore()
      .collection("submissions")
      .doc(submissionId)
      .update({
        onedriveItemId: uploaded.id,
        onedriveWebUrl: uploaded.webUrl ?? null,
        onedriveFilename: uploaded.name,
        onedriveLastSyncedAt: FieldValue.serverTimestamp(),
      });

    return { ok: true, action: "uploaded", webUrl: uploaded.webUrl };
  }

  // Existing item — move it to the new stage folder.
  const filename = onedriveFilename ?? `${submissionId.slice(-6)}-export.docx`;
  const newFolderPath = buildStageFolderPath(toStatus);

  const moved = await graphMoveItemToFolder({
    accessToken,
    itemId: onedriveItemId,
    newFolderPath,
    filename,
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

  // Step 1: list all stage folders and build itemId → CaseStatus map.
  const itemIdToStatus = new Map<string, CaseStatus>();

  for (const [status, folderName] of Object.entries(cfg.stageFolderMap) as [CaseStatus, string][]) {
    const safeName = safeExportName(folderName, { maxLen: 60 });
    const folderPath = `${rootFolder}/${safeName}`;
    try {
      const children = await graphListFolderChildren({ accessToken, folderPath });
      for (const child of children) {
        itemIdToStatus.set(child.id, status);
      }
    } catch (e) {
      errors.push(`Could not read folder "${folderPath}": ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (itemIdToStatus.size === 0 && errors.length > 0) {
    return { ok: false, checked: 0, updated: 0, errors };
  }

  // Step 2: find all Firestore submissions with a onedriveItemId.
  const db = getAdminFirestore();
  const snap = await db
    .collection("submissions")
    .where("onedriveItemId", "!=", null)
    .select("onedriveItemId", "caseStatus", "processingStatus")
    .get();

  let checked = 0;
  let updated = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    const itemId = typeof data.onedriveItemId === "string" ? data.onedriveItemId : null;
    if (!itemId) continue;

    const oneDriveStatus = itemIdToStatus.get(itemId);
    if (!oneDriveStatus) continue; // File not found in any stage folder — maybe deleted or still uploading.

    // Determine current Firestore stage.
    const currentStatus = (typeof data.caseStatus === "string" ? data.caseStatus : null) as CaseStatus | null;
    if (currentStatus === oneDriveStatus) continue; // Already in sync.

    checked++;

    try {
      await db.collection("submissions").doc(doc.id).update({
        caseStatus: oneDriveStatus,
        processingStatus: oneDriveStatus,
        updatedAt: FieldValue.serverTimestamp(),
        onedrivePullSyncedAt: FieldValue.serverTimestamp(),
      });
      updated++;
    } catch (e) {
      errors.push(
        `Could not update submission ${doc.id}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  return { ok: true, checked, updated, errors };
}
