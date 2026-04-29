import type { DocumentData } from "firebase/firestore";
import { extractSubmissionAttachments } from "@/app/_lib/attachments/extractSubmissionAttachments";

/** Approved operational status (UI + future Firestore `caseStatus`). */
export const CASE_STATUS_KEYS = [
  "new",
  "needs_triage",
  "assigned",
  "in_review",
  "waiting_follow_up",
  "resolved",
  "archived",
] as const;

export type CaseStatus = (typeof CASE_STATUS_KEYS)[number];

const CASE_STATUS_SET = new Set<string>(CASE_STATUS_KEYS);

export const CASE_STATUS_LABEL: Record<CaseStatus, string> = {
  new: "Raw Materials",
  needs_triage: "First Editing",
  assigned: "Second Editing",
  in_review: "Proofreading",
  waiting_follow_up: "Designed",
  resolved: "Published",
  archived: "Archive",
};

export const PRIORITY_KEYS = ["low", "normal", "high", "critical"] as const;
export type PriorityLevel = (typeof PRIORITY_KEYS)[number];
const PRIORITY_SET = new Set<string>(PRIORITY_KEYS);

export const PRIORITY_LABEL: Record<PriorityLevel, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  critical: "Critical",
};

export type OwnerType = "person" | "team" | null;

export type SubmissionAttachment = {
  id: string;
  name: string;
  mimeType: string | null;
  size: number | null;
  /** Supabase Storage object path within the bucket. */
  storagePath: string;
  /** ISO string when available. */
  uploadedAt: string | null;
  /** Legacy or compatibility download URL (not required when storagePath exists). */
  downloadUrl?: string | null;
  raw: unknown;
};

/** Normalized case for dashboard UI (see product blueprint). */
export type WorkspaceCase = {
  id: string;
  referenceCode: string;
  title: string;
  summary: string | null;
  protectedMessagePreview: string | null;
  encryptedPayload: string | null;
  status: CaseStatus;
  priority: PriorityLevel;
  /** Optional due date for operational SLAs (ISO string when available). */
  dueDate: string | null;
  assignedOwnerId: string | null;
  assignedOwnerName: string | null;
  assignedOwnerType: OwnerType;
  createdAt: string | null;
  updatedAt: string | null;
  reviewedAt: string | null;
  resolvedAt: string | null;
  archivedAt: string | null;
  internalNote: string;
  /** Reporter or source label from the submission document, if any. */
  reporterSourceName: string | null;
  /** Top-level reporter identity from mobile / intake (Firestore). */
  reporterName: string | null;
  reporterRegion: string | null;
  reporterPhone: string | null;
  reporterAlias: string | null;
  sourceChannel: string | null;
  /** Original Firestore processingStatus (API compatibility). */
  processingStatus: string | null;
  /** Original workflow / channel field. */
  workflowStatus: string | null;
  attachments: SubmissionAttachment[];
  raw: DocumentData;
};

export type CaseQueueSnapshot = {
  id: string;
  status: CaseStatus;
  assignedOwnerId: string | null;
  assignedOwnerName: string | null;
};

export type SidebarViewKey =
  | "inbox"
  | "needs_lead"
  | "assigned_work"
  | "new"
  | "needs_triage"
  | "assigned"
  | "in_review"
  | "waiting_follow_up"
  | "resolved"
  | "archive"
  | "team"
  | "analytics";

const SIDEBAR_KEYS = new Set<string>([
  "inbox",
  "needs_lead",
  "assigned_work",
  "new",
  "needs_triage",
  "assigned",
  "in_review",
  "waiting_follow_up",
  "resolved",
  "archive",
  "team",
  "analytics",
]);

function str(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

function tokenize(s: string): string {
  return s.trim().toLowerCase().replace(/[\s-]+/g, "_").replace(/_+/g, "_");
}

/** Legacy / transitional tokens → approved enum (client-side only). */
const LEGACY_STATUS_MAP: Record<string, CaseStatus> = {
  queued: "new",
  new: "new",
  new_report: "new",
  draft: "new",
  needs_review: "needs_triage",
  needs_triage: "needs_triage",
  triage: "needs_triage",
  assigned: "assigned",
  in_review: "in_review",
  investigating: "in_review",
  waiting_follow_up: "waiting_follow_up",
  waiting_followup: "waiting_follow_up",
  waiting: "waiting_follow_up",
  verified: "resolved",
  resolved: "resolved",
  complete: "resolved",
  closed: "archived",
  archived: "archived",
};

export function normalizeCaseStatus(data: DocumentData, processingStatus: string | null): CaseStatus {
  const fromField = str(data.caseStatus);
  if (fromField) {
    const t = tokenize(fromField);
    if (CASE_STATUS_SET.has(t)) return t as CaseStatus;
    if (LEGACY_STATUS_MAP[t]) return LEGACY_STATUS_MAP[t];
  }
  const p = processingStatus ? tokenize(processingStatus) : "";
  if (p && LEGACY_STATUS_MAP[p]) return LEGACY_STATUS_MAP[p];
  if (p === "in_review") return "in_review";
  if (p === "verified") return "resolved";
  if (p) return LEGACY_STATUS_MAP[p] ?? "new";
  return "new";
}

export function normalizePriority(data: DocumentData): PriorityLevel {
  const p = str(data.priority);
  if (!p) return "normal";
  const t = tokenize(p);
  if (PRIORITY_SET.has(t)) return t as PriorityLevel;
  const lower = p.toLowerCase();
  if (lower === "medium") return "normal";
  if (lower === "urgent") return "critical";
  return "normal";
}

function timestampToIso(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "object" && v !== null) {
    const d = v as { toDate?: () => Date; seconds?: number };
    if (typeof d.toDate === "function") {
      try {
        return d.toDate()!.toISOString();
      } catch {
        return null;
      }
    }
    if (typeof d.seconds === "number") {
      try {
        return new Date(d.seconds * 1000).toISOString();
      } catch {
        return null;
      }
    }
  }
  return null;
}

function referenceFromId(id: string): string {
  const alnum = id.replace(/[^a-zA-Z0-9]/g, "");
  const tail = (alnum.slice(-5) || "00000").toUpperCase();
  return `CASE-${tail.padStart(5, "0").slice(-5)}`;
}

function payloadString(data: DocumentData): string | null {
  const ep = data.encryptedPayload;
  if (typeof ep === "string" && ep.trim()) return ep;
  return null;
}

function normalizeSubmissionAttachments(data: DocumentData): SubmissionAttachment[] {
  return extractSubmissionAttachments(data as unknown);
}

export function parseOwnerFromDocument(data: DocumentData): {
  assignedOwnerId: string | null;
  assignedOwnerName: string | null;
  assignedOwnerType: OwnerType;
} {
  const id = str(data.assignedOwnerId);
  let name = str(data.assignedOwnerName);
  let type = str(data.assignedOwnerType) as OwnerType | null;
  if (type !== "person" && type !== "team") type = null;

  const legacy = data.assignedOwner;
  if (!name && legacy && typeof legacy === "object" && !Array.isArray(legacy)) {
    const o = legacy as Record<string, unknown>;
    const staff = str(o.staffName);
    const team = str(o.teamName);
    if (staff) {
      name = staff;
      type = team ? "person" : "person";
    } else if (team) {
      name = team;
      type = "team";
    }
  } else if (!name && typeof legacy === "string" && legacy.trim()) {
    name = legacy.trim();
    type = "person";
  }

  return {
    assignedOwnerId: id,
    assignedOwnerName: name,
    assignedOwnerType: type,
  };
}

/** True when the UI shows no assignee name (no visible lead on the card). */
export function caseHasNoVisibleLead(c: WorkspaceCase): boolean {
  return !c.assignedOwnerName?.trim();
}

/** Top-level or decrypted JSON keys that may hold the reporter-submitted title (order = precedence). */
const SUBMITTED_TITLE_FIELD_KEYS = [
  "title",
  "subject",
  "headline",
  "reportTitle",
  "report_title",
  "storyTitle",
  "story_title",
] as const;

/** First non-empty trimmed title-like field on a submission or decrypted payload object. */
export function pickSubmittedTitleFromRecord(r: Record<string, unknown>): string {
  for (const k of SUBMITTED_TITLE_FIELD_KEYS) {
    const s = str(r[k]);
    if (s) return s;
  }
  return "";
}

const REPORTER_SOURCE_FLAT_KEYS = [
  "reporterName",
  "reporter_name",
  "reporterDisplayName",
  "reporter_display_name",
  "sourceName",
  "source_name",
  "sourceLabel",
  "source_label",
  "submitterName",
  "submitter_name",
  "contactName",
  "contact_name",
  "senderName",
  "sender_name",
] as const;

/** Reporter / source display string on a submission document or decrypted payload object. */
export function pickReporterSourceLabelFromRecord(r: Record<string, unknown>): string | null {
  for (const k of REPORTER_SOURCE_FLAT_KEYS) {
    const s = str(r[k]);
    if (s) return s;
  }
  const rep = r.reporter;
  if (rep && typeof rep === "object" && !Array.isArray(rep)) {
    const o = rep as Record<string, unknown>;
    for (const k of ["displayName", "name", "label", "alias"] as const) {
      const s = str(o[k]);
      if (s) return s;
    }
  }
  const source = r.source;
  if (source && typeof source === "object" && !Array.isArray(source)) {
    const o = source as Record<string, unknown>;
    for (const k of ["name", "label", "title"] as const) {
      const s = str(o[k]);
      if (s) return s;
    }
  }
  if (typeof r.source === "string") {
    const s = str(r.source);
    if (s) return s;
  }
  return null;
}

function pickSubmittedTitleFromDocument(data: DocumentData): string {
  return pickSubmittedTitleFromRecord(data as Record<string, unknown>);
}

function pickReporterSourceNameFromDocument(data: DocumentData): string | null {
  return pickReporterSourceLabelFromRecord(data as Record<string, unknown>);
}

/** Submission time for card metadata (locale-aware). */
export function formatSubmissionTimestampForCard(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/** Primary headline for cards and detail headers — reporter title verbatim, or a single fallback. */
export function editorialCardHeadline(c: WorkspaceCase): string {
  const t = c.title.trim();
  if (!t) return "New incoming report";
  return t;
}

export function ownerDisplayLine(c: WorkspaceCase): string {
  if (!c.assignedOwnerName?.trim() && !c.assignedOwnerId) return "Unassigned";
  const raw = c.assignedOwnerName?.trim();
  if (!raw) return "Unassigned";
  // Prefer a friendly display string when legacy assignments stored raw emails.
  const looksLikeEmail = raw.includes("@") && !raw.includes(" ");
  if (looksLikeEmail) {
    const local = raw.slice(0, raw.indexOf("@")).replace(/[._-]+/g, " ").trim();
    if (local) {
      return local
        .split(/\s+/g)
        .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
        .join(" ");
    }
  }
  return raw;
}

export function normalizeSubmissionToCase(id: string, data: DocumentData): WorkspaceCase {
  const processingStatus = str(data.processingStatus);
  const workflowStatus = str(data.workflowStatus);
  const status = normalizeCaseStatus(data, processingStatus);
  const priority = normalizePriority(data);
  const owner = parseOwnerFromDocument(data);
  const enc = payloadString(data);
  const attachments = normalizeSubmissionAttachments(data);

  const title = pickSubmittedTitleFromDocument(data);
  const reporterSourceName = pickReporterSourceNameFromDocument(data);
  const summary =
    str(data.summary) ??
    "No summary has been added yet. Ask a colleague or check the filing when editors have routed it.";

  return {
    id,
    referenceCode: str(data.referenceCode) ?? referenceFromId(id),
    title,
    summary,
    protectedMessagePreview: enc
      ? "Editors read the full filing once this leaves triage."
      : null,
    encryptedPayload: enc,
    status,
    priority,
    dueDate: timestampToIso(data.dueDate),
    assignedOwnerId: owner.assignedOwnerId,
    assignedOwnerName: owner.assignedOwnerName,
    assignedOwnerType: owner.assignedOwnerType,
    createdAt: timestampToIso(data.createdAt),
    updatedAt: timestampToIso(data.updatedAt),
    reviewedAt: timestampToIso(data.reviewedAt),
    resolvedAt: timestampToIso(data.resolvedAt),
    archivedAt: timestampToIso(data.archivedAt),
    internalNote: typeof data.reviewerNote === "string" ? data.reviewerNote : "",
    reporterSourceName,
    reporterName: str(data.reporterName),
    reporterRegion: str(data.reporterRegion),
    reporterPhone: str(data.reporterPhone),
    reporterAlias: str(data.reporterAlias),
    sourceChannel: str(data.sourceChannel) ?? workflowStatus,
    processingStatus,
    workflowStatus,
    attachments,
    raw: data,
  };
}

export function toCaseQueueSnapshot(c: WorkspaceCase): CaseQueueSnapshot {
  return {
    id: c.id,
    status: c.status,
    assignedOwnerId: c.assignedOwnerId,
    assignedOwnerName: c.assignedOwnerName,
  };
}

export function normalizeSidebarView(raw: string | null): SidebarViewKey {
  if (raw && SIDEBAR_KEYS.has(raw)) return raw as SidebarViewKey;
  const t = (raw ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (t === "needs_lead" || t === "needslead" || t === "unassigned") return "needs_lead";
  if (t === "assigned_work" || t === "assignedwork" || t === "with_lead") return "assigned_work";
  if (t === "raw" || t === "raw_materials") return "new";
  if (t === "edit1" || t === "first_editing") return "needs_triage";
  if (t === "edit2" || t === "second_editing") return "assigned";
  if (t === "proof" || t === "proofreading") return "in_review";
  if (t === "design" || t === "designed") return "waiting_follow_up";
  if (t === "published") return "resolved";
  if (t === "archive" || t === "archived") return "archive";
  return "inbox";
}

export function rowMatchesSidebarView(row: CaseQueueSnapshot, view: SidebarViewKey): boolean {
  if (view === "team" || view === "analytics") return false;
  if (view === "needs_lead") {
    const hasOwner = !!(row.assignedOwnerId?.trim() || row.assignedOwnerName?.trim());
    return !hasOwner && row.status !== "archived";
  }
  if (view === "assigned_work") {
    const hasOwner = !!(row.assignedOwnerId?.trim() || row.assignedOwnerName?.trim());
    return hasOwner && row.status !== "archived";
  }
  switch (view) {
    case "inbox":
      return row.status !== "archived";
    case "new":
      return row.status === "new";
    case "needs_triage":
      return row.status === "needs_triage";
    case "assigned":
      return row.status === "assigned";
    case "in_review":
      return row.status === "in_review";
    case "waiting_follow_up":
      return row.status === "waiting_follow_up";
    case "resolved":
      return row.status === "resolved";
    case "archive":
      return row.status === "archived";
    default:
      return false;
  }
}

export function statusBadgeClass(status: CaseStatus): string {
  if (status === "new") return "badge badge-new";
  if (status === "needs_triage") return "badge badge-triage";
  if (status === "in_review") return "badge badge-review";
  if (status === "waiting_follow_up") return "badge badge-followup";
  if (status === "resolved") return "badge badge-resolved";
  if (status === "archived") return "badge badge-archived";
  return "badge badge-neutral";
}

export function priorityBadgeClass(p: PriorityLevel): string {
  if (p === "critical" || p === "high") return "badge badge-review";
  if (p === "low") return "badge badge-neutral";
  return "badge badge-route";
}

export const MOCK_OWNER_OPTIONS: { id: string; name: string; type: "person" | "team" }[] = [
  { id: "desk-verification", name: "Verification Desk", type: "team" },
  { id: "desk-editorial", name: "Editorial Desk", type: "team" },
  { id: "team-security", name: "Security Team", type: "team" },
  { id: "desk-legal", name: "Legal Desk", type: "team" },
  { id: "person-mohamed", name: "Mohamed", type: "person" },
];
