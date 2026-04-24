import {
  pickReporterSourceLabelFromRecord,
  pickSubmittedTitleFromRecord,
} from "@/app/_lib/caseWorkspaceModel";
import type { SubmissionAttachment } from "@/app/_lib/caseWorkspaceModel";
import { extractSubmissionAttachments } from "@/app/_lib/attachments/extractSubmissionAttachments";

export type DecryptedFilingReadout = {
  title: string | null;
  body: string;
  sourceLabel: string | null;
  attachments: SubmissionAttachment[];
};

export type CachedCaseFiling = DecryptedFilingReadout & { fp: string };

export function payloadFingerprint(encryptedPayload: string): string {
  const p = encryptedPayload.trim();
  return `${p.length}:${p.slice(0, 64)}`;
}

/**
 * Same parsing rules as the detail panel "Title as filed" / "Their words" blocks:
 * title and source come from the decrypted JSON object using the same field precedence
 * as Firestore top-level pickers where applicable.
 */
export function extractDecryptedFiling(data: unknown): DecryptedFilingReadout {
  if (data === null || data === undefined) {
    return { title: null, body: "", sourceLabel: null, attachments: [] };
  }
  if (typeof data === "string") {
    const body = data.trim();
    return { title: null, body, sourceLabel: null, attachments: [] };
  }
  if (typeof data === "object" && !Array.isArray(data)) {
    const o = data as Record<string, unknown>;
    const rawTitle = pickSubmittedTitleFromRecord(o);
    const title = rawTitle.trim() ? rawTitle : null;
    const sourceLabel = pickReporterSourceLabelFromRecord(o);
    const attachments = extractSubmissionAttachments(o);
    const bodyKeys = [
      "body",
      "message",
      "content",
      "text",
      "description",
      "reportBody",
      "report_body",
      "details",
      "report",
      "story",
      "narrative",
    ];
    let body = "";
    for (const k of bodyKeys) {
      const v = o[k];
      if (typeof v === "string" && v.trim()) {
        body = v.trim();
        break;
      }
    }
    if (!body) {
      try {
        body = JSON.stringify(data, null, 2);
      } catch {
        body = String(data);
      }
    }
    return { title, body, sourceLabel, attachments };
  }
  return { title: null, body: String(data), sourceLabel: null, attachments: [] };
}
