import type { DocumentData } from "firebase/firestore";
import type {
  WorkspaceCase,
  CaseStatus,
  OwnerType,
  SubmissionAttachment,
} from "@/app/_lib/caseWorkspaceModel";
import type { DecryptedFilingReadout } from "@/app/_lib/decryptedSubmissionReadout";

export type WorkflowItemSource = {
  /** Stable source key for analytics/routing (e.g. "submissions"). */
  key: "submissions";
  /** Human label derived from payload or document when available. */
  label: string | null;
  /** Optional channel identifier (e.g. email/web/form) from the document. */
  channel: string | null;
};

export type WorkflowItemAssignment = {
  ownerId: string | null;
  ownerName: string | null;
  ownerType: OwnerType;
};

export type WorkflowItemTimestamps = {
  createdAt: string | null;
  updatedAt: string | null;
  reviewedAt: string | null;
  resolvedAt: string | null;
  archivedAt: string | null;
};

export type WorkflowItemAttachment = {
  id?: string;
  name?: string;
  contentType?: string;
  url?: string;
  sizeBytes?: number;
  storagePath?: string;
  uploadedAt?: string | null;
  /** Original raw entry for future adapters. */
  raw: unknown;
};

export type WorkflowItem = {
  id: string;
  status: CaseStatus;
  assignment: WorkflowItemAssignment;
  timestamps: WorkflowItemTimestamps;
  source: WorkflowItemSource;
  /** Human reference used in UI and audit trails. */
  ref: string;
  attachments: WorkflowItemAttachment[];
  /** Adapter-specific payload for migration periods. */
  rawSubmission: DocumentData;
};

function normalizeAttachmentsFromCase(list: SubmissionAttachment[]): WorkflowItemAttachment[] {
  return list.map((a) => ({
    id: a.id,
    name: a.name,
    contentType: a.mimeType ?? undefined,
    url: a.downloadUrl ?? undefined,
    sizeBytes: a.size ?? undefined,
    storagePath: a.storagePath,
    uploadedAt: a.uploadedAt,
    raw: a.raw,
  }));
}

/**
 * Adapter: normalize current "submission/case" document to a generic workflow item.
 * This is intentionally a thin shim — future sources should also map into `WorkflowItem`.
 */
export function mapSubmissionToItem(args: {
  submission: WorkspaceCase;
  decryptedFiling?: DecryptedFilingReadout;
}): WorkflowItem {
  const { submission, decryptedFiling } = args;
  return {
    id: submission.id,
    status: submission.status,
    assignment: {
      ownerId: submission.assignedOwnerId,
      ownerName: submission.assignedOwnerName,
      ownerType: submission.assignedOwnerType,
    },
    timestamps: {
      createdAt: submission.createdAt,
      updatedAt: submission.updatedAt,
      reviewedAt: submission.reviewedAt,
      resolvedAt: submission.resolvedAt,
      archivedAt: submission.archivedAt,
    },
    source: {
      key: "submissions",
      label: decryptedFiling?.sourceLabel ?? submission.reporterSourceName ?? null,
      channel: submission.sourceChannel ?? null,
    },
    ref: submission.referenceCode,
    attachments: normalizeAttachmentsFromCase(submission.attachments ?? []),
    rawSubmission: submission.raw,
  };
}

