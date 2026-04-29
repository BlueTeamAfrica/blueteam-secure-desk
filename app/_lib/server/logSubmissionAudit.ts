import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/app/_lib/server/firebaseAdmin";

export type SubmissionAuditAction =
  | "decrypt"
  | "mark_in_review"
  | "mark_verified"
  | "save_reviewer_note"
  | "assign_owner"
  | "update_case_status"
  | "update_priority"
  | "update_due_date"
  | "export_docx"
  | "download_attachment"
  | "delete";

export async function logSubmissionAudit(params: {
  submissionId: string;
  adminUid: string;
  adminEmail: string | null;
  action: SubmissionAuditAction;
  details?: Record<string, unknown>;
}): Promise<void> {
  const db = getAdminFirestore();
  await db.collection("submissionAudit").add({
    submissionId: params.submissionId,
    adminUid: params.adminUid,
    adminEmail: params.adminEmail,
    action: params.action,
    ...(params.details !== undefined ? { details: params.details } : {}),
    createdAt: FieldValue.serverTimestamp(),
  });
}
