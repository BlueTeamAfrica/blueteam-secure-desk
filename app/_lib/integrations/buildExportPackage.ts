import type { CaseStatus, SubmissionAttachment, WorkspaceCase } from "@/app/_lib/caseWorkspaceModel";
import type { DecryptedFilingReadout } from "@/app/_lib/decryptedSubmissionReadout";
import { getExportDestinationForStage } from "@/app/_lib/integrations/getExportDestinationForStage";
import type { ExportPackage, ExportPackageItem } from "@/app/_lib/integrations/types";
import { safeExportName } from "@/app/_lib/integrations/safeExportName";

function pickBestTitle(args: {
  caseTitle: string | null | undefined;
  filingTitle: string | null | undefined;
}): string | null {
  const a = (args.caseTitle ?? "").trim();
  if (a) return a;
  const b = (args.filingTitle ?? "").trim();
  if (b) return b;
  return null;
}

function buildBaseName(args: {
  workspaceName: string;
  submissionId: string;
  title: string | null;
  referenceCode?: string | null;
}): string {
  const ws = safeExportName(args.workspaceName, { maxLen: 48 });
  const title = args.title ? safeExportName(args.title, { maxLen: 64 }) : "Submission";
  const ref = (args.referenceCode ?? "").trim();
  const idTail = args.submissionId.slice(-6);
  const suffix = ref ? safeExportName(ref, { maxLen: 24 }) : idTail;
  return safeExportName(`${ws} - ${title} - ${suffix}`, { maxLen: 110 });
}

export function buildExportPackage(args: {
  submissionId: string;
  decryptedFiling?: DecryptedFilingReadout;
  caseMeta: WorkspaceCase;
  attachments: SubmissionAttachment[];
  status: CaseStatus;
  workspaceName: string;
}): ExportPackage {
  const { submissionId, decryptedFiling, caseMeta, attachments, status, workspaceName } = args;

  const destination = getExportDestinationForStage(status);
  const title = pickBestTitle({ caseTitle: caseMeta.title, filingTitle: decryptedFiling?.title });
  const baseName = buildBaseName({
    workspaceName,
    submissionId,
    title,
    referenceCode: caseMeta.referenceCode,
  });

  const items: ExportPackageItem[] = [];

  const filingBody = (decryptedFiling?.body ?? "").trim();
  if (filingBody) {
    items.push({
      kind: "docx",
      filename: `${baseName}.docx`,
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      planned: true,
      source: "docx_export",
    });
  }

  for (const a of attachments ?? []) {
    items.push({
      kind: "attachment",
      attachmentId: a.id,
      filename: a.name,
      mimeType: a.mimeType,
      size: a.size,
      storagePath: a.storagePath,
      uploadedAt: a.uploadedAt,
      planned: true,
      source: "supabase_attachment",
    });
  }

  const pkg: ExportPackage = {
    submissionId,
    status,
    destination,
    baseName,
    metadata: {
      workspaceName,
      reporterName: caseMeta.reporterName ?? caseMeta.reporterSourceName ?? null,
      title,
      status,
      submittedAt: caseMeta.createdAt ?? null,
      assignedOwner: caseMeta.assignedOwnerName ?? null,
    },
    items,
  };

  assertExportPackage(pkg);
  return pkg;
}

export function assertExportPackage(pkg: ExportPackage): void {
  if (!pkg.submissionId.trim()) throw new Error("Invalid export package: missing submissionId");
  if (!pkg.baseName.trim()) throw new Error("Invalid export package: missing baseName");
  if (!pkg.destination.provider) throw new Error("Invalid export package: missing destination provider");
  for (const item of pkg.items) {
    if (!item.filename.trim()) throw new Error("Invalid export package: item missing filename");
  }
}

